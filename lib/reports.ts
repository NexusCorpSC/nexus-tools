import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { del } from "@vercel/blob";
import db from "@/lib/db";
import { clearPlaceImageIf, deletePlace, getPlaceBySlug } from "@/lib/places";
import { deleteItem, getItemBySlug } from "@/lib/items";
import { getBlueprintBySlug } from "@/lib/crafting";
import {
  cleanText,
  contributions,
  isDuplicateKey,
  placeMedia,
  pointEvents,
  toContribution,
  users,
  type Contributor,
  type DbContribution,
} from "@/lib/contribution-store";
import { updatePlans } from "@/lib/contribution-catalog";
import {
  ContributionError,
  ensurePlaceCover,
  getStanding,
  refreshProgress,
  revertContribution,
} from "@/lib/contributions";
import { isPlacePlanRef, planImage, type PlacePlan } from "@/types/places";
import type { ShopDbModel, ShopItemDbModel } from "@/lib/shop-items";
import { POINTS, type Contribution } from "@/types/contributions";
import {
  CONTRIBUTOR_SUSPENSION_DAYS,
  MASKABLE_TARGETS,
  MAX_REPORT_COMMENT_LENGTH,
  MAX_RESOLUTION_NOTE_LENGTH,
  REPORT_ACTIONS_BY_TARGET,
  REPORT_BAN_DAYS,
  REPORT_COOLDOWN_DAYS,
  REPORT_MASK_WEIGHT,
  REPORT_STRIKES,
  REPORT_UPHELD_POINTS,
  REPORTS_PER_DAY,
  isReportAction,
  isReportReason,
  isReportSanction,
  isReportTargetType,
  reportWeight,
  type MyReport,
  type Report,
  type ReportAction,
  type ReportErrorCode,
  type ReportReason,
  type ReportSanction,
  type ReportStatus,
  type ReportTarget,
  type ReportTargetType,
  type ReportingStanding,
  type SubmitReportResult,
} from "@/types/reports";

/**
 * Les signalements et leur modération.
 *
 * Un dossier par cible ouverte : l'index unique partiel sur
 * `(target.type, target.id)` des dossiers `open` fait qu'un second
 * signalement s'ajoute au premier plutôt que d'ouvrir un doublon, même
 * envoyé au même instant. Un dossier tranché libère la cible : un nouveau
 * signalement en ouvre un autre.
 *
 * Chaque décision est écrite dans `moderationLog`, avec son auteur.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export class ReportError extends Error {
  constructor(
    readonly code: ReportErrorCode,
    readonly status: number,
    /** Un message déjà en français, quand l'action a échoué en route. */
    readonly detail?: string,
  ) {
    super(detail ?? code);
  }
}

interface DbReportEntry {
  userId: ObjectId;
  userName?: string;
  weight: number;
  reason: ReportReason;
  comment?: string;
  at: Date;
}

export interface DbReport {
  _id: ObjectId;
  target: ReportTarget;
  status: ReportStatus;
  weight: number;
  hidden: boolean;
  /** La vignette du lieu était cette image : le masquage l'a retirée. */
  coverCleared?: boolean;
  /** Le verrou de la décision : deux modérateurs ne tranchent pas deux fois. */
  resolving?: boolean;
  entries: DbReportEntry[];
  createdAt: Date;
  updatedAt: Date;
  resolution?: {
    action: ReportAction;
    by: ObjectId;
    byName?: string;
    at: Date;
    note?: string;
    contributionId?: ObjectId;
    sanction?: ReportSanction;
    authorId?: ObjectId;
    /** Les auteurs du contenu en cause, pour un dossier retenu. */
    authorIds?: ObjectId[];
  };
}

export interface DbModerationLog {
  _id?: ObjectId;
  at: Date;
  by: ObjectId;
  byName?: string;
  /** `report.dismiss`, `contribution.publish`, `user.suspend`… */
  action: string;
  reportId?: ObjectId;
  contributionId?: ObjectId;
  userId?: ObjectId;
  target?: { type: string; id: string; name?: string };
  note?: string;
}

interface DbOrganization {
  _id: string;
  name: string;
  tag?: string;
  image?: string;
  public?: boolean;
  reportHidden?: boolean;
  members: { userId: ObjectId; rank?: string; editor?: boolean }[];
}

export const reports = () => db.db().collection<DbReport>("reports");
export const moderationLog = () =>
  db.db().collection<DbModerationLog>("moderationLog");
const organizations = () => db.db().collection<DbOrganization>("organizations");
const shops = () => db.db().collection<ShopDbModel>("shops");
const listings = () => db.db().collection<ShopItemDbModel>("shopItems");

/** Toute décision de modération passe par là, pour qu'on sache qui a fait quoi. */
export async function logModeration(entry: Omit<DbModerationLog, "at">) {
  try {
    await moderationLog().insertOne({ ...entry, at: new Date() });
  } catch (error) {
    // Le journal ne doit pas faire échouer la décision qu'il consigne.
    console.error("Journal de modération impossible", error);
  }
}

