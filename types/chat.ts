/**
 * Nexus Chat : un assistant (Claude) qui répond aux joueurs et agit sur leur
 * compte avec les outils du serveur MCP. Ce que le site, l'app de bureau et
 * l'admin se disent de l'accès, du budget et des conversations.
 *
 * Les montants sont en microdollars (millionièmes de dollar US), entiers :
 * un appel de Haiku coûte quelques centièmes de centime, et des flottants
 * cumulés dériveraient.
 */

/** Les modèles que l'admin peut choisir, du moins cher au plus capable. */
export const CHAT_MODEL_IDS = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
] as const;

export type ChatModelId = (typeof CHAT_MODEL_IDS)[number];

export const DEFAULT_CHAT_MODEL: ChatModelId = "claude-haiku-5-5";

export const CHAT_MODEL_LABELS: Record<ChatModelId, string> = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
};

export function isChatModelId(value: unknown): value is ChatModelId {
  return (
    typeof value === "string" &&
    (CHAT_MODEL_IDS as readonly string[]).includes(value)
  );
}

export const MICROS_PER_USD = 1_000_000;

/** Budget mensuel proposé par défaut quand l'admin ouvre l'accès : 2 $. */
export const DEFAULT_MONTHLY_BUDGET_MICROS = 2 * MICROS_PER_USD;

/** Plafond d'un budget mensuel saisi dans l'admin : 1 000 $. */
export const MAX_MONTHLY_BUDGET_MICROS = 1000 * MICROS_PER_USD;

/**
 * Où en est l'accès d'un joueur.
 * - `none` : jamais demandé, ni ouvert ;
 * - `requested` : demandé, en attente de l'admin ;
 * - `granted` : ouvert ;
 * - `revoked` : refusé ou retiré par l'admin.
 */
export type ChatAccessStatus = "none" | "requested" | "granted" | "revoked";

/** Ce que le joueur voit de son accès : `GET /api/chat/status`. */
export interface ChatStatus {
  /** Le chat est-il ouvert sur le site (interrupteur général de l'admin). */
  enabled: boolean;
  status: ChatAccessStatus;
  /** Budget du mois, consommé, restant (microdollars). */
  monthlyBudgetMicros: number;
  spentMicros: number;
  remainingMicros: number;
  /** Date (ISO) où le budget repart : le 1er du mois suivant, minuit UTC. */
  resetsAt: string;
  model: ChatModelId;
}

/** Une conversation dans la liste : `GET /api/chat/conversations`. */
export interface ChatConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

/** Les métadonnées que le serveur joint à chaque réponse de l'assistant. */
export interface ChatMessageMetadata {
  /** Ce que la réponse a coûté (microdollars). */
  costMicros?: number;
  /** Ce qui reste du budget du mois après elle. */
  remainingMicros?: number;
  /** La réponse s'est arrêtée parce que le budget est épuisé. */
  budgetExhausted?: boolean;
}

/** Longueur maximale d'un message du joueur. */
export const CHAT_MESSAGE_MAX_LENGTH = 8000;

/** Longueur maximale d'un titre de conversation. */
export const CHAT_TITLE_MAX_LENGTH = 80;

/** Identifiant d'une conversation : opaque, choisi par le client. */
export const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Les erreurs que `POST /api/chat` rend en JSON, avant tout flux. */
export type ChatErrorCode =
  | "unauthorized"
  | "disabled"
  | "no_access"
  | "budget_exhausted"
  | "invalid_request"
  | "not_found"
  | "unavailable";
