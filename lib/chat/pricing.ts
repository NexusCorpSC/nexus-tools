import type { LanguageModelUsage } from "ai";
import {
  CHAT_SPEECH_MODEL_IDS,
  isChatModelId,
  type ChatModelId,
  type ChatSpeechModelId,
} from "@/types/chat";

/**
 * Ce que coûte une réponse, à partir de l'usage en jetons que l'API rend.
 *
 * Les tarifs sont en dollars par million de jetons. Ceux des modèles au choix
 * de l'admin se règlent dans `/admin/chat` (gardés dans le document `chat` de
 * `settings`) ; les valeurs ci-dessous sont celles qu'Anthropic publie
 * (https://claude.com/pricing), relevées en octobre 2026, et servent tant que
 * l'admin n'a rien enregistré. L'écriture du cache (TTL de 5 minutes, le seul
 * que le chat utilise) coûte 1,25 fois l'entrée ; la lecture, la part propre
 * à chaque modèle.
 */
export interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelPricing extends Rates {
  /** Haiku 5.5 : au-delà de ce nombre de jetons d'entrée, l'autre grille. */
  longContext?: { threshold: number } & Rates;
}

/** Les tarifs des modèles au choix de l'admin. */
export type ChatPricing = Record<ChatModelId, ModelPricing>;

export const DEFAULT_CHAT_PRICING: ChatPricing = {
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheRead: 0.01,
    cacheWrite: 0.125,
    longContext: {
      threshold: 100_000,
      input: 0.5,
      output: 2.5,
      cacheRead: 0.05,
      cacheWrite: 0.625,
    },
  },
  "claude-sonnet-5-5": {
    input: 2,
    output: 10,
    cacheRead: 0.2,
    cacheWrite: 2.5,
  },
  "claude-opus-5-5": {
    input: 4,
    output: 20,
    cacheRead: 0.2,
    cacheWrite: 5,
  },
};

/** Plafond d'un tarif saisi dans l'admin : 1 000 $ par million de jetons. */
export const MAX_RATE_USD = 1000;

const RATE_KEYS = ["input", "output", "cacheRead", "cacheWrite"] as const;

function parseRates(value: unknown): Rates | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rates = {} as Rates;
  for (const key of RATE_KEYS) {
    const raw = record[key];
    const rate = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
    if (
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > MAX_RATE_USD
    ) {
      return null;
    }
    rates[key] = rate;
  }
  return rates;
}

/**
 * Une grille de tarifs lue en base ou saisie dans l'admin, ou `null` si une
 * valeur ne tient pas (absente, négative, au-delà de `MAX_RATE_USD`, ou un
 * seuil de contexte long qui n'est pas un entier positif).
 */
export function parseChatPricing(value: unknown): ChatPricing | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const pricing = {} as ChatPricing;
  for (const model of Object.keys(DEFAULT_CHAT_PRICING) as ChatModelId[]) {
    const entry = record[model] as Record<string, unknown> | undefined;
    const rates = parseRates(entry);
    if (!rates) return null;
    const pricingOfModel: ModelPricing = { ...rates };
    if (entry?.longContext) {
      const long = entry.longContext as Record<string, unknown>;
      const longRates = parseRates(long);
      const threshold = Number(long.threshold);
      if (!longRates || !Number.isInteger(threshold) || threshold <= 0) {
        return null;
      }
      pricingOfModel.longContext = { threshold, ...longRates };
    }
    pricing[model] = pricingOfModel;
  }
  return pricing;
}

export interface TokenCounts {
  /** Entrée hors cache. */
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Les quatre comptes d'un usage de l'AI SDK, à zéro quand ils manquent. */
export function tokenCounts(usage: LanguageModelUsage): TokenCounts {
  const cacheReadTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWriteTokens = usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  const noCache =
    usage.inputTokenDetails?.noCacheTokens ??
    Math.max(0, (usage.inputTokens ?? 0) - cacheReadTokens - cacheWriteTokens);
  return {
    inputTokens: noCache,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens,
    cacheWriteTokens,
  };
}

/**
 * Les modèles qui peuvent servir une réponse sans être au choix de l'admin :
 * les replis d'Anthropic quand le modèle choisi refuse (`fallbacks`). Un
 * modèle inconnu est compté au tarif le plus haut, pour ne jamais sous-estimer.
 */
const OTHER_MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-fable-5-1": {
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
  },
};

const HIGHEST_PRICING = OTHER_MODEL_PRICING["claude-fable-5-1"];

function pricingOf(model: string, table: ChatPricing): ModelPricing {
  return isChatModelId(model)
    ? table[model]
    : (OTHER_MODEL_PRICING[model] ?? HIGHEST_PRICING);
}

/**
 * Le coût de `counts` au tarif de `model` dans `table` (les tarifs de
 * l'admin), en microdollars (arrondi au-dessus).
 */