function toReport(doc: DbReport): Report {
  return {
    id: String(doc._id),
    target: doc.target,
    status: doc.status,
    weight: doc.weight,
    hidden: doc.hidden,
    entries: doc.entries.map((entry) => ({
      userId: String(entry.userId),
      userName: entry.userName,
      weight: entry.weight,
      reason: entry.reason,
      comment: entry.comment,
      at: entry.at.toISOString(),
    })),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    resolution: doc.resolution
      ? {
          action: doc.resolution.action,
          by: String(doc.resolution.by),
          byName: doc.resolution.byName,
          at: doc.resolution.at.toISOString(),
          note: doc.resolution.note,
          contributionId: doc.resolution.contributionId
            ? String(doc.resolution.contributionId)
            : undefined,
          sanction: doc.resolution.sanction,
          authorId: doc.resolution.authorId
            ? String(doc.resolution.authorId)
            : undefined,
        }
      : undefined,
  };
}

// ─── Cibles ─────────────────────────────────────────────────────────────────

type ResolvedTarget = {
  target: ReportTarget;
  /** Ceux dont c'est le contenu : ils ne le signalent pas. */
  owners: ObjectId[];
};

/** Les auteurs des contributions publiées qui ont fait cette cible. */
async function publishedAuthors(
  filter: Filter<DbContribution>,
): Promise<ObjectId[]> {
  const docs = await contributions()
    .find({ ...filter, status: "published" }, { projection: { userId: 1 } })
    .toArray();
  return docs.map((doc) => doc.userId);
}

/**
 * Ce que vise un signalement, tel qu'il existe aujourd'hui, ou rien. Une
 * cible que le joueur ne voit pas — une image en attente, l'organisation
 * privée d'un autre — n'existe pas pour lui.
 */
async function resolveTarget(
  type: ReportTargetType,
  id: string,
  viewer?: ObjectId,
): Promise<ResolvedTarget | null> {
  switch (type) {
    case "place": {
      const place = await getPlaceBySlug(id);
      if (!place) return null;
      return {
        target: { type, id: place.slug, name: place.name, slug: place.slug },
        owners: await publishedAuthors({
          kind: "placeCreate",
          "target.slug": place.slug,
        }),
      };
    }
    case "placeMedia": {
      if (!ObjectId.isValid(id)) return null;
      const media = await placeMedia().findOne({
        _id: new ObjectId(id),
        status: "published",
      });
      if (!media) return null;
      const place = await getPlaceBySlug(media.placeSlug);
      if (!place) return null;
      return {
        target: {
          type,
          id: String(media._id),
          name: media.caption ? `${place.name} · ${media.caption}` : place.name,
          slug: place.slug,
          imageUrl: media.url,
        },
        owners: [media.userId],
      };
    }
    case "plan": {
      const split = id.indexOf(":");
      if (split <= 0) return null;
      const slug = id.slice(0, split);
      const planId = id.slice(split + 1);
      const place = await getPlaceBySlug(slug);
      // Un plan emprunté se signale chez le lieu qui le tient.
      const plan = place?.plans?.find(
        (entry): entry is PlacePlan =>
          entry.id === planId && !isPlacePlanRef(entry),
      );
      if (!place || !plan) return null;
      return {
        target: {
          type,
          id: `${place.slug}:${plan.id}`,
          name: `${place.name} · ${plan.name}`,
          slug: place.slug,
          planId: plan.id,
          imageUrl: planImage(plan)?.url,
        },
        owners: await publishedAuthors({
          kind: "plan",
          "target.slug": place.slug,
          "target.planId": plan.id,
        }),
      };
    }
    case "item": {
      const item = await getItemBySlug(id);
      if (!item) return null;
      return {
        target: { type, id: item.slug, name: item.name },
        owners: await publishedAuthors({
          kind: "itemCreate",
          "target.slug": item.slug,
        }),
      };
    }
    case "blueprint": {
      const blueprint = await getBlueprintBySlug(id);
      if (!blueprint) return null;
      return {
        target: { type, id: blueprint.slug, name: blueprint.name },
        owners: [],
      };
    }
    case "org": {
      const org = await organizations().findOne({ _id: id });
      if (!org) return null;
      const members = org.members.map((member) => member.userId);
      const visible =
        (org.public === true && org.reportHidden !== true) ||
        (viewer && members.some((member) => member.equals(viewer)));
      if (!visible) return null;
      return {
        target: {
          type,
          id: org._id,
          name: org.tag ? `${org.name} [${org.tag}]` : org.name,
          imageUrl: org.image,
        },
        owners: members,
      };
    }
    case "shop": {
      const shop = await shops().findOne({ id });
      if (!shop) return null;
      const sellers = [shop.ownerId, ...(shop.sellers ?? [])];
      const visible =
        shop.reportHidden !== true ||
        (viewer && sellers.some((seller) => seller.equals(viewer)));
      if (!visible) return null;
      return {
        target: {
          type,
          id: shop.id,
          name: shop.name,
          ...(shop.logo && { imageUrl: shop.logo }),
        },
        owners: sellers,
      };
    }
    case "listing": {
      const listing = await listings().findOne({ id });
      if (!listing) return null;
      const shop = await shops().findOne({ id: listing.shopId });
      const sellers = shop ? [shop.ownerId, ...(shop.sellers ?? [])] : [];
      const visible =
        (listing.hidden !== true &&
          listing.reportHidden !== true &&
          shop?.reportHidden !== true) ||
        (viewer && sellers.some((seller) => seller.equals(viewer)));
      if (!visible) return null;
      return {
        target: {
          type,
          id: listing.id,
          name: shop ? `${listing.name} · ${shop.name}` : listing.name,
          slug: listing.shopId,
          ...(listing.image && { imageUrl: listing.image }),
        },
        owners: sellers,
      };
    }
  }
}

