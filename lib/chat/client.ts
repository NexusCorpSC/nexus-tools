import type { UIMessage } from "ai";
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
