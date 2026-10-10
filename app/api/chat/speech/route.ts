import { NextResponse } from "next/server";
import { getUserLocale } from "@/i18n/locale";
import { speakText } from "@/lib/chat/voice";
import {
  recordVoiceUsage,
  voiceContext,
  voiceConversationId,
  voiceError,
} from "@/lib/chat/voice-request";
import { CHAT_SPEECH_MAX_LENGTH } from "@/types/chat";

/**
 * POST /api/chat/speech?id=<conversation>
 * Un morceau de réponse lu à voix haute : le corps est `{ text }` (une ou
 * quelques phrases, `CHAT_SPEECH_MAX_LENGTH` caractères au plus), la réponse
 * un WAV. Le client lit la réponse morceau par morceau, pour commencer à
 * parler sans attendre la fin. Le coût va dans le budget du mois du joueur ;
 * ce qui reste est dans l'en-tête `X-Chat-Remaining-Micros`.
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  const context = await voiceContext();
  if (context instanceof NextResponse) return context;

  let body: { text?: unknown };
  try {
    body = await request.json();
  } catch {
    return voiceError("invalid_request", 400);
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return voiceError("invalid_request", 400);
  if (text.length > CHAT_SPEECH_MAX_LENGTH) return voiceError("too_long", 413);

  try {
    const { audio, mediaType, usage } = await speakText({
      text,
      locale: await getUserLocale(),
      voice: context.voice,
      abortSignal: request.signal,
    });
    await recordVoiceUsage(
      context.userId,
      voiceConversationId(request),
      "speech",
      usage,
    );
    return new NextResponse(audio as Uint8Array<ArrayBuffer>, {
      headers: {
        "Content-Type": mediaType,
        "Cache-Control": "no-store",
        "X-Chat-Cost-Micros": String(usage.costMicros),
        "X-Chat-Remaining-Micros": String(
          Math.max(0, context.remainingMicros - usage.costMicros),
        ),
      },
    });
  } catch (cause) {
    console.error({ message: "Nexus Chat: speech failed", cause });
    return voiceError("unavailable", 503);
  }
}