/** La fiche d'une cible sur le site, pour y renvoyer depuis l'admin. */
export function targetHref(target: ReportTarget): string {
  switch (target.type) {
    case "place":
      return `/lieux/${target.id}`;
    case "placeMedia":
      return `/lieux/${target.slug}`;
    case "plan":
      return `/lieux/${target.slug}?onglet=plan&plan=${target.planId}`;
    case "item":
      return `/items/${target.id}`;
    case "org":
      return `/orgs/${target.id}`;
    case "blueprint":
      return `/crafting/blueprints/${target.id}`;
    case "shop":
      return `/shops/${target.id}`;
    case "listing":
      return `/shopping/i/${target.id}`;
  }
}

/**
 * Où le modérateur corrige la cible lui-même : l'édition d'admin quand il en
 * a le droit, sinon le formulaire de contribution, qu'il publie directement
 * à son niveau. Une organisation ne se corrige que par ses éditeurs.
 */
export function targetEditHref(
  target: ReportTarget,
  admin: boolean,
): string | undefined {
  switch (target.type) {
    case "place":
      return admin
        ? `/admin/lieux/${target.id}/edit`
        : `/lieux/${target.id}/contribuer`;
    case "plan":
      return admin
        ? `/admin/lieux/${target.slug}/plans`
        : `/lieux/${target.slug}/contribuer/plan?plan=${target.planId}`;
    case "item":
      return admin
        ? `/admin/items/${target.id}/edit`
        : `/items/${target.id}/contribuer`;
    case "blueprint":
      return `/crafting/blueprints/${target.id}/edit`;
    default:
      return undefined;
  }
}

// ─── Masquage ───────────────────────────────────────────────────────────────

async function mask(report: DbReport) {
  const { target } = report;
  if (target.type === "placeMedia") {
    const media = await placeMedia().findOneAndUpdate(
      { _id: new ObjectId(target.id) },
      { $set: { hiddenByReport: true } },
    );
    // L'image était peut-être la vignette du lieu : elle s'y verrait encore.
    if (media && (await clearPlaceImageIf(media.placeSlug, media.url))) {
      await reports().updateOne(
        { _id: report._id },
        { $set: { coverCleared: true } },
      );
      await ensurePlaceCover(media.placeSlug);
    }
  } else if (target.type === "org") {
    await organizations().updateOne(
      { _id: target.id },
      { $set: { reportHidden: true } },
    );
  } else if (target.type === "shop") {
    await shops().updateOne({ id: target.id }, { $set: { reportHidden: true } });
  } else if (target.type === "listing") {
    await listings().updateOne(
      { id: target.id },
      { $set: { reportHidden: true } },
    );
  }
}

async function unmask(report: DbReport) {
  if (!report.hidden) return;
  const { target } = report;
  if (target.type === "placeMedia") {
    const media = await placeMedia().findOneAndUpdate(
      { _id: new ObjectId(target.id) },
      { $unset: { hiddenByReport: "" } },
      { returnDocument: "after" },
    );
    if (report.coverCleared && media?.status === "published") {
      // Pendant le masquage, l'image suivante a pu prendre la bannière : la
      // première image la reprend, mais pas sur une bannière d'admin.
      const place = await getPlaceBySlug(media.placeSlug);
      const fromGallery =
        place?.imageUrl &&
        (await placeMedia().countDocuments({
          placeSlug: media.placeSlug,
          url: place.imageUrl,
        })) > 0;
      if (fromGallery)
        await clearPlaceImageIf(media.placeSlug, place.imageUrl!);
      await ensurePlaceCover(media.placeSlug);
    }
  } else if (target.type === "org") {
    await organizations().updateOne(
      { _id: target.id },
      { $unset: { reportHidden: "" } },
    );
  } else if (target.type === "shop") {
    await shops().updateOne({ id: target.id }, { $unset: { reportHidden: "" } });
  } else if (target.type === "listing") {
    await listings().updateOne(
      { id: target.id },
      { $unset: { reportHidden: "" } },
    );
  }
}

// ─── Signaler ───────────────────────────────────────────────────────────────

