import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import {
  DEFAULT_CHAT_PRICING,
  parseChatPricing,
  type ChatPricing,
} from "@/lib/chat/pricing";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_MONTHLY_BUDGET_MICROS,
  isChatModelId,
  type ChatAccessStatus,
  type ChatModelId,
  type ChatStatus,
} from "@/types/chat";

/**
 * L'accès à Nexus Chat et son budget.
 *
 * Fermé par défaut : un joueur demande l'accès, l'admin l'ouvre avec un
 * budget mensuel en dollars. Le budget repart le 1er de chaque mois (minuit
 * UTC) ; ce qui est consommé se lit dans `chatUsage`, une ligne par étape de
 * réponse, au coût calculé sur les jetons (`lib/chat/pricing.ts`).
 */

/** Ce que le document `users` garde de l'accès au chat. */
export interface DbChatAccess {
  status: Exclude<ChatAccessStatus, "none">;
  monthlyBudgetMicros: number;
  requestedAt?: Date;
  grantedAt?: Date;
  grantedBy?: ObjectId;
  revokedAt?: Date;
}

/** Les réglages globaux, un document `{ _id: "chat" }` de `settings`. */
export interface ChatSettings {
  /** Interrupteur général : le chat répond-il à qui que ce soit. */
  enabled: boolean;
  model: ChatModelId;
  /** Budget proposé quand l'admin ouvre un accès. */
  defaultMonthlyBudgetMicros: number;
  /** Les tarifs des modèles, réglés par l'admin (`lib/chat/pricing.ts`). */
  pricing: ChatPricing;
}

interface DbChatSettings extends Partial<Omit<ChatSettings, "pricing">> {
  /** Absent tant que l'admin n'a pas touché aux tarifs. */
  pricing?: unknown;
  _id: "chat";
  updatedAt?: Date;
  updatedBy?: ObjectId;
}

export interface DbChatUsage {
  userId: ObjectId;
  conversationId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costMicros: number;
  createdAt: Date;
}

const DEFAULT_SETTINGS: ChatSettings = {
  enabled: true,
  model: DEFAULT_CHAT_MODEL,
  defaultMonthlyBudgetMicros: DEFAULT_MONTHLY_BUDGET_MICROS,
  pricing: DEFAULT_CHAT_PRICING,
};

function users() {
  return db.db().collection<{ _id: ObjectId; chat?: DbChatAccess }>("users");
}

function settings() {
  return db.db().collection<DbChatSettings>("settings");
}

export function chatUsage() {
  return db.db().collection<DbChatUsage>("chatUsage");
}

export async function getChatSettings(): Promise<ChatSettings> {
  const doc = await settings().findOne({ _id: "chat" });
  return {
    enabled: doc?.enabled ?? DEFAULT_SETTINGS.enabled,
    model: isChatModelId(doc?.model) ? doc.model : DEFAULT_SETTINGS.model,
    defaultMonthlyBudgetMicros:
      doc?.defaultMonthlyBudgetMicros ??
      DEFAULT_SETTINGS.defaultMonthlyBudgetMicros,
    pricing: parseChatPricing(doc?.pricing) ?? DEFAULT_SETTINGS.pricing,
  };
}

export async function saveChatSettings(
  adminId: ObjectId,
  update: Omit<ChatSettings, "pricing">,
): Promise<void> {
  await settings().updateOne(
    { _id: "chat" },
    { $set: { ...update, updatedAt: new Date(), updatedBy: adminId } },
    { upsert: true },
  );
}

/** Des tarifs ont-ils été enregistrés par l'admin (sinon, ceux du code). */
export async function hasCustomChatPricing(): Promise<boolean> {
  const doc = await settings().findOne(
    { _id: "chat" },
    { projection: { pricing: 1 } },
  );
  return parseChatPricing(doc?.pricing) !== null;
}

/** Enregistre les tarifs des modèles ; `null` revient à ceux du code. */
export async function saveChatPricing(
  adminId: ObjectId,
  pricing: ChatPricing | null,
): Promise<void> {
  await settings().updateOne(
    { _id: "chat" },
    pricing
      ? { $set: { pricing, updatedAt: new Date(), updatedBy: adminId } }
      : {
          $unset: { pricing: "" },
          $set: { updatedAt: new Date(), updatedBy: adminId },
        },
    { upsert: true },
  );
}

/** Le 1er du mois de `now`, minuit UTC : le début de la période du budget. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Le 1er du mois suivant, minuit UTC : quand le budget repart. */
export function nextMonthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** Ce que des joueurs ont consommé ce mois-ci, par joueur (microdollars). */
export async function spentThisMonth(
  userIds: ObjectId[],
  now = new Date(),
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await chatUsage()
    .aggregate<{ _id: ObjectId; total: number }>([
      {
        $match: {
          userId: { $in: userIds },
          createdAt: { $gte: monthStart(now) },
        },
      },
      { $group: { _id: "$userId", total: { $sum: "$costMicros" } } },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id.toHexString(), row.total]));
}

export async function getChatAccess(
  userId: ObjectId,
): Promise<DbChatAccess | null> {
  const user = await users().findOne(
    { _id: userId },
    { projection: { chat: 1 } },
  );
  return user?.chat ?? null;
}

