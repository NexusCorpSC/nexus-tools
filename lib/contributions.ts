import "server-only";
import { ObjectId } from "mongodb";
import { del } from "@vercel/blob";
import db from "@/lib/db";
import { getPlaceBySlug, setPlaceImageIfMissing } from "@/lib/places";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import {
  ACCEPTANCE_WINDOW,
  DIRECT_MEDIA_DAILY_CAP,
  DIRECT_MEDIA_LEVEL,
  LEVELS,
  MAX_GAME_VERSION_LENGTH,
  MAX_MEDIA_CAPTION_LENGTH,
  MAX_MEDIA_CREDIT_LENGTH,
  MAX_MEDIA_PER_CONTRIBUTION,
  MAX_PENDING_RECRUIT,
  MAX_REJECT_MESSAGE_LENGTH,
  MIN_ACCEPTANCE_RATE,
  MIN_REVIEWED_FOR_RATE,
  POINTS,
  type Contribution,
  type ContributionErrorCode,
  type ContributionKind,
  type ContributionReview,
  type ContributionStatus,
  type ContributionTarget,
  type ContributorStanding,
  type PlaceMedia,
  type PlaceMediaInput,
  type PendingContribution,
  type RejectReason,
  type SubmitContributionResult,
  levelForPoints,
} from "@/types/contributions";

/**
 * Les contributions de la communauté, et ce qu'elles rapportent.
 *
 * Trois collections :
 * - `contributions`, l'unité de relecture et de crédit ;
 * - `placeMedia`, les images de lieux, publiées ou non ;
 * - `pointEvents`, le registre des points. `users.contrib.points` n'en est que
 *   la somme tenue à jour, pour ne pas la recalculer à chaque affichage.
 */

/**
 * Le seul stockage dont on accepte les images : celui où `/api/lieux/upload`
 * téléverse. Une URL d'ailleurs casserait `next/image`, dont les hôtes sont
 * listés dans `next.config.ts`, et ferait de la galerie un hébergeur de liens.
 */
const BLOB_HOST = "gwgsmex5adyadzri.public.blob.vercel-storage.com";

/**
 * Le chemin exact que `/api/lieux/upload` accorde, suffixe aléatoire compris.
 * Un simple préfixe laisserait passer `#…`, `%2F` ou des segments en plus : la
 * même image sous une autre adresse, que le refus enverrait ensuite à `del()`.
 */
const MEDIA_PATH =
  /^\/lieux\/([a-z0-9-]{1,120})\/media\/[A-Za-z0-9_-]{1,120}\.(?:jpe?g|png|webp)$/i;

const MAX_IMAGE_SIDE = 20_000;

interface DbUser {
  _id: ObjectId;
  name?: string;
  isAdmin?: boolean;
  permissions?: string[];
  contrib?: {
    points?: number;
    /** Fixé par un admin, il passe avant les points. */
    trustLevel?: number;
  };
}

interface DbContribution {
  _id: ObjectId;
  userId: ObjectId;
  userName?: string;
  kind: ContributionKind;
  target: ContributionTarget;
  status: ContributionStatus;
  mediaIds: ObjectId[];
  gameVersion?: string;
  points: number;
  createdAt: Date;
  review?: {
    by: ObjectId;
    byName?: string;
    at: Date;
    reason?: RejectReason;
    message?: string;
  };
  publishedAt?: Date;
}

interface DbPlaceMedia {
  _id: ObjectId;
  placeSlug: string;
  url: string;
  width: number;
  height: number;
  caption?: string;
  credit?: string;
  userId: ObjectId;
  userName?: string;
  contributionId: ObjectId;
  status: ContributionStatus;
  createdAt: Date;
}

interface DbPointEvent {
  _id?: ObjectId;
  userId: ObjectId;
  contributionId: ObjectId;
  delta: number;
  /**
   * `firstMedia` porte le slug du lieu : un index unique sur ce couple fait
   * qu'un seul auteur touche le bonus, même publié en même temps qu'un autre.
   */
  reason: "published" | "firstMedia";
  placeSlug?: string;
  at: Date;
}

const users = () => db.db().collection<DbUser>("users");
const contributions = () => db.db().collection<DbContribution>("contributions");
const placeMedia = () => db.db().collection<DbPlaceMedia>("placeMedia");
const pointEvents = () => db.db().collection<DbPointEvent>("pointEvents");