function parseInput(input: unknown) {
  const raw = (input ?? {}) as {
    target?: { type?: unknown; id?: unknown };
    reason?: unknown;
    comment?: unknown;
  };
  const type = raw.target?.type;
  const id = raw.target?.id;
  if (
    !isReportTargetType(type) ||
    typeof id !== "string" ||
    id.length === 0 ||
    id.length > 300
  ) {
    throw new ReportError("invalidTarget", 400);
  }
  if (!isReportReason(raw.reason)) throw new ReportError("invalidReason", 400);
  const comment = cleanText(raw.comment, MAX_REPORT_COMMENT_LENGTH);
  if (raw.reason === "other" && !comment) {
    throw new ReportError("commentRequired", 400);
  }
  return { type, id, reason: raw.reason, comment };
}

/**
 * Enregistre un signalement : il rejoint le dossier ouvert de sa cible, ou en
 * ouvre un. Au poids de masquage, une image ou une organisation est retirée
 * de la vue publique en attendant la décision.
 */
export async function submitReport(
  reporter: Contributor,
  input: unknown,
): Promise<SubmitReportResult> {
  const { type, id, reason, comment } = parseInput(input);
  const now = new Date();

  const user = await users().findOne(
    { _id: reporter.id },
    { projection: { contrib: 1 } },
  );
  if (user?.contrib?.reportBanUntil && user.contrib.reportBanUntil > now) {
    throw new ReportError("reportingSuspended", 403);
  }

  const resolved = await resolveTarget(type, id, reporter.id);
  if (!resolved) throw new ReportError("targetNotFound", 404);
  const { target, owners } = resolved;
  if (owners.some((owner) => owner.equals(reporter.id))) {
    throw new ReportError("ownContent", 403);
  }

  const today = await reports().countDocuments({
    entries: {
      $elemMatch: {
        userId: reporter.id,
        at: { $gte: new Date(now.getTime() - DAY_MS) },
      },
    },
  });
  if (today >= REPORTS_PER_DAY) throw new ReportError("dailyLimit", 429);

  // Un dossier classé ne se rouvre pas aussitôt par les mêmes comptes :
  // sinon deux Éclaireurs remasqueraient la même image à chaque classement.
  const dismissedRecently = await reports().countDocuments({
    "target.type": target.type,
    "target.id": target.id,
    status: "dismissed",
    "entries.userId": reporter.id,
    "resolution.at": {
      $gte: new Date(now.getTime() - REPORT_COOLDOWN_DAYS * DAY_MS),
    },
  });
  if (dismissedRecently > 0) throw new ReportError("alreadyReported", 409);

  const standing = await getStanding(reporter.id);
  const entry: DbReportEntry = {
    userId: reporter.id,
    userName: reporter.name,
    weight: reportWeight(standing.level),
    reason,
    comment,
    at: now,
  };

  // Les champs de la cible un à un : le filtre pose déjà `target.type` et
  // `target.id` dans un dossier créé, `target` entier y entrerait en conflit.
  const onInsert: Record<string, unknown> = {
    status: "open",
    hidden: false,
    createdAt: now,
    "target.name": target.name,
  };
  for (const key of ["slug", "planId", "imageUrl"] as const) {
    if (target[key]) onInsert[`target.${key}`] = target[key];
  }

  let report: DbReport | null = null;
  for (let attempt = 0; attempt < 2 && !report; attempt += 1) {
    try {
      report = await reports().findOneAndUpdate(
        {
          "target.type": target.type,
          "target.id": target.id,
          status: "open",
          // Un dossier en cours de décision ne prend plus de signalement :
          // la décision ne le verrait ni ne le compterait.
          resolving: { $ne: true },
          "entries.userId": { $ne: reporter.id },
        },
        {
          $push: { entries: entry },
          $inc: { weight: entry.weight },
          $set: { updatedAt: now },
          $setOnInsert: onInsert,
        },
        { upsert: true, returnDocument: "after" },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      // Le dossier ouvert existe : soit le joueur y figure déjà, soit un
      // autre l'a ouvert au même instant, et on s'y ajoute au second essai.
      const open = await reports().findOne(
        { "target.type": target.type, "target.id": target.id, status: "open" },
        { projection: { resolving: 1, "entries.userId": 1 } },
      );
      if (open?.entries.some((entry) => entry.userId.equals(reporter.id))) {
        throw new ReportError("alreadyReported", 409);
      }
      if (open?.resolving) throw new ReportError("busy", 409);
    }
  }
  if (!report) throw new ReportError("busy", 409);

  if (
    report.weight >= REPORT_MASK_WEIGHT &&
    MASKABLE_TARGETS.includes(report.target.type)
  ) {
    const claimed = await reports().findOneAndUpdate(
      {
        _id: report._id,
        status: "open",
        hidden: false,
        resolving: { $ne: true },
      },
      { $set: { hidden: true } },
    );
    if (claimed) {
      await mask(claimed);
      // Une décision prise pendant le masquage ne l'a peut-être pas vu : si
      // le dossier a été classé ou corrigé entre-temps, on démasque.
      const after = await reports().findOne({ _id: claimed._id });
      if (
        after &&
        (after.status === "dismissed" || after.resolution?.action === "correct")
      ) {
        await unmask({ ...after, hidden: true });
      }
    }
  }

  return {
    id: String(report._id),
    status: report.status,
    reporters: report.entries.length,
  };
}

// ─── Lecture ────────────────────────────────────────────────────────────────

/**
 * Ce qui est contesté sur une fiche : un dossier ouvert assez lourd pour
 * qu'un visiteur le sache. Pour un lieu, ses plans aussi.
 */
export async function getContested(
  type: "place" | "item",
  slug: string,
): Promise<{ contested: boolean; planIds: string[] }> {
  const filter: Filter<DbReport> =
    type === "place"
      ? {
          status: "open",
          weight: { $gte: REPORT_MASK_WEIGHT },
          $or: [
            { "target.type": "place", "target.id": slug },
            { "target.type": "plan", "target.slug": slug },
          ],
        }
      : {
          status: "open",
          weight: { $gte: REPORT_MASK_WEIGHT },
          "target.type": "item",
          "target.id": slug,
        };
  const docs = await reports()
    .find(filter, { projection: { target: 1 } })
    .toArray();
  return {
    contested: docs.some((doc) => doc.target.type === type),
    planIds: docs
      .filter((doc) => doc.target.type === "plan" && doc.target.planId)
      .map((doc) => doc.target.planId!),
  };
}

export async function countOpenReports(): Promise<number> {
  return reports().countDocuments({ status: "open" });
}

/** Les dossiers ouverts, les plus lourds d'abord. */
export async function listOpenReports(
  limit = 100,
): Promise<{ items: Report[]; total: number }> {
  const [docs, total] = await Promise.all([
    reports()
      .find({ status: "open" })
      .sort({ weight: -1, updatedAt: -1 })
      .limit(limit)
      .toArray(),
    countOpenReports(),
  ]);
  return { items: docs.map(toReport), total };
}

export type ReportAuthor = { id: string; name?: string; why: string };

export type ReportDetail = {
  report: Report;
  href: string;
  editHref?: string;
  /** Les contributions qui ont fait la cible, les plus récentes d'abord. */
  history: Contribution[];
  /** Ceux qu'une sanction peut viser. */
  authors: ReportAuthor[];
  /** La cible n'existe plus, ou plus sous cette forme. */
  gone: boolean;
};

function historyFilter(target: ReportTarget): Filter<DbContribution> | null {
  switch (target.type) {
    case "place":
      return {
        $or: [
          { "target.type": "place", "target.slug": target.id },
          { kind: "placeCreate", "target.slug": target.id },
        ],
      };
    case "plan":
      return {
        kind: "plan",
        "target.slug": target.slug,
        "target.planId": target.planId,
      };
    case "item":
      return { "target.type": "item", "target.slug": target.id };
    case "blueprint":
      return { "target.type": "blueprint", "target.slug": target.id };
    default:
      return null;
  }
}

async function historyOf(target: ReportTarget): Promise<DbContribution[]> {
  if (target.type === "placeMedia") {
    const media = await placeMedia().findOne(
      { _id: new ObjectId(target.id) },
      { projection: { contributionId: 1 } },
    );
    if (!media) return [];
    const doc = await contributions().findOne({ _id: media.contributionId });
    return doc ? [doc] : [];
  }
  const filter = historyFilter(target);
  if (!filter) return [];
  return contributions()
    .find({
      ...filter,
      status: { $in: ["published", "reverted"] },
    })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
}

async function authorsOf(
  target: ReportTarget,
  history: DbContribution[],
): Promise<ReportAuthor[]> {
  const seen = new Map<string, ReportAuthor>();
  if (target.type === "org") {
    const org = await organizations().findOne({ _id: target.id });
    // Le premier membre est celui qui l'a fondée.
    const founder = org?.members[0];
    if (founder) {
      const user = await users().findOne(
        { _id: founder.userId },
        { projection: { name: 1 } },
      );
      seen.set(String(founder.userId), {
        id: String(founder.userId),
        name: user?.name,
        why: "founder",
      });
    }
  }
  if (target.type === "shop" || target.type === "listing") {
    // Le propriétaire du magasin, celui qui l'a ouvert.
    const shop = await shops().findOne({
      id: target.type === "shop" ? target.id : target.slug,
    });
    if (shop) {
      const user = await users().findOne(
        { _id: shop.ownerId },
        { projection: { name: 1 } },
      );
      seen.set(String(shop.ownerId), {
        id: String(shop.ownerId),
        name: user?.name,
        why: "founder",
      });
    }
  }
  for (const doc of history) {
    const key = String(doc.userId);
    if (!seen.has(key)) {
      seen.set(key, { id: key, name: doc.userName, why: doc.kind });
    }
  }
  return [...seen.values()];
}

/** La cible existe-t-elle encore, masquée ou non ? */
async function targetExists(target: ReportTarget): Promise<boolean> {
  switch (target.type) {
    case "placeMedia":
      return (
        (await placeMedia().countDocuments({
          _id: new ObjectId(target.id),
          status: "published",
        })) > 0
      );
    case "org":
      return (await organizations().countDocuments({ _id: target.id })) > 0;
    case "shop":
      return (await shops().countDocuments({ id: target.id })) > 0;
    case "listing":
      return (await listings().countDocuments({ id: target.id })) > 0;
    default:
      return (await resolveTarget(target.type, target.id)) !== null;
  }
}

export async function getReportDetail(
  id: string,
  /** Le modérateur est-il admin : de là dépend où il corrige la cible. */
  admin = false,
): Promise<ReportDetail | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await reports().findOne({ _id: new ObjectId(id) });
  if (!doc) return null;
  const [history, exists] = await Promise.all([
    historyOf(doc.target),
    targetExists(doc.target),
  ]);
  return {
    report: toReport(doc),
    href: targetHref(doc.target),
    editHref: targetEditHref(doc.target, admin),
    history: history.map(toContribution),
    authors: await authorsOf(doc.target, history),
    gone: !exists,
  };
}