export function costMicros(
  model: string,
  counts: TokenCounts,
  table: ChatPricing = DEFAULT_CHAT_PRICING,
): number {
  const pricing = pricingOf(model, table);
  const prompt =
    counts.inputTokens + counts.cacheReadTokens + counts.cacheWriteTokens;
  const rates =
    pricing.longContext && prompt > pricing.longContext.threshold
      ? pricing.longContext
      : pricing;
  // Dollars par million de jetons × jetons = microdollars.
  const micros =
    counts.inputTokens * rates.input +
    counts.outputTokens * rates.output +
    counts.cacheReadTokens * rates.cacheRead +
    counts.cacheWriteTokens * rates.cacheWrite;
  return Math.ceil(micros);
}

/** Une itération de l'usage détaillé d'Anthropic (repli serveur, compaction…). */
export interface UsageIteration {
  type: string;
  model?: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

/**
 * Le coût d'une étape. Quand le modèle principal a refusé et qu'un modèle de
 * repli a servi la réponse (`fallbacks`), Anthropic détaille l'usage par
 * itération : chacune est comptée au tarif du modèle qui l'a produite. Sinon,
 * tout l'usage est au tarif du modèle choisi.
 */
export function stepCostMicros(
  model: ChatModelId,
  usage: LanguageModelUsage,
  iterations?: UsageIteration[] | null,
  table: ChatPricing = DEFAULT_CHAT_PRICING,
): number {
  const attributed = iterations?.filter(
    (iteration) => iteration.type !== "compaction",
  );
  if (
    !attributed ||
    attributed.length === 0 ||
    !attributed.some((iteration) => iteration.model)
  ) {
    return costMicros(model, tokenCounts(usage), table);
  }
  return attributed.reduce(
    (total, iteration) =>
      total +
      costMicros(
        iteration.model ?? model,
        {
          inputTokens: iteration.inputTokens,
          outputTokens: iteration.outputTokens,
          cacheReadTokens: iteration.cacheReadInputTokens ?? 0,
          cacheWriteTokens: iteration.cacheCreationInputTokens ?? 0,
        },
        table,
      ),
    0,
  );
}

/**
 * Les tarifs de la voix (Google, API Gemini), en dollars par million de
 * jetons : l'audio compte 25 jetons par seconde, à l'entrée de la
 * transcription comme à la sortie de la synthèse. Relevés en octobre 2026
 * (https://ai.google.dev/pricing) ; Google annonce le double pour la
 * synthèse à partir du 1er janvier 2027 : à mettre à jour dans `/admin/chat`.
 */
export interface VoiceRates {
  input: number;
  output: number;
}

export interface VoicePricing {
  /** `gemini-3.5-transcribe` : l'audio en entrée, le texte en sortie. */
  transcription: VoiceRates;
  /** La synthèse : le texte en entrée, l'audio en sortie, par modèle. */
  speech: Record<ChatSpeechModelId, VoiceRates>;
}

export const DEFAULT_VOICE_PRICING: VoicePricing = {
  transcription: { input: 2, output: 12 },
  speech: {
    "gemini-3.8-flash-lite-tts": { input: 0.5, output: 6 },
    "gemini-3.8-flash-tts": { input: 0.5, output: 9 },
  },
};

/** Jetons d'audio par seconde, chez Google. */
export const AUDIO_TOKENS_PER_SECOND = 25;

function parseVoiceRates(value: unknown): VoiceRates | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const rates = {} as VoiceRates;
  for (const key of ["input", "output"] as const) {
    const raw = record[key];
    const rate = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
    if (
      typeof rate !== "number" ||
      !Number.isFinite(rate) ||
      rate < 0 ||
      rate > MAX_RATE_USD
    ) {
      return null;
    }
    rates[key] = rate;
  }
  return rates;
}

/** Les tarifs de la voix lus en base ou saisis dans l'admin, ou `null`. */
export function parseVoicePricing(value: unknown): VoicePricing | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const transcription = parseVoiceRates(record.transcription);
  if (!transcription) return null;
  const speechRecord = (record.speech ?? {}) as Record<string, unknown>;
  const speech = {} as Record<ChatSpeechModelId, VoiceRates>;
  for (const model of CHAT_SPEECH_MODEL_IDS) {
    const rates = parseVoiceRates(speechRecord[model]);
    if (!rates) return null;
    speech[model] = rates;
  }
  return { transcription, speech };
}

/** Une estimation des jetons d'un texte : 4 caractères par jeton, arrondi au-dessus. */
export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Le coût d'un usage de la voix, en microdollars (arrondi au-dessus). */
export function voiceCostMicros(
  rates: VoiceRates,
  inputTokens: number,
  outputTokens: number,
): number {
  return Math.ceil(inputTokens * rates.input + outputTokens * rates.output);
}