export class ContributionError extends Error {
  constructor(
    readonly code: ContributionErrorCode,
    readonly status: number,
  ) {
    super(code);
  }
}

export type Contributor = { id: ObjectId; name?: string };

// ─── Lecture ────────────────────────────────────────────────────────────────

function toContribution(doc: DbContribution): Contribution {
  const review: ContributionReview | undefined = doc.review
    ? {
        by: String(doc.review.by),
        byName: doc.review.byName,
        at: doc.review.at.toISOString(),
        reason: doc.review.reason,
        message: doc.review.message,
      }
    : undefined;

  return {
    id: String(doc._id),
    userId: String(doc.userId),
    userName: doc.userName,
    kind: doc.kind,
    target: doc.target,
    status: doc.status,
    mediaIds: doc.mediaIds.map(String),
    gameVersion: doc.gameVersion,
    points: doc.points,
    createdAt: doc.createdAt.toISOString(),
    review,
    publishedAt: doc.publishedAt?.toISOString(),
  };
}

function toPlaceMedia(doc: DbPlaceMedia): PlaceMedia {
  return {
    id: String(doc._id),
    placeSlug: doc.placeSlug,
    url: doc.url,
    width: doc.width,
    height: doc.height,
    caption: doc.caption,
    credit: doc.credit,
    userId: String(doc.userId),
    userName: doc.userName,
    contributionId: String(doc.contributionId),
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** La galerie publiée d'un lieu, dans l'ordre où elle s'est constituée. */
export async function listPlaceMedia(slug: string): Promise<PlaceMedia[]> {
  const docs = await placeMedia()
    .find({ placeSlug: slug, status: "published" })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(toPlaceMedia);
}

/** Ce que l'auteur a envoyé sur ce lieu et qui attend encore sa relecture. */
export async function countMyPendingMedia(
  slug: string,
  userId: ObjectId,
): Promise<number> {
  return placeMedia().countDocuments({
    placeSlug: slug,
    userId,
    status: "pending",
  });
}

// ─── Niveau et confiance ────────────────────────────────────────────────────

/**
 * Où en est un contributeur : ses points, son niveau, et ce que ce niveau lui
 * permet. Le niveau tient compte de la fiabilité — en dessous de 80 %
 * d'acceptation sur ses dernières relectures, on redevient Recrue, et tout ce
 * qu'on envoie est relu d'abord.
 */
export async function getStanding(
  userId: ObjectId,
): Promise<ContributorStanding> {
  const [user, pending, reviewed] = await Promise.all([
    users().findOne(
      { _id: userId },
      { projection: { isAdmin: 1, permissions: 1, contrib: 1 } },
    ),
    contributions().countDocuments({ userId, status: "pending" }),
    contributions()
      .find(
        { userId, "review.by": { $exists: true } },
        { projection: { status: 1 } },
      )
      .sort({ createdAt: -1 })
      .limit(ACCEPTANCE_WINDOW)
      .toArray(),
  ]);

  const points = user?.contrib?.points ?? 0;
  const acceptanceRate =
    reviewed.length > 0
      ? reviewed.filter((doc) => doc.status === "published").length /
        reviewed.length
      : undefined;

  const earned = levelForPoints(points);
  let level: number = earned.level;
  if (
    acceptanceRate !== undefined &&
    reviewed.length >= MIN_REVIEWED_FOR_RATE &&
    acceptanceRate < MIN_ACCEPTANCE_RATE
  ) {
    level = 1;
  }
  // Tenir le catalogue vaut le dernier niveau : ces comptes écrivaient déjà
  // sans relecture, la contribution ne doit pas leur en imposer une.
  if (
    user?.isAdmin === true ||
    user?.permissions?.includes(PLACES_EDIT_PERMISSION)
  ) {
    level = 5;
  }
  const trustLevel = user?.contrib?.trustLevel;
  if (typeof trustLevel === "number" && trustLevel >= 1 && trustLevel <= 5) {
    level = Math.floor(trustLevel);
  }

  const entry = LEVELS.find((candidate) => candidate.level === level)!;
  const next = LEVELS.find((candidate) => candidate.level === earned.level + 1);

  return {
    points,
    level,
    levelKey: entry.key,
    nextLevelPoints:
      next && Number.isFinite(next.minPoints) ? next.minPoints : undefined,
    acceptanceRate,
    pending,
  };
}

// ─── Envoi ──────────────────────────────────────────────────────────────────

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().slice(0, max).trim();
  return text || undefined;
}

/**
 * Une image n'est acceptée que si elle vient du stockage du site, sous le
 * dossier des images de ce lieu-là : c'est ce que la route de téléversement
 * accorde à un joueur connecté, et rien d'autre.
 */
function normalizeMediaInput(slug: string, input: unknown): PlaceMediaInput {
  const raw = (input ?? {}) as Partial<PlaceMediaInput>;
  if (typeof raw.url !== "string") {
    throw new ContributionError("invalidMedia", 400);
  }

  let url: URL;
  try {
    url = new URL(raw.url);
  } catch {
    throw new ContributionError("invalidMedia", 400);
  }
  const path = MEDIA_PATH.exec(url.pathname);
  if (
    url.protocol !== "https:" ||
    url.hostname !== BLOB_HOST ||
    url.port ||
    url.username ||
    url.password ||
    /[?#]/.test(raw.url) ||
    path?.[1] !== slug
  ) {
    throw new ContributionError("invalidMedia", 400);
  }

  const width = Number(raw.width);
  const height = Number(raw.height);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_SIDE ||
    height > MAX_IMAGE_SIDE
  ) {
    throw new ContributionError("invalidMedia", 400);
  }

  return {
    // Une seule écriture par image : c'est elle que l'index unique compare.
    url: `${url.origin}${url.pathname}`,
    width,
    height,
    caption: cleanText(raw.caption, MAX_MEDIA_CAPTION_LENGTH),
    credit: cleanText(raw.credit, MAX_MEDIA_CREDIT_LENGTH),
  };
}

/**
 * Ajoute des images à la galerie d'un lieu. Publiées tout de suite à partir du
 * niveau 2, relues d'abord en dessous.
 */
export async function submitPlaceMedia(
  author: Contributor,
  slug: string,
  inputs: unknown,
  gameVersion?: unknown,
): Promise<SubmitContributionResult> {
  const place = await getPlaceBySlug(slug);
  if (!place) throw new ContributionError("placeNotFound", 404);

  if (!Array.isArray(inputs) || inputs.length === 0) {
    throw new ContributionError("noMedia", 400);
  }
  if (inputs.length > MAX_MEDIA_PER_CONTRIBUTION) {
    throw new ContributionError("tooManyMedia", 400);
  }

  const images = inputs.map((input) => normalizeMediaInput(slug, input));
  if (new Set(images.map((image) => image.url)).size !== images.length) {
    throw new ContributionError("invalidMedia", 400);
  }
  const reused = await placeMedia().countDocuments({
    url: { $in: images.map((image) => image.url) },
  });
  if (reused > 0) throw new ContributionError("invalidMedia", 400);

  const standing = await getStanding(author.id);
  if (
    standing.level < DIRECT_MEDIA_LEVEL &&
    standing.pending >= MAX_PENDING_RECRUIT
  ) {
    throw new ContributionError("tooManyPending", 429);
  }
  // Au-delà du plafond du jour, l'envoi n'est pas refusé : il passe par la
  // file, comme celui d'une Recrue.
  const direct =
    standing.level >= DIRECT_MEDIA_LEVEL &&
    (standing.level >= 5 ||
      (await countDirectMediaToday(author.id)) + images.length <=
        DIRECT_MEDIA_DAILY_CAP);

  const now = new Date();
  const contributionId = new ObjectId();
  const media: DbPlaceMedia[] = images.map((image) => ({
    _id: new ObjectId(),
    placeSlug: slug,
    url: image.url,
    width: image.width,
    height: image.height,
    caption: image.caption,
    credit: image.credit,
    userId: author.id,
    userName: author.name,
    contributionId,
    status: "pending",
    createdAt: now,
  }));

  const contribution: DbContribution = {
    _id: contributionId,
    userId: author.id,
    userName: author.name,
    kind: "media",
    target: { type: "place", slug, name: place.name },
    status: "pending",
    mediaIds: media.map((image) => image._id),
    gameVersion: cleanText(gameVersion, MAX_GAME_VERSION_LENGTH),
    points: 0,
    createdAt: now,
  };

  try {
    await placeMedia().insertMany(media);
    await contributions().insertOne(contribution);
  } catch (error) {
    // Pas d'image en attente sans contribution : personne ne la relirait.
    await placeMedia().deleteMany({ contributionId });
    // Deux envois simultanés de la même image : l'index unique tranche.
    if (isDuplicateKey(error)) throw new ContributionError("invalidMedia", 400);
    throw error;
  }

  const result = direct
    ? await publish(contribution, null)
    : toContribution(contribution);

  return { contribution: result, standing: await getStanding(author.id) };
}

function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 11000;
}