/** Les signalements d'un joueur et ce qu'ils sont devenus. */
export async function getReportingStanding(
  userId: ObjectId,
): Promise<ReportingStanding> {
  const [docs, user] = await Promise.all([
    reports()
      .find({ "entries.userId": userId })
      .sort({ updatedAt: -1 })
      .limit(30)
      .toArray(),
    users().findOne({ _id: userId }, { projection: { contrib: 1 } }),
  ]);
  const now = new Date();

  const mine: MyReport[] = docs.map((doc) => {
    const entry = doc.entries.find((candidate) =>
      candidate.userId.equals(userId),
    )!;
    return {
      id: String(doc._id),
      target: doc.target,
      reason: entry.reason,
      at: entry.at.toISOString(),
      status: doc.status,
      decidedAt: doc.resolution?.at.toISOString(),
    };
  });
  const banUntil = user?.contrib?.reportBanUntil;
  const suspendedUntil = user?.contrib?.suspendedUntil;

  return {
    reports: mine,
    bannedUntil:
      banUntil && banUntil > now ? banUntil.toISOString() : undefined,
    warnings: (user?.contrib?.warnings ?? [])
      .slice(-5)
      .reverse()
      .map((warning) => ({ at: warning.at.toISOString(), note: warning.note })),
    suspendedUntil:
      suspendedUntil && suspendedUntil > now
        ? suspendedUntil.toISOString()
        : undefined,
  };
}

