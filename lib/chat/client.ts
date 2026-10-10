import { isToolUIPart, type UIMessage } from "ai";
import type { ChatErrorCode, ChatMessageMetadata } from "@/types/chat";

/** Les messages tels que `useChat` les tient, côté navigateur. */
export type ChatUIMessage = UIMessage<ChatMessageMetadata>;

/** Un identifiant de conversation neuf (`CHAT_ID_PATTERN`). */
export function newChatId(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

const KNOWN_ERRORS: ChatErrorCode[] = [
  "unauthorized",
  "disabled",
  "no_access",
  "budget_exhausted",
  "invalid_request",
  "not_found",
  "busy",
  "unavailable",
];

/**
 * Le code d'une erreur de `useChat` : le corps JSON que rend `POST /api/chat`
 * avant tout flux, sinon `generic` (réseau, erreur au milieu d'une réponse).
 */
export function chatErrorCode(
  error: Error | undefined,
): ChatErrorCode | "generic" {
  if (!error) return "generic";
  try {
    const code = (JSON.parse(error.message) as { error?: unknown })?.error;
    if (KNOWN_ERRORS.includes(code as ChatErrorCode)) {
      return code as ChatErrorCode;
    }
  } catch {
    // Pas du JSON : une erreur du flux ou du réseau.
  }
  return "generic";
}

/** Un nom d'outil MCP lisible : `search_items` → `search items`. */
export function toolLabel(name: string): string {
  return name.replaceAll("_", " ");
}

/**
 * Le message contient-il une écriture confirmée par le joueur ? Elle a été
 * faite : « Réessayer » la referait, il n'est donc pas proposé.
 */
export function hasConfirmedWrite(message: ChatUIMessage | undefined): boolean {
  return (
    message?.parts.some(
      (part) =>
        isToolUIPart(part) &&
        "approval" in part &&
        part.approval?.approved === true,
    ) ?? false
  );
}

/** « Arrêter » : le serveur arrête la réponse en cours après son étape. */
export function requestChatStop(): void {
  void fetch("/api/chat/stop", { method: "POST" }).catch(() => {});
}
