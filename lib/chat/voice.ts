import "server-only";
import { google } from "@ai-sdk/google";
import { generateSpeech, transcribe } from "ai";
import {
  AUDIO_TOKENS_PER_SECOND,
  estimateTextTokens,
  voiceCostMicros,
} from "@/lib/chat/pricing";
import type { ChatVoiceSettings } from "@/lib/chat/access";
import { CHAT_TRANSCRIBE_MODEL, CHAT_VOICE_MAX_SECONDS } from "@/types/chat";

/**
 * La voix de Nexus Chat, servie par Google (API Gemini, clé
 * `GOOGLE_GENERATIVE_AI_API_KEY`) : la transcription de ce que le joueur dit,
 * et la lecture des réponses. Le coût se calcule sur la durée de l'audio
 * (25 jetons par seconde chez Google) et la longueur du texte.
 */

/** Ce qu'un appel a consommé, pour `chatUsage`. */
export interface VoiceUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

/**
 * Des noms du jeu et du site que la transcription doit reconnaître : elle
 * les préfère quand l'audio hésite entre deux mots.
 */
const VOCABULARY = [
  "Nexus Tools",
  "Nexus Chat",
  "NPS",
  "showlocation",
  "aUEC",
  "UEC",
  "SCU",
  "Star Citizen",
  "Stanton",
  "Pyro",
  "Nyx",
  "Hurston",
  "Crusader",
  "ArcCorp",
  "microTech",
  "Lorville",
  "Orison",
  "Area18",
  "New Babbage",
  "Everus Harbor",
  "Seraphim Station",
  "Baijini Point",
  "Port Tressler",
  "Grim HEX",
  "Ruin Station",
  "Checkmate",
  "Orbituary",
  "Levski",
  "Daymar",
  "Yela",
  "Cellin",
  "Aberdeen",
  "Arial",
  "Magda",
  "Ita",
  "Lyria",
  "Wala",
  "Calliope",
  "Clio",
  "Euterpe",
  "Lagrange",
  "quantum",
  "hangar",
  "Drake",
  "Anvil",
  "Aegis",
  "RSI",
  "MISC",
  "Origin",
  "Crusader Industries",
  "Argo",
  "Cutlass",
  "Carrack",
  "Constellation",
  "Freelancer",
  "Prospector",
  "Vulture",
  "Hull",
  "Caterpillar",
  "Quantainium",
  "Laranite",
  "Agricium",
  "Hadanite",
  "Aphorite",
];

const LANGUAGE_CODES: Record<string, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
};

/** Ce qu'un WAV PCM dit de lui-même : sa durée et ce qu'il contient. */
export interface WavInfo {
  sampleRate: number;
  channels: number;
  seconds: number;
}

/**
 * Lit l'en-tête d'un WAV PCM 16 bits ; `null` si ce n'en est pas un. La
 * durée vient de la taille du bloc `data` (ou de ce qui reste du fichier).
 */
