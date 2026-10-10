import { NextResponse } from "next/server";
import { getUserLocale } from "@/i18n/locale";
import { readWav, transcribeVoice } from "@/lib/chat/voice";
import {
  recordVoiceUsage,
  voiceContext,
  voiceConversationId,
  voiceError,
} from "@/lib/chat/voice-request";
import { CHAT_VOICE_MAX_SECONDS } from "@/types/chat";

/**
 * POST /api/chat/transcribe?id=<conversation>
 * Ce que le joueur a dit, en texte : le corps est un WAV PCM 16 bits
 * (`audio/wav`) d'une minute au plus. Le coût va dans son budget du mois.
 * Sert le site et l'app de bureau.
 *
 * Réponse : { text, costMicros, remainingMicros }.
 */
export const maxDuration = 60;

/** Un peu plus qu'une minute de WAV à 16 kHz mono, et sa marge. */
const MAX_BYTES = 4 * 1024 * 1024;

/** En dessous, ce n'est qu'un clic sur la touche. */
const MIN_SECONDS = 0.3;

export async function POST(request: Request) {
  const context = await voiceContext();
  if (context instanceof NextResponse) return context;

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return voiceError("too_long", 413);
  let audio: Uint8Array;
  try {
    audio = new Uint8Array(await request.arrayBuffer());
  } catch {
    return voiceError("invalid_request", 400);
  }
  if (audio.length > MAX_BYTES) return voiceError("too_long", 413);
  const wav = readWav(audio);
  if (!wav) return voiceError("invalid_request", 400);
  if (wav.seconds < MIN_SECONDS) return voiceError("too_short", 400);
  if (wav.seconds > CHAT_VOICE_MAX_SECONDS + 1) {
    return voiceError("too_long", 413);
  }

  try {
    const { text, usage } = await transcribeVoice({
      audio,
      seconds: wav.seconds,
      locale: await getUserLocale(),
      playerName: context.userName,
      voice: context.voice,
      abortSignal: request.signal,
    });
    await recordVoiceUsage(
      context.userId,
      voiceConversationId(request),
      "transcription",
      usage,
    );
    return NextResponse.json({
      text,
      costMicros: usage.costMicros,
      remainingMicros: Math.max(0, context.remainingMicros - usage.costMicros),
    });
  } catch (cause) {
    console.error({ message: "Nexus Chat: transcription failed", cause });
    return voiceError("unavailable", 503);
  }
}