// ─── Décider ────────────────────────────────────────────────────────────────

export type ResolveReportInput = {
  action: ReportAction;
  note?: string;
  /** La contribution à annuler, pour `revert`. */
  contributionId?: string;
  /** Annuler malgré ce qui a changé depuis. */
  force?: boolean;
  sanction?: ReportSanction;
  /** L'auteur visé par la sanction, parmi ceux du dossier. */
  authorId?: string;
};

export function parseResolveInput(input: unknown): ResolveReportInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (!isReportAction(raw.action)) throw new ReportError("invalidAction", 400);
  const sanction =
    raw.sanction === undefined || raw.sanction === null || raw.sanction === ""
      ? undefined
      : raw.sanction;
  if (sanction !== undefined && !isReportSanction(sanction)) {
    throw new ReportError("invalidAction", 400);
  }
  return {
    action: raw.action,
    note: cleanText(raw.note, MAX_RESOLUTION_NOTE_LENGTH),
    contributionId:
      typeof raw.contributionId === "string" ? raw.contributionId : undefined,
    force: raw.force === true,
    sanction,
    authorId: typeof raw.authorId === "string" ? raw.authorId : undefined,
  };
}

/**
 * Retire une image publiée : elle quitte la galerie, sa vignette et le
 * stockage, et les points qu'elle a rapportés repartent. La contribution qui
 * l'a apportée reste publiée pour ses autres images.
 */
async function removeMedia(mediaId: ObjectId, moderator: Contributor) {
  const media = await placeMedia().findOneAndUpdate(
    { _id: mediaId, status: "published" },
    { $set: { status: "reverted" }, $unset: { hiddenByReport: "" } },
  );
  if (!media) throw new ReportError("actionFailed", 409);
  if (await clearPlaceImageIf(media.placeSlug, media.url)) {
    await ensurePlaceCover(media.placeSlug);
  }
  try {
    await del(media.url);
  } catch (error) {
    console.error("Suppression d'image impossible", error);
  }
  try {
    // Les points de l'image sortent aussi de la contribution : l'annuler plus
    // tard ne reprendra que ce qu'elle rapporte encore.
    const debited = await contributions().findOneAndUpdate(
      {
        _id: media.contributionId,
        status: "published",
        points: { $gte: POINTS.media },
      },
      { $inc: { points: -POINTS.media } },
    );
    if (debited) {
      await pointEvents().insertOne({
        userId: media.userId,
        contributionId: media.contributionId,
        delta: -POINTS.media,
        reason: "removed",
        at: new Date(),
      });
      await users().updateOne(
        { _id: media.userId },
        { $inc: { "contrib.points": -POINTS.media } },
      );
    }
    await refreshProgress(media.userId);
  } catch (error) {
    console.error("Décompte d'image impossible", error);
  }
  await logModeration({
    by: moderator.id,
    byName: moderator.name,
    action: "media.remove",
    contributionId: media.contributionId,
    userId: media.userId,
    target: { type: "placeMedia", id: String(media._id) },
  });
}