export function readWav(bytes: Uint8Array): WavInfo | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (offset: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (ascii(0) !== "RIFF" || ascii(8) !== "WAVE") return null;
  let offset = 12;
  let format: { channels: number; sampleRate: number; bits: number } | null =
    null;
  while (offset + 8 <= bytes.length) {
    const id = ascii(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= bytes.length) {
      const audioFormat = view.getUint16(body, true);
      if (audioFormat !== 1) return null;
      format = {
        channels: view.getUint16(body + 2, true),
        sampleRate: view.getUint32(body + 4, true),
        bits: view.getUint16(body + 14, true),
      };
    } else if (id === "data") {
      if (
        !format ||
        format.bits !== 16 ||
        format.channels < 1 ||
        format.channels > 2 ||
        format.sampleRate < 8000 ||
        format.sampleRate > 48000
      ) {
        return null;
      }
      const length = Math.min(size, bytes.length - body);
      return {
        sampleRate: format.sampleRate,
        channels: format.channels,
        seconds: length / (format.sampleRate * format.channels * 2),
      };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Un compte de jetons rendu par Google, s'il est là et qu'il tient. */
function reportedTokens(usage: unknown, keys: string[]): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  for (const key of keys) {
    const value = (usage as Record<string, unknown>)[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
  }
  return undefined;
}

/**
 * Transcrit ce que le joueur a dit. `audio` est un WAV déjà vérifié par
 * `readWav`, de `seconds` secondes.
 */
export async function transcribeVoice({
  audio,
  seconds,
  locale,
  playerName,
  voice,
  abortSignal,
}: {
  audio: Uint8Array;
  seconds: number;
  locale: string;
  playerName: string;
  voice: ChatVoiceSettings;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; usage: VoiceUsage }> {
  const language = LANGUAGE_CODES[locale];
  const result = await transcribe({
    model: google.transcription(CHAT_TRANSCRIBE_MODEL),
    audio,
    maxRetries: 1,
    abortSignal,
    providerOptions: {
      google: {
        // La langue du site d'abord ; l'anglais pour les noms du jeu.
        languageCodes: language
          ? Array.from(new Set([language, "en-US"]))
          : undefined,
        customVocabulary: [...VOCABULARY, playerName].filter(Boolean),
        mode: "SMART",
      },
    },
  });
  const text = result.text.trim();
  const usage = result.providerMetadata?.google?.usage;
  const inputTokens =
    reportedTokens(usage, ["total_input_tokens", "input_tokens"]) ??
    Math.ceil(
      Math.min(seconds, CHAT_VOICE_MAX_SECONDS) * AUDIO_TOKENS_PER_SECOND,
    );
  const outputTokens =
    reportedTokens(usage, ["total_output_tokens", "output_tokens"]) ??
    estimateTextTokens(text);
  return {
    text,
    usage: {
      model: CHAT_TRANSCRIBE_MODEL,
      inputTokens,
      outputTokens,
      costMicros: voiceCostMicros(
        voice.pricing.transcription,
        inputTokens,
        outputTokens,
      ),
    },
  };
}

/** La consigne de ton donnée à la synthèse, dans la langue du joueur. */
const STYLE: Record<string, string> = {
  fr: "Voix calme et posée d'IA de bord de vaisseau, débit naturel.",
  en: "Calm, composed starship onboard AI voice, natural pace.",
  es: "Voz tranquila y serena de IA de a bordo de una nave, ritmo natural.",
};

/** Lit un morceau de réponse à voix haute : un WAV, et ce qu'il a coûté. */
export async function speakText({
  text,
  locale,
  voice,
  abortSignal,
}: {
  text: string;
  locale: string;
  voice: ChatVoiceSettings;
  abortSignal?: AbortSignal;
}): Promise<{ audio: Uint8Array; mediaType: string; usage: VoiceUsage }> {
  const result = await generateSpeech({
    model: google.speech(voice.speechModel),
    text,
    voice: voice.voice,
    instructions: STYLE[locale] ?? STYLE.fr,
    outputFormat: "wav",
    maxRetries: 1,
    abortSignal,
  });
  const audio = result.audio.uint8Array;
  const info = readWav(audio);
  // Sans en-tête lisible, l'audio de Google est en PCM 16 bits à 24 kHz.
  const seconds = info?.seconds ?? Math.max(0, audio.length - 44) / 48_000;
  const inputTokens = estimateTextTokens(text);
  const outputTokens = Math.ceil(seconds * AUDIO_TOKENS_PER_SECOND);
  return {
    audio,
    mediaType: result.audio.mediaType || "audio/wav",
    usage: {
      model: voice.speechModel,
      inputTokens,
      outputTokens,
      costMicros: voiceCostMicros(
        voice.pricing.speech[voice.speechModel],
        inputTokens,
        outputTokens,
      ),
    },
  };
}