/** Ce que le joueur voit de son accès et de son budget. */
export async function getChatStatus(userId: ObjectId): Promise<ChatStatus> {
  const now = new Date();
  const [config, access, spent] = await Promise.all([
    getChatSettings(),
    getChatAccess(userId),
    spentThisMonth([userId], now),
  ]);
  const status: ChatAccessStatus = access?.status ?? "none";
  const budget = status === "granted" ? (access?.monthlyBudgetMicros ?? 0) : 0;
  const used = spent.get(userId.toHexString()) ?? 0;
  return {
    enabled: config.enabled,
    status,
    monthlyBudgetMicros: budget,
    spentMicros: used,
    remainingMicros: Math.max(0, budget - used),
    resetsAt: nextMonthStart(now).toISOString(),
    model: config.model,
  };
}

/**
 * Le joueur demande l'accès. Rien ne change s'il l'a déjà, l'a déjà demandé,
 * ou si l'admin le lui a refusé : c'est à l'admin de revenir dessus.
 */
export async function requestChatAccess(
  userId: ObjectId,
): Promise<ChatAccessStatus> {
  await users().updateOne(
    { _id: userId, chat: { $exists: false } },
    {
      $set: {
        chat: {
          status: "requested",
          monthlyBudgetMicros: 0,
          requestedAt: new Date(),
        },
      },
    },
  );
  return (await getChatAccess(userId))?.status ?? "none";
}

/** Les demandes d'accès en attente : le badge de l'accueil de l'admin. */
export async function countChatAccessRequests(): Promise<number> {
  return users().countDocuments({ "chat.status": "requested" });
}

/** L'admin ouvre (ou rouvre) l'accès d'un joueur, avec son budget mensuel. */
export async function grantChatAccess(
  adminId: ObjectId,
  userId: ObjectId,
  monthlyBudgetMicros: number,
): Promise<boolean> {
  const result = await users().updateOne(
    { _id: userId },
    {
      $set: {
        "chat.status": "granted",
        "chat.monthlyBudgetMicros": monthlyBudgetMicros,
        "chat.grantedAt": new Date(),
        "chat.grantedBy": adminId,
      },
      $unset: { "chat.revokedAt": "" },
    },
  );
  return result.matchedCount > 0;
}

/** L'admin change le budget mensuel d'un joueur qui a l'accès. */
export async function setChatBudget(
  userId: ObjectId,
  monthlyBudgetMicros: number,
): Promise<boolean> {
  const result = await users().updateOne(
    { _id: userId, "chat.status": "granted" },
    { $set: { "chat.monthlyBudgetMicros": monthlyBudgetMicros } },
  );
  return result.matchedCount > 0;
}

/** L'admin refuse une demande, ou retire un accès. */
export async function revokeChatAccess(userId: ObjectId): Promise<boolean> {
  const result = await users().updateOne(
    { _id: userId, chat: { $exists: true } },
    { $set: { "chat.status": "revoked", "chat.revokedAt": new Date() } },
  );
  return result.matchedCount > 0;
}

/** Une ligne d'usage par étape de réponse. */
export async function recordChatUsage(usage: DbChatUsage): Promise<void> {
  await chatUsage().insertOne(usage);
}

export interface ChatAccessRow {
  id: string;
  name: string;
  email?: string;
  status: Exclude<ChatAccessStatus, "none">;
  monthlyBudgetMicros: number;
  spentMicros: number;
  requestedAt?: string;
  grantedAt?: string;
}

/** Les joueurs qui ont demandé, ont ou ont eu l'accès : la page d'admin. */
export async function listChatAccess(): Promise<ChatAccessRow[]> {
  const accounts = await db
    .db()
    .collection<{
      _id: ObjectId;
      name?: string;
      email?: string;
      chat: DbChatAccess;
    }>("users")
    .find(
      { chat: { $exists: true } },
      { projection: { name: 1, email: 1, chat: 1 } },
    )
    .sort({ "chat.requestedAt": -1, "chat.grantedAt": -1 })
    .limit(500)
    .toArray();
  const spent = await spentThisMonth(accounts.map((account) => account._id));
  return accounts.map((account) => ({
    id: account._id.toHexString(),
    name: account.name ?? account.email ?? account._id.toHexString(),
    email: account.email,
    status: account.chat.status,
    monthlyBudgetMicros: account.chat.monthlyBudgetMicros ?? 0,
    spentMicros: spent.get(account._id.toHexString()) ?? 0,
    requestedAt: account.chat.requestedAt?.toISOString(),
    grantedAt: account.chat.grantedAt?.toISOString(),
  }));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Recherche d'un joueur par pseudo ou e-mail, pour lui ouvrir l'accès. */
export async function searchChatCandidates(
  query: string,
): Promise<
  { id: string; name: string; email?: string; status: ChatAccessStatus }[]
> {
  const search = query.trim().slice(0, 60);
  if (search.length < 2) return [];
  const pattern = { $regex: escapeRegex(search), $options: "i" };
  const accounts = await db
    .db()
    .collection<{
      _id: ObjectId;
      name?: string;
      email?: string;
      chat?: DbChatAccess;
    }>("users")
    .find(
      { $or: [{ name: pattern }, { email: pattern }] },
      { projection: { name: 1, email: 1, chat: 1 } },
    )
    .limit(10)
    .toArray();
  return accounts.map((account) => ({
    id: account._id.toHexString(),
    name: account.name ?? account.email ?? account._id.toHexString(),
    email: account.email,
    status: account.chat?.status ?? "none",
  }));
}