async function deleteTarget(report: DbReport, moderator: Contributor) {
  const { target } = report;
  try {
    switch (target.type) {
      case "placeMedia":
        await removeMedia(new ObjectId(target.id), moderator);
        return;
      case "plan":
        await updatePlans(target.slug!, (plans) =>
          plans.filter((plan) => plan.id !== target.planId),
        );
        return;
      case "place":
        if (!(await deletePlace(target.id))) {
          throw new ReportError("actionFailed", 404);
        }
        return;
      case "item":
        if (!(await deleteItem(target.id))) {
          throw new ReportError("actionFailed", 404);
        }
        return;
      case "org":
        // Une organisation porte des membres, des évènements, un inventaire :
        // on la retire de la vue publique, ses membres la gardent.
        await organizations().updateOne(
          { _id: target.id },
          { $set: { public: false, reportHidden: true } },
        );
        return;
      case "blueprint":
        throw new ReportError("actionFailed", 400);
      case "shop":
        // Ses commandes en cours restent lisibles par l'acheteur et ses
        // vendeurs : on retire le magasin de la vue publique, sans l'effacer.
        await shops().updateOne(
          { id: target.id },
          { $set: { reportHidden: true } },
        );
        return;
      case "listing":
        await listings().updateOne(
          { id: target.id },
          { $set: { reportHidden: true } },
        );
        return;
    }
  } catch (error) {
    if (error instanceof ReportError) throw error;
    if (error instanceof ContributionError) {
      throw new ReportError("actionFailed", error.status, error.detail);
    }
    throw new ReportError(
      "actionFailed",
      409,
      error instanceof Error ? error.message : undefined,
    );
  }
}

/** Les signalements retenus rapportent, et effacent les refus d'avant. */
async function rewardReporters(report: DbReport, at: Date) {
  for (const entry of report.entries) {
    try {
      await pointEvents().insertOne({
        userId: entry.userId,
        reportId: report._id,
        delta: REPORT_UPHELD_POINTS,
        reason: "report",
        at,
      });
      await users().updateOne(
        { _id: entry.userId },
        {
          $inc: { "contrib.points": REPORT_UPHELD_POINTS },
          $set: { "contrib.reportStrikes": 0 },
        },
      );
    } catch (error) {
      if (!isDuplicateKey(error)) {
        console.error("Crédit de signalement impossible", error);
      }
    }
    await refreshProgress(entry.userId);
  }
}

/** Trois signalements classés d'affilée : plus de signalement pendant 7 jours. */
async function strikeReporters(report: DbReport, at: Date) {
  const ids = report.entries.map((entry) => entry.userId);
  await users().updateMany(
    { _id: { $in: ids } },
    { $inc: { "contrib.reportStrikes": 1 } },
  );
  await users().updateMany(
    { _id: { $in: ids }, "contrib.reportStrikes": { $gte: REPORT_STRIKES } },
    {
      $set: {
        "contrib.reportBanUntil": new Date(
          at.getTime() + REPORT_BAN_DAYS * DAY_MS,
        ),
        "contrib.reportStrikes": 0,
      },
    },
  );
}

async function sanctionAuthor(
  report: DbReport,
  sanction: ReportSanction,
  authorId: ObjectId,
  moderator: Contributor,
  note: string | undefined,
  at: Date,
) {
  const warning = { at, by: moderator.id, reportId: report._id, note };
  await users().updateOne(
    { _id: authorId },
    sanction === "suspend"
      ? {
          $push: { "contrib.warnings": warning },
          $set: {
            "contrib.suspendedUntil": new Date(
              at.getTime() + CONTRIBUTOR_SUSPENSION_DAYS * DAY_MS,
            ),
          },
        }
      : { $push: { "contrib.warnings": warning } },
  );
  await logModeration({
    by: moderator.id,
    byName: moderator.name,
    action: `user.${sanction}`,
    reportId: report._id,
    userId: authorId,
    note,
  });
}

/**
 * Tranche un dossier ouvert. L'action passe d'abord — si elle échoue, le
 * dossier reste ouvert et rien n'est crédité —, puis le dossier est clos, ses
 * signaleurs crédités ou comptés, et l'auteur sanctionné s'il y a lieu.
 */
export type ModerationRights = { places: boolean; items: boolean };

/** Retirer une image ou une organisation est de la modération ; le reste, de l'édition. */
export function canDelete(
  target: ReportTarget,
  rights: ModerationRights,
): boolean {
  switch (target.type) {
    case "place":
    case "plan":
      return rights.places;
    case "item":
      return rights.items;
    default:
      return true;
  }
}

