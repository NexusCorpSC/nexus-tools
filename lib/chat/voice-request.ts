import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import {
  getChatSettings,
  getChatStatus,
  hasVoiceKey,
  recordChatUsage,
  type ChatVoiceSettings,
} from "@/lib/chat/access";
import type { VoiceUsage } from "@/lib/chat/voice";
import { CHAT_ID_PATTERN, type ChatVoiceErrorCode } from "@/types/chat";

export function voiceError(code: ChatVoiceErrorCode, status: number) {
  return NextResponse.json({ error: code }, { status });
}

export interface VoiceContext {
  userId: ObjectId;
  userName: string;
  voice: ChatVoiceSettings;
  remainingMicros: number;
}

/**
 * Ce qu'une requête de la voix doit passer avant de rien coûter : la
 * session, le chat et la voix ouverts, l'accès du joueur et un budget qui
 * n'est pas épuisé. Rend le contexte, ou la réponse d'erreur.
 */
export async function voiceContext(): Promise<VoiceContext | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return voiceError("unauthorized", 401);
  const userId = new ObjectId(session.user.id);
  const settings = await getChatSettings();
  if (!settings.enabled) return voiceError("disabled", 403);
  if (!settings.voice.enabled || !hasVoiceKey()) {
    return voiceError("voice_disabled", 403);
  }
  const status = await getChatStatus(userId, settings);
  if (status.status !== "granted") return voiceError("no_access", 403);
  if (status.remainingMicros <= 0) return voiceError("budget_exhausted", 402);
  return {
    userId,
    userName: session.user.name,
    voice: settings.voice,
    remainingMicros: status.remainingMicros,
  };
}

/** La conversation d'une requête de la voix (`?id=`), ou `voice` sans elle. */
export function voiceConversationId(request: Request): string {
  const id = new URL(request.url).searchParams.get("id");
  return id && CHAT_ID_PATTERN.test(id) ? id : "voice";
}

/** Compte un appel de la voix dans le budget du joueur. */
export async function recordVoiceUsage(
  userId: ObjectId,
  conversationId: string,
  kind: "transcription" | "speech",
  usage: VoiceUsage,
): Promise<void> {
  await recordChatUsage({
    userId,
    conversationId,
    kind,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicros: usage.costMicros,
    createdAt: new Date(),
  }).catch((cause) =>
    console.error({ message: "Nexus Chat: voice usage not recorded", cause }),
  );
}