/** Les images publiées sans relecture par ce joueur depuis 24 heures. */
async function countDirectMediaToday(userId: ObjectId): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await contributions()
    .aggregate<{ count: number }>([
      {
        $match: {
          userId,
          status: "published",
          publishedAt: { $gte: since },
          "review.by": { $exists: false },
        },
      },
      { $group: { _id: null, count: { $sum: { $size: "$mediaIds" } } } },
    ])
    .toArray();
  return row?.count ?? 0;
}

// ─── Relecture ──────────────────────────────────────────────────────────────

/**
 * Publie une contribution en attente : ses images rejoignent la galerie, et
 * l'auteur est crédité. `reviewer` est absent pour une publication directe.
 *
 * Le passage de `pending` à `published` est le verrou : deux relecteurs qui
 * publient en même temps ne créditent l'auteur qu'une fois. Tout ce qui dépend
 * de l'état du lieu (bonus de première image, vignette) se décide après lui,
 * par des écritures conditionnelles plutôt que sur une lecture faite avant.
 */
async function publish(
  contribution: DbContribution,
  reviewer: Contributor | null,
): Promise<Contribution> {
  const slug = contribution.target.slug;
  const now = new Date();

  const locked = await contributions().findOneAndUpdate(
    { _id: contribution._id, status: "pending" },
    {
      $set: {
        status: "published",
        publishedAt: now,
        ...(reviewer
          ? { review: { by: reviewer.id, byName: reviewer.name, at: now } }
          : {}),
      },
    },
  );
  if (!locked) throw new ContributionError("notPending", 409);

  await placeMedia().updateMany(
    { _id: { $in: contribution.mediaIds } },
    { $set: { status: "published" } },
  );

  const mediaPoints = contribution.mediaIds.length * POINTS.media;
  const bonus = (await claimFirstMedia(contribution, now))
    ? POINTS.firstMedia
    : 0;
  await pointEvents().insertOne({
    userId: contribution.userId,
    contributionId: contribution._id,
    delta: mediaPoints,
    reason: "published",
    at: now,
  });
  await users().updateOne(
    { _id: contribution.userId },
    { $inc: { "contrib.points": mediaPoints + bonus } },
  );
  const updated = await contributions().findOneAndUpdate(
    { _id: contribution._id },
    { $set: { points: mediaPoints + bonus } },
    { returnDocument: "after" },
  );

  // La vignette se voit partout où le lieu est cité : elle ne vient que d'une
  // image qu'un humain a regardée, et ne remplace jamais celle d'un admin.
  if (reviewer) {
    const cover = await placeMedia().findOne(
      { _id: { $in: contribution.mediaIds } },
      { sort: { createdAt: 1 } },
    );
    if (cover) await setPlaceImageIfMissing(slug, cover.url);
  }

  return toContribution(updated!);
}

