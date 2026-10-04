import "server-only";
import { ObjectId, type Filter } from "mongodb";
import { del } from "@vercel/blob";
import {
  clearPlaceImageIf,
  getPlaceBySlug,
  setPlaceImageIfMissing,
} from "@/lib/places";
import {
  BLOB_HOST,
  ContributionError,
  cleanText,
  contributions,
  isDuplicateKey,
  placeMedia,
  pointEvents,
  toContribution,
  toPlaceMedia,
  users,
  type Contributor,
  type DbContribution,
  type DbPlaceMedia,
} from "@/lib/contribution-store";
import {
  applyCatalog,
  currentBefore,
  improvesValuedPlan,
  buildItemCreate,
  buildItemEdit,
  buildMissionEdit,
  buildPlaceCreate,
  buildPlaceEdit,
  buildPlan,
  planKey,
  planValue,
  revertCatalog,
  revertConflicts,
  type CatalogDraft,
} from "@/lib/contribution-catalog";
import { PLACES_EDIT_PERMISSION, type PlacePlan } from "@/types/places";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";
import {
  ACCEPTANCE_WINDOW,
  CHANGES_REQUESTED_TTL_DAYS,
  DIRECT_EDIT_DAILY_CAP,
  DIRECT_EDIT_LEVEL,
  DIRECT_MEDIA_DAILY_CAP,
  DIRECT_MEDIA_LEVEL,
  LEVELS,
  MAX_GAME_VERSION_LENGTH,
  MAX_MEDIA_CAPTION_LENGTH,
  MAX_MEDIA_CREDIT_LENGTH,
  MAX_MEDIA_PER_CONTRIBUTION,
  MAX_PENDING_RECRUIT,
  MAX_REJECT_MESSAGE_LENGTH,
  MAX_SOURCE_LENGTH,
  MIN_ACCEPTANCE_RATE,
  MIN_REVIEWED_FOR_RATE,
  POINTS,
  REVIEW_POINTS_LEVEL,
  REPEAT_EDIT_WINDOW_MS,
  type Contribution,
  type ContributionChange,
  type ContributionKind,
  type ContributionStatus,
  type ContributionTargetType,
  type ContributorStanding,
  type PendingContribution,
  type PlaceMedia,
  type PlaceMediaInput,
  type RejectReason,
  type SubmitContributionResult,
  levelForPoints,
} from "@/types/contributions";

import { evaluateAchievements, isReached } from "@/lib/achievements";
import { organizations } from "@/lib/orgs";

export { ContributionError, type Contributor } from "@/lib/contribution-store";

/**
 * Les contributions de la communauté, et ce qu'elles rapportent.
 *
 * Toutes suivent le même cycle : envoyées, elles attendent une relecture ou
 * sont publiées tout de suite selon le niveau de l'auteur ; relues, elles sont
 * publiées, renvoyées à corriger, ou refusées ; publiées, elles peuvent être
 * annulées. Les points ne sont crédités qu'à la publication, et repris à
 * l'annulation.
 *
 * Ce qui est propre aux images est ici ; ce qui est propre aux lieux, plans et
 * objets est dans `lib/contribution-catalog.ts`.
 */

/**
 * Le chemin exact que `/api/lieux/upload` accorde, suffixe aléatoire compris.
 * Un simple préfixe laisserait passer `#…`, `%2F` ou des segments en plus : la
 * même image sous une autre adresse, que le refus enverrait ensuite à `del()`.
 */
const MEDIA_PATH =
  /^\/lieux\/([a-z0-9-]{1,120})\/media\/[A-Za-z0-9_-]{1,120}\.(?:jpe?g|png|webp)$/i;

const MAX_IMAGE_SIDE = 20_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ce qui occupe encore la place d'une contribution en attente. */
const OPEN_STATUSES: ContributionStatus[] = [
  "pending",
  "changesRequested",
  "publishing",
];

// ─── Lecture ────────────────────────────────────────────────────────────────