export async function resolveReport(
  id: string,
  moderator: Contributor,
  input: ResolveReportInput,
  /**
   * Ce que le modérateur peut supprimer : retirer un lieu, un plan ou un objet
   * demande les mêmes droits que dans l'admin (`places:edit`, `items:edit`).
   */
  rights: ModerationRights = { places: false, items: false },
): Promise<Report> {
  if (!ObjectId.isValid(id)) throw new ReportError("notFound", 404);
  const reportId = new ObjectId(id);

  const report = await reports().findOneAndUpdate(
    { _id: reportId, status: "open", resolving: { $ne: true } },
    { $set: { resolving: true } },
  );
  if (!report) {
    const exists = await reports().countDocuments({ _id: reportId });
    throw new ReportError(exists ? "notOpen" : "notFound", exists ? 409 : 404);
  }

  const release = () =>
    reports().updateOne({ _id: reportId }, { $unset: { resolving: "" } });

  let contributionId: ObjectId | undefined;
  let authorId: ObjectId | undefined;
  const authorIds: ObjectId[] = [];
  try {
    if (!REPORT_ACTIONS_BY_TARGET[report.target.type].includes(input.action)) {
      throw new ReportError("invalidAction", 400);
    }

    if (input.action === "delete" && !canDelete(report.target, rights)) {
      throw new ReportError("notAllowed", 403);
    }

    const history = await historyOf(report.target);
    const authors = await authorsOf(report.target, history);
    // On ne tranche ni ce qu'on a signalé, ni ce qu'on a écrit : comme une
    // contribution, un dossier se fait juger par quelqu'un d'autre.
    if (
      report.entries.some((entry) => entry.userId.equals(moderator.id)) ||
      authors.some((author) => author.id === String(moderator.id))
    ) {
      throw new ReportError("ownDossier", 403);
    }

    if (input.sanction) {
      const chosen =
        authors.find((author) => author.id === input.authorId) ??
        (authors.length === 1 ? authors[0] : undefined);
      if (!chosen) throw new ReportError("invalidAction", 400);
      authorId = new ObjectId(chosen.id);
      authorIds.push(authorId);
    }

    if (input.action === "revert") {
      const chosen =
        history.find((doc) => String(doc._id) === input.contributionId) ??
        (report.target.type === "placeMedia" ? history[0] : undefined);
      if (!chosen) throw new ReportError("contributionRequired", 400);
      contributionId = chosen._id;
      authorIds.push(chosen.userId);
      try {
        await revertContribution(String(chosen._id), moderator, input.force);
      } catch (error) {
        if (error instanceof ContributionError) {
          // `revertConflict` remonte tel quel : l'interface propose de forcer.
          throw new ReportError(
            "actionFailed",
            error.status,
            error.code === "revertConflict"
              ? "revertConflict"
              : (error.detail ?? error.code),
          );
        }
        throw error;
      }
    } else if (input.action === "delete") {
      await deleteTarget(report, moderator);
      // Une image ou une organisation retirée a un seul auteur : celui qui
      // l'a envoyée, ou qui l'a fondée. Une fiche retirée n'accuse personne
      // en particulier.
      if (
        (report.target.type === "placeMedia" || report.target.type === "org") &&
        authors[0]
      ) {
        authorIds.push(new ObjectId(authors[0].id));
      }
    }
  } catch (error) {
    await release();
    throw error;
  }

  const now = new Date();
  const upheld = input.action !== "dismiss";
  const updated = await reports().findOneAndUpdate(
    { _id: reportId },
    {
      $set: {
        status: upheld ? "resolved" : "dismissed",
        updatedAt: now,
        resolution: {
          action: input.action,
          by: moderator.id,
          byName: moderator.name,
          at: now,
          note: input.note,
          contributionId,
          sanction: input.sanction,
          authorId,
          // Ce qui est retenu compte contre ceux qui en répondent : l'auteur
          // de la contribution annulée, de l'image ou de l'organisation
          // retirée, l'auteur sanctionné. Pas tous ceux qui ont touché la
          // fiche.
          ...(upheld && authorIds.length > 0
            ? {
                authorIds: [
                  ...new Map(authorIds.map((id) => [String(id), id])).values(),
                ],
              }
            : {}),
        },
      },
      $unset: { resolving: "" },
    },
    { returnDocument: "after" },
  );

  // Retirée ou annulée, l'image n'a plus rien à démasquer ; classée ou
  // corrigée, elle revient.
  // Le dossier tel qu'il est clos : c'est lui qui dit s'il a été masqué.
  const closed = updated ?? report;
  if (input.action === "dismiss" || input.action === "correct") {
    await unmask(closed);
  }

  try {
    if (upheld) await rewardReporters(closed, now);
    else await strikeReporters(closed, now);
  } catch (error) {
    console.error("Suite de signalement impossible", error);
  }

  if (input.sanction && authorId) {
    await sanctionAuthor(
      report,
      input.sanction,
      authorId,
      moderator,
      input.note,
      now,
    );
  }

  await logModeration({
    by: moderator.id,
    byName: moderator.name,
    action: `report.${input.action}`,
    reportId,
    contributionId,
    target: {
      type: report.target.type,
      id: report.target.id,
      name: report.target.name,
    },
    note: input.note,
  });

  return toReport(updated!);
}