/**
 * Le bonus de première image d'un lieu qui n'en avait aucune. Au plus un
 * auteur le touche : l'index unique de `pointEvents` sur `(placeSlug, reason)`
 * départage deux publications simultanées.
 */
async function claimFirstMedia(
  contribution: DbContribution,
  at: Date,
): Promise<boolean> {
  const slug = contribution.target.slug;
  const [others, place] = await Promise.all([
    placeMedia().countDocuments({
      placeSlug: slug,
      status: "published",
      contributionId: { $ne: contribution._id },
    }),
    getPlaceBySlug(slug),
  ]);
  if (others > 0 || !place || place.imageUrl) return false;

  try {
    await pointEvents().insertOne({
      userId: contribution.userId,
      contributionId: contribution._id,
      delta: POINTS.firstMedia,
      reason: "firstMedia",
      placeSlug: slug,
      at,
    });
    return true;
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
}

async function findPending(id: string): Promise<DbContribution> {
  if (!ObjectId.isValid(id)) throw new ContributionError("notFound", 404);
  const doc = await contributions().findOne({ _id: new ObjectId(id) });
  if (!doc) throw new ContributionError("notFound", 404);
  if (doc.status !== "pending") throw new ContributionError("notPending", 409);
  return doc;
}

export async function publishContribution(
  id: string,
  reviewer: Contributor,
): Promise<Contribution> {
  const contribution = await findPending(id);
  // Se relire soi-même, c'est contourner la relecture et se créditer.
  if (contribution.userId.equals(reviewer.id)) {
    throw new ContributionError("ownContribution", 403);
  }
  return publish(contribution, reviewer);
}

/**
 * Refuse une contribution. Ses images quittent le stockage : une image refusée
 * n'a plus de raison d'occuper de la place, ni d'être servie à qui garderait
 * son adresse.
 */
export async function rejectContribution(
  id: string,
  reviewer: Contributor,
  reason: RejectReason,
  message?: string,
): Promise<Contribution> {
  const contribution = await findPending(id);
  const now = new Date();

  const updated = await contributions().findOneAndUpdate(
    { _id: contribution._id, status: "pending" },
    {
      $set: {
        status: "rejected",
        review: {
          by: reviewer.id,
          byName: reviewer.name,
          at: now,
          reason,
          message: cleanText(message, MAX_REJECT_MESSAGE_LENGTH),
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new ContributionError("notPending", 409);

  const media = await placeMedia()
    .find({ _id: { $in: contribution.mediaIds } }, { projection: { url: 1 } })
    .toArray();
  await placeMedia().updateMany(
    { _id: { $in: contribution.mediaIds } },
    { $set: { status: "rejected" } },
  );
  if (media.length > 0) {
    try {
      await del(media.map((image) => image.url));
    } catch (error) {
      // Le refus est acquis ; une image restée dans le stockage n'est servie
      // nulle part et se rattrape au prochain ménage.
      console.error("Suppression des images refusées impossible", error);
    }
  }

  return toContribution(updated);
}

// ─── File d'attente ─────────────────────────────────────────────────────────

/** La file d'attente, la plus ancienne d'abord, avec de quoi juger sur pièce. */
export async function listPendingContributions(
  limit = 300,
): Promise<{ items: PendingContribution[]; total: number }> {
  const [docs, total] = await Promise.all([
    contributions()
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray(),
    contributions().countDocuments({ status: "pending" }),
  ]);

  const mediaIds = docs.flatMap((doc) => doc.mediaIds);
  const authorIds = [...new Set(docs.map((doc) => String(doc.userId)))].map(
    (id) => new ObjectId(id),
  );
  const [media, authors] = await Promise.all([
    mediaIds.length > 0
      ? placeMedia()
          .find({ _id: { $in: mediaIds } })
          .toArray()
      : [],
    authorIds.length > 0
      ? users()
          .find({ _id: { $in: authorIds } }, { projection: { contrib: 1 } })
          .toArray()
      : [],
  ]);

  const mediaById = new Map(media.map((doc) => [String(doc._id), doc]));
  const pointsById = new Map(
    authors.map((doc) => [String(doc._id), doc.contrib?.points ?? 0]),
  );

  return {
    total,
    items: docs.map((doc) => ({
      ...toContribution(doc),
      media: doc.mediaIds
        .map((mediaId) => mediaById.get(String(mediaId)))
        .filter((entry): entry is DbPlaceMedia => Boolean(entry))
        .map(toPlaceMedia),
      authorPoints: pointsById.get(String(doc.userId)) ?? 0,
    })),
  };
}

export async function countPendingContributions(): Promise<number> {
  return contributions().countDocuments({ status: "pending" });
}

/** Les dernières contributions d'un joueur, pour son suivi. */
export async function listMyContributions(
  userId: ObjectId,
  limit = 50,
): Promise<Contribution[]> {
  const docs = await contributions()
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toContribution);
}