/** La galerie publiée d'un lieu, dans l'ordre où elle s'est constituée. */
export async function listPlaceMedia(slug: string): Promise<PlaceMedia[]> {
  const docs = await placeMedia()
    .find({
      placeSlug: slug,
      status: "published",
      hiddenByReport: { $ne: true },
    })
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

/**
 * Les contributions de l'auteur encore ouvertes sur cette fiche : de quoi lui
 * dire qu'une proposition attend, ou qu'elle lui revient à corriger.
 */
export async function listMyOpenContributions(
  userId: ObjectId,
  target: { type: ContributionTargetType; slug: string },
): Promise<Contribution[]> {
  await expireChangesRequested();
  const docs = await contributions()
    .find({
      userId,
      "target.type": target.type,
      "target.slug": target.slug,
      kind: { $ne: "media" },
      status: { $in: ["pending", "changesRequested"] },
    })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return docs.map(toContribution);
}

/** Une contribution, pour la relecture. */
export async function getContribution(
  id: string,
): Promise<Contribution | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await contributions().findOne({ _id: new ObjectId(id) });
  return doc ? toContribution(doc) : null;
}

/** Une contribution de l'auteur, pour la reprendre dans son formulaire. */
export async function getMyContribution(
  id: string,
  userId: ObjectId,
): Promise<Contribution | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await contributions().findOne({ _id: new ObjectId(id), userId });
  return doc ? toContribution(doc) : null;
}

// ─── Niveau et confiance ────────────────────────────────────────────────────

/**
 * Où en est un contributeur : ses points, son niveau, et ce que ce niveau lui
 * permet. Le niveau tient compte de la fiabilité — en dessous de 80 %
 * d'acceptation sur ses dernières contributions jugées, on redevient Recrue,
 * et tout ce qu'on envoie est relu d'abord. Une publication directe annulée
 * compte comme un refus : c'est la relecture après coup qui l'a jugée.
 */
