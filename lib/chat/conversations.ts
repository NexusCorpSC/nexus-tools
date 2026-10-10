import "server-only";
import { isToolUIPart, type UIMessage } from "ai";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import {
  CHAT_TITLE_MAX_LENGTH,
  type ChatConversationSummary,
  type ChatMessageMetadata,
} from "@/types/chat";

/**
 * Les conversations de Nexus Chat, gardées côté serveur : le client n'envoie
 * que son nouveau message (ou ses réponses aux confirmations), l'historique
 * envoyé au modèle est celui de la base, pas celui du navigateur.
 *
 * Les messages sont au format `UIMessage` de l'AI SDK, ce que `useChat`
 * affiche, sur le site comme dans l'app.
 */
export type ChatUIMessage = UIMessage<ChatMessageMetadata>;

export interface DbChatConversation {
  /** Opaque, choisi par le client (`CHAT_ID_PATTERN`). */
  _id: string;
  userId: ObjectId;
  title: string;
  messages: ChatUIMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/** Au-delà, les plus anciens messages ne sont plus envoyés au modèle. */
export const MAX_HISTORY_MESSAGES = 60;

/**
 * La fenêtre envoyée au modèle avance par pas de tant de messages : son
 * début reste le même d'un tour à l'autre, et le cache de prompt sert.
 */
const HISTORY_STEP = 20;

/**
 * Au-delà, les plus anciens messages ne sont plus gardés : un document Mongo
 * ne dépasse pas 16 Mo, et les sorties des outils sont parfois longues.
 */
export const MAX_STORED_MESSAGES = 200;

/**
 * Les derniers messages, `max` au plus, à partir d'un message du joueur :
 * une conversation envoyée au modèle commence par le joueur. Le début
 * avance par pas de `step` messages.
 */
export function recentMessages(
  messages: ChatUIMessage[],
  max: number,
  step = 1,
): ChatUIMessage[] {
  const excess = Math.max(0, messages.length - max);
  let start = Math.ceil(excess / step) * step;
  while (start < messages.length && messages[start].role !== "user") start++;
  // Aucun message du joueur dans la fenêtre : on garde le dernier.
  if (start >= messages.length) {
    start = messages.findLastIndex((message) => message.role === "user");
  }
  return start > 0 ? messages.slice(start) : messages;
}

/** Ce que voit le modèle de la conversation. */
export function modelWindow(messages: ChatUIMessage[]): ChatUIMessage[] {
  return recentMessages(messages, MAX_HISTORY_MESSAGES, HISTORY_STEP);
}

/** Le nombre de conversations listées. */
const LIST_LIMIT = 100;

function conversations() {
  return db.db().collection<DbChatConversation>("chatConversations");
}

export async function listConversations(
  userId: ObjectId,
): Promise<ChatConversationSummary[]> {
  const rows = await conversations()
    .find({ userId }, { projection: { title: 1, updatedAt: 1 } })
    .sort({ updatedAt: -1 })
    .limit(LIST_LIMIT)
    .toArray();
  return rows.map((row) => ({
    id: row._id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** La conversation `id` du joueur, ou `null` (absente, ou à un autre joueur). */
export async function getConversation(
  userId: ObjectId,
  id: string,
): Promise<DbChatConversation | null> {
  return conversations().findOne({ _id: id, userId });
}

/** La conversation la plus récente du joueur : celle que l'overlay reprend. */
export async function getLatestConversation(
  userId: ObjectId,
): Promise<DbChatConversation | null> {
  return conversations().findOne({ userId }, { sort: { updatedAt: -1 } });
}

/**
 * Le message contient-il une écriture confirmée par le joueur (une commande,
 * une contribution…) ? Elle a été faite : la rejouer la referait.
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

/** Un titre tiré du premier message du joueur. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > CHAT_TITLE_MAX_LENGTH
    ? `${line.slice(0, CHAT_TITLE_MAX_LENGTH - 1)}…`
    : line;
}

/** Les parts qui portent quelque chose à afficher ou à renvoyer au modèle. */
function meaningful(part: ChatUIMessage["parts"][number]): boolean {
  return part.type !== "step-start" && part.type !== "custom";
}

/**
 * Ce qui est gardé des messages : sans les champs `undefined` (Mongo les
 * écrirait `null`, que l'AI SDK refuse ensuite), sans les événements bruts du
 * fournisseur (`custom`), et sans une réponse restée vide (erreur du modèle).
 */
export function cleanMessages(messages: ChatUIMessage[]): ChatUIMessage[] {
  const plain = JSON.parse(JSON.stringify(messages)) as ChatUIMessage[];
  return plain
    .map((message) => ({
      ...message,
      parts: message.parts.filter((part) => part.type !== "custom"),
    }))
    .filter(
      (message) =>
        message.role !== "assistant" || message.parts.some(meaningful),
    );
}

/**
 * Enregistre les messages de la conversation, en la créant au besoin.
 * `false` si l'identifiant est déjà pris par un autre joueur.
 */
export async function saveConversation(
  userId: ObjectId,
  id: string,
  messages: ChatUIMessage[],
  title: string,
  now = new Date(),
): Promise<boolean> {
  const kept = recentMessages(cleanMessages(messages), MAX_STORED_MESSAGES);
  try {
    const result = await conversations().updateOne(
      { _id: id, userId },
      {
        $set: { messages: kept, updatedAt: now },
        $setOnInsert: { userId, title, createdAt: now },
      },
      { upsert: true },
    );
    return result.matchedCount > 0 || result.upsertedCount > 0;
  } catch (error) {
    // L'identifiant existe, à un autre joueur : l'upsert heurte la clé `_id`.
    if ((error as { code?: number } | null)?.code === 11000) return false;
    throw error;
  }
}

export async function renameConversation(
  userId: ObjectId,
  id: string,
  title: string,
): Promise<boolean> {
  const result = await conversations().updateOne(
    { _id: id, userId },
    { $set: { title } },
  );
  return result.matchedCount > 0;
}

export async function deleteConversation(
  userId: ObjectId,
  id: string,
): Promise<boolean> {
  const result = await conversations().deleteOne({ _id: id, userId });
  return result.deletedCount > 0;
}
