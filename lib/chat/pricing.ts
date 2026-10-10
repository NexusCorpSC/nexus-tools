import type { LanguageModelUsage } from "ai";
import { isChatModelId, type ChatModelId } from "@/types/chat";

/**
 * Ce que coûte une réponse, à partir de l'usage en jetons que l'API rend.
 *
 * Les tarifs sont ceux qu'Anthropic publie (https://claude.com/pricing), en
 * dollars par million de jetons, relevés en octobre 2026 : à tenir à jour
 * quand ils changent. L'écriture du cache (TTL de 5 minutes, le seul que le
 * chat utilise) coûte 1,25 fois l'entrée ; la lecture, la part propre à
 * chaque modèle.
 */
interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

interface ModelPricing extends Rates {
  /** Haiku 5.5 : au-delà de ce nombre de jetons d'entrée, l'autre grille. */
  longContext?: { threshold: number } & Rates;
}

export const CHAT_PRICING: Record<ChatModelId, ModelPricing> = {
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

function pricingOf(model: string): ModelPricing {
  return isChatModelId(model)
    ? CHAT_PRICING[model]
    : (OTHER_MODEL_PRICING[model] ?? HIGHEST_PRICING);
}

/** Le coût de `counts` au tarif de `model`, en microdollars (arrondi au-dessus). */
export function costMicros(model: string, counts: TokenCounts): number {
  const pricing = pricingOf(model);
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
): number {
  const attributed = iterations?.filter(
    (iteration) => iteration.type !== "compaction",
  );
  if (
    !attributed ||
    attributed.length === 0 ||
    !attributed.some((iteration) => iteration.model)
  ) {
    return costMicros(model, tokenCounts(usage));
  }
  return attributed.reduce(
    (total, iteration) =>
      total +
      costMicros(iteration.model ?? model, {
        inputTokens: iteration.inputTokens,
        outputTokens: iteration.outputTokens,
        cacheReadTokens: iteration.cacheReadInputTokens ?? 0,
        cacheWriteTokens: iteration.cacheCreationInputTokens ?? 0,
      }),
    0,
  );
}