export async function getStanding(
  userId: ObjectId,
): Promise<ContributorStanding> {
  const [user, pending, reviewed] = await Promise.all([
    users().findOne(
      { _id: userId },
      { projection: { isAdmin: 1, permissions: 1, contrib: 1 } },
    ),
    contributions().countDocuments({ userId, status: { $in: OPEN_STATUSES } }),
    contributions()
      .find(
        {
          userId,
          status: { $in: ["published", "rejected", "reverted"] },
          $or: [
            { "review.by": { $exists: true } },
            { revert: { $exists: true } },
          ],
        },
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
    user?.permissions?.includes(PLACES_EDIT_PERMISSION) ||
    user?.permissions?.includes(ITEMS_EDIT_PERMISSION)
  ) {
    level = 5;
  }
  const trustLevel = user?.contrib?.trustLevel;
  if (typeof trustLevel === "number" && trustLevel >= 1 && trustLevel <= 5) {
    level = Math.floor(trustLevel);
  }

  const entry = LEVELS.find((candidate) => candidate.level === level)!;
  const next = LEVELS.find((candidate) => candidate.level === earned.level + 1);
  const suspendedUntil = user?.contrib?.suspendedUntil;

  return {
    points,
    level,
    levelKey: entry.key,
    nextLevelPoints:
      next && Number.isFinite(next.minPoints) ? next.minPoints : undefined,
    acceptanceRate,
    pending,
    suspendedUntil:
      suspendedUntil && suspendedUntil > new Date()
        ? suspendedUntil.toISOString()
        : undefined,
  };
}

/**
 * Après tout ce qui change les points ou la fiabilité d'un joueur : son niveau
 * est réécrit sur son compte, pour les crédits et le classement, et les succès
 * qu'il vient d'atteindre sont débloqués. Ne lève jamais : la publication ou
 * la décision qui l'appelle est déjà faite.
 */
export async function refreshProgress(userId: ObjectId): Promise<void> {
  try {
    const [standing, user] = await Promise.all([
      getStanding(userId),
      users().findOne(
        { _id: userId },
        { projection: { "contrib.level": 1, "contrib.achievements": 1 } },
      ),
    ]);
    const now = new Date();
    const previous = user?.contrib?.level;
    const reached = (
      await evaluateAchievements(userId, user?.contrib?.achievements)
    ).filter(isReached);

    await users().updateOne(
      { _id: userId },
      {
        $set: {
          "contrib.level": standing.level,
          // Le premier calcul n'est pas une montée : rien à annoncer.
          ...(previous !== undefined && standing.level > previous
            ? { "contrib.levelUp": { level: standing.level, at: now } }
            : {}),
        },
      },
    );
    for (const achievement of reached) {
      // Le filtre fait qu'un succès débloqué deux fois en même temps ne
      // s'enregistre qu'une fois.
      await users().updateOne(
        { _id: userId, "contrib.achievements.id": { $ne: achievement.id } },
        {
          $push: {
            "contrib.achievements": {
              id: achievement.id,
              at: now,
              ...(achievement.name ? { name: achievement.name } : {}),
            },
          },
        },
      );
    }
  } catch (error) {
    console.error("Progression du contributeur impossible", error);
  }
}

// ─── Envoi d'images ─────────────────────────────────────────────────────────

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
  if (standing.suspendedUntil) throw new ContributionError("suspended", 403);
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
    updatedAt: now,
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

/** Les images publiées sans relecture par ce joueur depuis 24 heures. */
async function countDirectMediaToday(userId: ObjectId): Promise<number> {
  const since = new Date(Date.now() - DAY_MS);
  const [row] = await contributions()
    .aggregate<{ count: number }>([
      {
        $match: {
          userId,
          kind: "media",
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

// ─── Envoi au catalogue ─────────────────────────────────────────────────────

/** Ce qu'un formulaire de contribution envoie, quelle que soit la fiche. */
export type CatalogSubmission =
  | { kind: "placeCreate"; parentSlug: string; input: unknown }
  | { kind: "placeEdit"; slug: string; input: unknown }
  | { kind: "plan"; slug: string; plan: unknown }
  | { kind: "itemCreate"; input: unknown }
  | { kind: "itemEdit"; slug: string; input: unknown }
  | { kind: "missionEdit"; missionId: string; input: unknown };

export type CatalogSubmissionMeta = {
  /** La contribution reprise : en attente, ou renvoyée à corriger. */
  contributionId?: string;
  source?: unknown;
  gameVersion?: unknown;
};

async function buildDraft(
  submission: CatalogSubmission,
  level: number,
): Promise<CatalogDraft> {
  switch (submission.kind) {
    case "placeCreate":
      return buildPlaceCreate(submission.parentSlug, submission.input);
    case "placeEdit":
      return buildPlaceEdit(submission.slug, submission.input, level);
    case "plan":
      return buildPlan(submission.slug, submission.plan);
    case "itemCreate":
      return buildItemCreate(submission.input);
    case "itemEdit":
      return buildItemEdit(submission.slug, submission.input, level);
    case "missionEdit":
      return buildMissionEdit(submission.missionId, submission.input);
    default:
      // L'envoi vient du navigateur : une nature inconnue est une saisie
      // invalide, pas une erreur du serveur.
      throw new ContributionError("invalidInput", 400);
  }
}

/** Ce qui identifie « la même proposition » pour la reprendre plutôt que la doubler. */
function sameTargetFilter(draft: CatalogDraft): Filter<DbContribution> {
  return {
    kind: draft.kind,
    "target.type": draft.target.type,
    "target.slug": draft.target.slug,
    ...(draft.target.planId ? { "target.planId": draft.target.planId } : {}),
  };
}

/** Les publications directes hors images de ce joueur depuis 24 heures. */
async function countDirectEditsToday(userId: ObjectId): Promise<number> {
  return contributions().countDocuments({
    userId,
    kind: { $ne: "media" },
    status: "published",
    publishedAt: { $gte: new Date(Date.now() - DAY_MS) },
    "review.by": { $exists: false },
  });
}

/**
 * Propose un lieu, un plan, un objet, ou une correction. Publiée tout de suite
 * à partir du niveau 3, relue d'abord en dessous.
 *
 * Une proposition qui vise ce que l'auteur a déjà en attente — le même lieu à
 * corriger, le même plan — reprend celle-ci plutôt que d'en ouvrir une
 * seconde : c'est ce qui fait d'un relevé enregistré dix fois une seule
 * contribution.
 */
export async function submitCatalogContribution(
  author: Contributor,
  submission: CatalogSubmission,
  meta: CatalogSubmissionMeta = {},
): Promise<SubmitContributionResult> {
  const standing = await getStanding(author.id);
  if (standing.suspendedUntil) throw new ContributionError("suspended", 403);
  const draft = await buildDraft(submission, standing.level);

  let resumeFilter: Filter<DbContribution> = sameTargetFilter(draft);
  if (meta.contributionId) {
    if (!ObjectId.isValid(meta.contributionId)) {
      throw new ContributionError("notFound", 404);
    }
    resumeFilter = { _id: new ObjectId(meta.contributionId) };
  }
  const resumed = await contributions().findOne({
    ...resumeFilter,
    userId: author.id,
    kind: draft.kind,
    status: { $in: ["pending", "changesRequested"] },
  });
  if (meta.contributionId && !resumed) {
    throw new ContributionError("notPending", 409);
  }

  if (!resumed) {
    if (
      standing.level < DIRECT_EDIT_LEVEL &&
      standing.pending >= MAX_PENDING_RECRUIT
    ) {
      throw new ContributionError("tooManyPending", 429);
    }
    // Deux propositions du même lieu ou du même objet : la seconde attendrait
    // une relecture qui ne pourrait que la refuser.
    if (draft.kind === "placeCreate" || draft.kind === "itemCreate") {
      const taken = await contributions().countDocuments({
        ...sameTargetFilter(draft),
        status: { $in: OPEN_STATUSES },
      });
      if (taken > 0) throw new ContributionError("duplicate", 409);
    }
  }

  const direct =
    standing.level >= DIRECT_EDIT_LEVEL &&
    (standing.level >= 5 ||
      (await countDirectEditsToday(author.id)) < DIRECT_EDIT_DAILY_CAP);

  const now = new Date();
  const fields = {
    userName: author.name,
    target: draft.target,
    proposal: draft.proposal,
    fields: draft.fields,
    before: draft.before,
    after: draft.after,
    changes: draft.changes,
    points: draft.points,
    preview: draft.preview,
    source: cleanText(meta.source, MAX_SOURCE_LENGTH),
    gameVersion: cleanText(meta.gameVersion, MAX_GAME_VERSION_LENGTH),
    updatedAt: now,
  };

  let contribution: DbContribution;
  if (resumed) {
    const updated = await contributions().findOneAndUpdate(
      {
        _id: resumed._id,
        status: { $in: ["pending", "changesRequested"] },
      },
      // Reprise, elle repart en relecture comme neuve : le relecteur d'avant
      // n'a pas vu cette version, et une publication directe ne doit pas
      // passer pour relue.
      { $set: { ...fields, status: "pending" }, $unset: { review: "" } },
      { returnDocument: "after" },
    );
    if (!updated) throw new ContributionError("notPending", 409);
    contribution = updated;
  } else {
    contribution = {
      _id: new ObjectId(),
      userId: author.id,
      kind: draft.kind,
      status: "pending",
      mediaIds: [],
      createdAt: now,
      ...fields,
    };
    await contributions().insertOne(contribution);
  }

  const result = direct
    ? await publish(contribution, null)
    : toContribution(contribution);

  return { contribution: result, standing: await getStanding(author.id) };
}

// ─── Publication ────────────────────────────────────────────────────────────

/**
 * Le bonus de première image d'un lieu qui n'en avait aucune. Au plus un
 * auteur le touche : l'index unique de `pointEvents` sur `(placeSlug, reason)`
 * départage deux publications simultanées.
 */
async function claimFirstMedia(
  contribution: DbContribution,
  at: Date,
): Promise<number> {
  const slug = contribution.target.slug;
  const [others, place] = await Promise.all([
    placeMedia().countDocuments({
      placeSlug: slug,
      status: "published",
      contributionId: { $ne: contribution._id },
    }),
    getPlaceBySlug(slug),
  ]);
  if (others > 0 || !place || place.imageUrl) return 0;

  try {
    await pointEvents().insertOne({
      userId: contribution.userId,
      contributionId: contribution._id,
      delta: POINTS.firstMedia,
      reason: "firstMedia",
      placeSlug: slug,
      at,
    });
    return POINTS.firstMedia;
  } catch (error) {
    if (isDuplicateKey(error)) return 0;
    throw error;
  }
}

/**
 * Ce que vaut un plan à sa première publication utile — un relevé ne compte
 * qu'à sa première pièce. Une seule fois par plan, quel que soit le nombre de
 * reprises : l'index unique de `pointEvents` sur `planKey` le garantit.
 */
async function claimPlan(
  contribution: DbContribution,
  at: Date,
): Promise<number> {
  const value = planValue(contribution.proposal as PlacePlan);
  if (value === 0) return 0;

  try {
    await pointEvents().insertOne({
      userId: contribution.userId,
      contributionId: contribution._id,
      delta: value,
      reason: "plan",
      planKey: planKey(contribution),
      at,
    });
    return value;
  } catch (error) {
    if (isDuplicateKey(error)) return 0;
    throw error;
  }
}

/**
 * Une correction du même auteur sur la même fiche, déjà publiée dans les
 * dernières 24 heures, ne rapporte rien de plus.
 */
async function isRepeatEdit(contribution: DbContribution): Promise<boolean> {
  const repeat = await contributions().countDocuments({
    _id: { $ne: contribution._id },
    userId: contribution.userId,
    kind: contribution.kind,
    "target.type": contribution.target.type,
    "target.slug": contribution.target.slug,
    status: "published",
    publishedAt: { $gte: new Date(Date.now() - REPEAT_EDIT_WINDOW_MS) },
  });
  return repeat > 0;
}

/**
 * Un lieu sans bannière prend la plus ancienne image publiée de sa galerie :
 * la première contribuée, ou la suivante quand celle-là a été retirée. Ne
 * remplace jamais une bannière déjà posée, par un admin ou une image.
 */
export async function ensurePlaceCover(slug: string): Promise<void> {
  const first = await placeMedia().findOne(
    { placeSlug: slug, status: "published", hiddenByReport: { $ne: true } },
    { sort: { createdAt: 1, _id: 1 }, projection: { url: 1 } },
  );
  if (first) await setPlaceImageIfMissing(slug, first.url);
}

/** Les points d'une publication, bonus réservés compris. */
async function credit(
  contribution: DbContribution,
  at: Date,
): Promise<{ base: number; bonus: number }> {
  switch (contribution.kind) {
    case "media":
      return {
        base: contribution.mediaIds.length * POINTS.media,
        bonus: await claimFirstMedia(contribution, at),
      };
    case "plan": {
      // Corriger un relevé qui valait déjà quelque chose — celui d'un admin,
      // qui n'a jamais réclamé de bonus — reste une correction.
      const bonus = improvesValuedPlan(contribution)
        ? 0
        : await claimPlan(contribution, at);
      if (bonus > 0) return { base: 0, bonus };
      // Un plan repris, ou un relevé encore vide : une correction.
      const isNew = !contribution.before?.plan;
      return {
        base: isNew || (await isRepeatEdit(contribution)) ? 0 : POINTS.edit,
        bonus: 0,
      };
    }
    case "placeEdit":
    case "itemEdit":
    case "missionEdit":
      return {
        base: (await isRepeatEdit(contribution)) ? 0 : contribution.points,
        bonus: 0,
      };
    default:
      return { base: contribution.points, bonus: 0 };
  }
}

/**
 * Publie une contribution en attente et crédite son auteur. `reviewer` est
 * absent pour une publication directe.
 *
 * Le passage de `pending` à `publishing` est le verrou : deux relecteurs qui
 * publient en même temps n'écrivent et ne créditent qu'une fois. Si l'écriture
 * échoue — la fiche a changé au point de ne plus l'accepter —, la
 * contribution revient en attente avec l'erreur, et rien n'est crédité.
 */
async function publish(
  contribution: DbContribution,
  reviewer: Contributor | null,
  /** La version que le relecteur a vue : une reprise entre-temps l'invalide. */
  version?: Date,
): Promise<Contribution> {
  const locked = await contributions().findOneAndUpdate(
    {
      _id: contribution._id,
      status: "pending",
      ...(version ? { updatedAt: version } : {}),
    },
    { $set: { status: "publishing" } },
    { returnDocument: "after" },
  );
  if (!locked) throw new ContributionError("notPending", 409);
  // Ce qui est publié, c'est la version verrouillée, pas celle lue avant.
  contribution = locked;

  const now = new Date();
  try {
    if (contribution.kind === "media") {
      await placeMedia().updateMany(
        { _id: { $in: contribution.mediaIds } },
        { $set: { status: "published" } },
      );
    } else {
      const refreshed = await currentBefore(contribution);
      if (refreshed) {
        contribution = { ...contribution, ...refreshed };
        await contributions().updateOne(
          { _id: contribution._id },
          { $set: refreshed },
        );
      }
      await applyCatalog(contribution);
    }
  } catch (error) {
    await contributions().updateOne(
      { _id: contribution._id, status: "publishing" },
      { $set: { status: "pending" } },
    );
    throw error;
  }

  // La fiche est écrite : la contribution est publiée, quoi qu'il arrive au
  // crédit. Elle ne doit jamais rester coincée en `publishing`.
  await contributions().updateOne(
    { _id: contribution._id },
    {
      $set: {
        status: "published",
        publishedAt: now,
        updatedAt: now,
        ...(reviewer
          ? { review: { by: reviewer.id, byName: reviewer.name, at: now } }
          : {}),
      },
    },
  );

  try {
    const { base, bonus } = await credit(contribution, now);
    if (base > 0) {
      await pointEvents().insertOne({
        userId: contribution.userId,
        contributionId: contribution._id,
        delta: base,
        reason: "published",
        at: now,
      });
    }
    if (base + bonus > 0) {
      await users().updateOne(
        { _id: contribution.userId },
        { $inc: { "contrib.points": base + bonus } },
      );
    }
    await contributions().updateOne(
      { _id: contribution._id },
      { $set: { points: base + bonus } },
    );
  } catch (error) {
    console.error("Crédit de contribution impossible", error);
  }
  await refreshProgress(contribution.userId);

  // La première image publiée d'un lieu en devient la bannière, relue ou
  // publiée d'emblée ; jamais à la place d'une bannière déjà posée.
  if (contribution.kind === "media") {
    await ensurePlaceCover(contribution.target.slug);
  }

  const updated = await contributions().findOne({ _id: contribution._id });
  return toContribution(updated!);
}

/** Le filtre de version : la décision ne porte que sur ce que le relecteur a vu. */
function versionFilter(version?: string): { updatedAt?: Date } {
  if (!version) return {};
  const seen = new Date(version);
  return Number.isNaN(seen.getTime()) ? {} : { updatedAt: seen };
}

async function findContribution(id: string): Promise<DbContribution> {
  if (!ObjectId.isValid(id)) throw new ContributionError("notFound", 404);
  const doc = await contributions().findOne({ _id: new ObjectId(id) });
  if (!doc) throw new ContributionError("notFound", 404);
  return doc;
}

async function findPending(id: string): Promise<DbContribution> {
  const doc = await findContribution(id);
  if (doc.status !== "pending") throw new ContributionError("notPending", 409);
  return doc;
}

export async function publishContribution(
  id: string,
  reviewer: Contributor,
  /** `updatedAt` de la version relue ; une reprise depuis la fait refuser. */
  version?: string,
): Promise<Contribution> {
  const contribution = await findPending(id);
  // Se relire soi-même, c'est contourner la relecture et se créditer.
  if (contribution.userId.equals(reviewer.id)) {
    throw new ContributionError("ownContribution", 403);
  }
  const published = await publish(
    contribution,
    reviewer,
    versionFilter(version).updatedAt,
  );
  if (published.status === "published") {
    await creditReview(reviewer, contribution._id);
  }
  return published;
}

/**
 * Une relecture décidée rapporte au relecteur, à partir de
 * `REVIEW_POINTS_LEVEL`. Une contribution ne se décide qu'une fois : publiée
 * ou refusée. Ne lève jamais : la décision est déjà acquise.
 */
async function creditReview(reviewer: Contributor, contributionId: ObjectId) {
  try {
    const standing = await getStanding(reviewer.id);
    if (standing.level < REVIEW_POINTS_LEVEL) return;
    await pointEvents().insertOne({
      userId: reviewer.id,
      contributionId,
      delta: POINTS.review,
      reason: "review",
      at: new Date(),
    });
    await users().updateOne(
      { _id: reviewer.id },
      { $inc: { "contrib.points": POINTS.review } },
    );
    await refreshProgress(reviewer.id);
  } catch (error) {
    console.error("Crédit de relecture impossible", error);
  }
}

/** Supprime des images du stockage, sans faire échouer ce qui est déjà acquis. */
async function deleteBlobs(urls: string[]) {
  if (urls.length === 0) return;
  try {
    await del(urls);
  } catch (error) {
    // Une image restée dans le stockage n'est servie nulle part et se
    // rattrape au prochain ménage.
    console.error("Suppression d'images impossible", error);
  }
}

/**
 * Refuse une contribution, en attente ou renvoyée à corriger. Ses images
 * quittent le stockage : une image refusée n'a plus de raison d'occuper de la
 * place, ni d'être servie à qui garderait son adresse. Les images d'un plan
 * refusé restent : un plan publié du même lieu peut les partager.
 */
export async function rejectContribution(
  id: string,
  reviewer: Contributor,
  reason: RejectReason,
  message?: string,
  /** `updatedAt` de la version relue ; une reprise depuis la fait refuser. */
  version?: string,
): Promise<Contribution> {
  const contribution = await findContribution(id);
  const now = new Date();

  const updated = await contributions().findOneAndUpdate(
    {
      _id: contribution._id,
      status: { $in: ["pending", "changesRequested"] },
      ...versionFilter(version),
    },
    {
      $set: {
        status: "rejected",
        updatedAt: now,
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

  if (contribution.kind === "media") {
    const media = await placeMedia()
      .find({ _id: { $in: contribution.mediaIds } }, { projection: { url: 1 } })
      .toArray();
    await placeMedia().updateMany(
      { _id: { $in: contribution.mediaIds } },
      { $set: { status: "rejected" } },
    );
    await deleteBlobs(media.map((image) => image.url));
  }
  // Une organisation refusée reste à ses membres, privée : ses éditeurs lisent
  // pourquoi sur sa page.
  if (contribution.kind === "orgCreate") {
    await organizations().updateOne(
      { _id: contribution.target.slug },
      {
        $set: {
          public: false,
          validation: {
            status: "rejected",
            at: now,
            message: updated.review?.message,
          },
        },
      },
    );
  }

  // Un refus pèse sur la fiabilité, donc parfois sur le niveau.
  await refreshProgress(contribution.userId);
  if (!contribution.userId.equals(reviewer.id)) {
    await creditReview(reviewer, contribution._id);
  }
  return toContribution(updated);
}

/**
 * Renvoie une contribution à son auteur, avec ce qu'il faut reprendre. Pas pour
 * des images : il n'y a rien à y corriger, on les refuse ou on les publie.
 */
export async function requestChanges(
  id: string,
  reviewer: Contributor,
  message: string,
  version?: string,
): Promise<Contribution> {
  const contribution = await findPending(id);
  if (contribution.kind === "media") {
    throw new ContributionError("notAllowed", 400);
  }
  const text = cleanText(message, MAX_REJECT_MESSAGE_LENGTH);
  if (!text) throw new ContributionError("messageRequired", 400);

  const now = new Date();
  const updated = await contributions().findOneAndUpdate(
    { _id: contribution._id, status: "pending", ...versionFilter(version) },
    {
      $set: {
        status: "changesRequested",
        updatedAt: now,
        review: {
          by: reviewer.id,
          byName: reviewer.name,
          at: now,
          message: text,
        },
      },
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new ContributionError("notPending", 409);
  return toContribution(updated);
}

/** Ce qu'annuler écraserait, pour le montrer avant de confirmer. */
export async function listRevertConflicts(
  id: string,
): Promise<ContributionChange[]> {
  return revertConflicts(await findContribution(id));
}

/**
 * Annule une contribution publiée : l'état d'avant revient, et les points
 * qu'elle a rapportés sont retirés. Si la fiche a changé depuis sur les mêmes
 * champs, l'annulation écraserait le travail d'un autre : elle demande alors
 * `force`, que l'interface ne passe qu'après confirmation.
 */
export async function revertContribution(
  id: string,
  reviewer: Contributor,
  force = false,
): Promise<Contribution> {
  const contribution = await findContribution(id);
  if (contribution.status !== "published") {
    throw new ContributionError("notPublished", 409);
  }
  if (contribution.kind !== "media" && !force) {
    // Pour une création, le conflit, c'est ce que d'autres y ont ajouté.
    if ((await revertConflicts(contribution)).length > 0) {
      throw new ContributionError("revertConflict", 409);
    }
  }

  const locked = await contributions().findOneAndUpdate(
    { _id: contribution._id, status: "published" },
    { $set: { status: "publishing" } },
  );
  if (!locked) throw new ContributionError("notPublished", 409);

  try {
    if (contribution.kind === "media") {
      const media = await placeMedia()
        .find(
          { _id: { $in: contribution.mediaIds } },
          { projection: { url: 1 } },
        )
        .toArray();
      await placeMedia().updateMany(
        { _id: { $in: contribution.mediaIds } },
        { $set: { status: "reverted" } },
      );
      for (const image of media) {
        await clearPlaceImageIf(contribution.target.slug, image.url);
      }
      await ensurePlaceCover(contribution.target.slug);
      await deleteBlobs(media.map((image) => image.url));
    } else {
      await revertCatalog(contribution);
    }
  } catch (error) {
    await contributions().updateOne(
      { _id: contribution._id, status: "publishing" },
      { $set: { status: "published" } },
    );
    throw error;
  }

  // La fiche est remise : la contribution est annulée, quoi qu'il arrive au
  // décompte des points. Elle ne doit jamais rester coincée en `publishing`.
  const now = new Date();
  const updated = await contributions().findOneAndUpdate(
    { _id: contribution._id },
    {
      $set: {
        status: "reverted",
        updatedAt: now,
        revert: { by: reviewer.id, byName: reviewer.name, at: now },
      },
    },
    { returnDocument: "after" },
  );

  // Un lieu supprimé n'a plus de galerie : ses images partent avec lui.
  if (contribution.kind === "placeCreate") {
    const media = await placeMedia()
      .find(
        { placeSlug: contribution.target.slug, status: { $ne: "reverted" } },
        { projection: { url: 1 } },
      )
      .toArray();
    if (media.length > 0) {
      await placeMedia().updateMany(
        { _id: { $in: media.map((image) => image._id) } },
        { $set: { status: "reverted" } },
      );
      await deleteBlobs(media.map((image) => image.url));
    }
  }

  if (contribution.points > 0) {
    try {
      await pointEvents().insertOne({
        userId: contribution.userId,
        contributionId: contribution._id,
        delta: -contribution.points,
        reason: "reverted",
        at: now,
      });
      await users().updateOne(
        { _id: contribution.userId },
        { $inc: { "contrib.points": -contribution.points } },
      );
    } catch (error) {
      console.error("Décompte de contribution impossible", error);
    }
  }
  // Une annulation compte comme un refus dans la fiabilité, points ou non.
  await refreshProgress(contribution.userId);

  return toContribution(updated!);
}

/**
 * Une contribution renvoyée à corriger et jamais reprise ne reste pas ouverte
 * indéfiniment : passé le délai, elle est refusée. Appelé à la lecture des
 * files, plutôt que par une tâche planifiée de plus.
 */
export async function expireChangesRequested(): Promise<number> {
  const now = new Date();
  const expired = {
    status: "changesRequested" as const,
    "review.at": {
      $lt: new Date(now.getTime() - CHANGES_REQUESTED_TTL_DAYS * DAY_MS),
    },
  };
  // Une organisation dont la demande expire est refusée comme par un
  // relecteur : sinon elle resterait « en attente » sans demande à relire.
  const orgIds = await contributions().distinct("target.slug", {
    ...expired,
    kind: "orgCreate",
  });
  const { modifiedCount } = await contributions().updateMany(expired, {
    $set: {
      status: "rejected",
      updatedAt: now,
      "review.reason": "expired",
    },
  });
  if (orgIds.length > 0) {
    await organizations().updateMany(
      { _id: { $in: orgIds }, "validation.status": "pending" },
      {
        $set: {
          public: false,
          validation: { status: "rejected", at: now },
        },
      },
    );
  }
  return modifiedCount;
}

// ─── Files d'attente ────────────────────────────────────────────────────────

async function withMedia(
  docs: DbContribution[],
): Promise<PendingContribution[]> {
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

  return docs.map((doc) => ({
    ...toContribution(doc),
    media: doc.mediaIds
      .map((mediaId) => mediaById.get(String(mediaId)))
      .filter((entry): entry is DbPlaceMedia => Boolean(entry))
      .map(toPlaceMedia),
    authorPoints: pointsById.get(String(doc.userId)) ?? 0,
  }));
}

/** La file d'attente, la plus ancienne d'abord, avec de quoi juger sur pièce. */
export async function listPendingContributions(
  limit = 300,
): Promise<{ items: PendingContribution[]; total: number }> {
  await expireChangesRequested();
  const [docs, total] = await Promise.all([
    contributions()
      .find({ status: "pending" })
      .sort({ createdAt: 1 })
      .limit(limit)
      .toArray(),
    contributions().countDocuments({ status: "pending" }),
  ]);

  return { total, items: await withMedia(docs) };
}

export async function countPendingContributions(): Promise<number> {
  return contributions().countDocuments({ status: "pending" });
}

export const JOURNAL_STATUSES = [
  "published",
  "changesRequested",
  "rejected",
  "reverted",
] as const satisfies readonly ContributionStatus[];

export type JournalStatus = (typeof JOURNAL_STATUSES)[number];

/**
 * Le journal : tout ce qui a été publié ou décidé, du plus récent au plus
 * ancien. C'est là que se relisent après coup les publications directes, et
 * qu'une publication s'annule.
 */
export async function listJournal(
  options: {
    limit?: number;
    status?: JournalStatus;
    kind?: ContributionKind;
    /** Seulement ce qui a été publié sans relecture. */
    direct?: boolean;
  } = {},
): Promise<PendingContribution[]> {
  await expireChangesRequested();
  const filter: Filter<DbContribution> = options.direct
    ? { status: "published", "review.by": { $exists: false } }
    : { status: options.status ?? { $in: [...JOURNAL_STATUSES] } };
  if (options.kind) filter.kind = options.kind;

  const docs = await contributions()
    .find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(options.limit ?? 100)
    .toArray();
  return withMedia(docs);
}

/** Les dernières contributions d'un joueur, pour son suivi. */
export async function listMyContributions(
  userId: ObjectId,
  limit = 50,
): Promise<Contribution[]> {
  await expireChangesRequested();
  const docs = await contributions()
    .find({ userId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.map(toContribution);
}
