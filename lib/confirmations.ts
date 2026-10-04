import "server-only";
import { ObjectId } from "mongodb";
import {
  ContributionError,
  cleanText,
  contributions,
  pointEvents,
  users,
  type Contributor,
  type DbContribution,
} from "@/lib/contribution-store";
import { getStanding, refreshProgress } from "@/lib/contributions";
import { confirmResourcePrices, getItemBySlug } from "@/lib/items";
import { confirmPlaceServices, getPlaceBySlug } from "@/lib/places";
import { confirmBlueprintObtention, getBlueprintBySlug } from "@/lib/crafting";
import { submitReport } from "@/lib/reports";
import {
  CONFIRM_COOLDOWN_DAYS,
  CONFIRM_DAILY_CAP,
  CONFIRM_TARGETS,
  MAX_CONFIRM_COMMENT_LENGTH,
  OUTDATED_VOTES,
  POINTS,
  isConfirmSubject,
  type ConfirmProposal,
  type ConfirmState,
  type ConfirmSubject,
  type ContributionTarget,
  type SubmitConfirmationResult,
} from "@/types/contributions";
import type { ReportTargetType } from "@/types/reports";

/**
 * Les confirmations : ce qui vieillit avec les patchs — les cours d'une
 * ressource, les services d'un lieu, où obtenir un blueprint — se confirme en
 * un clic. « Toujours exact » date la donnée d'aujourd'hui ; « plus exact »
 * dit qu'elle a vieilli, et au troisième joueur qui le dit, un signalement
 * s'ouvre pour que la modération la reprenne.
 *
 * Une confirmation est une contribution `confirm`, publiée d'emblée : il n'y a
 * rien à relire, mais elle rapporte des points, se voit au journal, et
 * s'annule comme les autres.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ce que les « plus exact » regardent en arrière, au plus. */
const OUTDATED_WINDOW_DAYS = 60;

type Subject = {
  target: ContributionTarget;
  /** La dernière date connue de la donnée, posée par une confirmation ou une saisie. */
  confirmedAt?: Date;
};

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** La fiche qui porte la donnée, si elle en a une à confirmer. */
async function resolveSubject(
  subject: ConfirmSubject,
  slug: string,
): Promise<Subject | null> {
  switch (subject) {
    case "prices": {
      const item = await getItemBySlug(slug);
      if (!item?.resource?.markets?.length) return null;
      return {
        target: { type: "item", slug: item.slug, name: item.name },
        confirmedAt: parseDate(item.resource.pricesUpdatedAt),
      };
    }
    case "services": {
      const place = await getPlaceBySlug(slug);
      if (!place?.services?.length) return null;
      return {
        target: { type: "place", slug: place.slug, name: place.name },
        confirmedAt: parseDate(place.servicesConfirmedAt),
      };
    }
    case "sources": {
      const blueprint = await getBlueprintBySlug(slug);
      if (!blueprint?.obtention) return null;
      return {
        target: {
          type: "blueprint",
          slug: blueprint.slug,
          name: blueprint.name,
        },
        confirmedAt: parseDate(blueprint.obtentionConfirmedAt),
      };
    }
  }
}

async function markConfirmed(
  subject: ConfirmSubject,
  slug: string,
  at: Date,
): Promise<void> {
  switch (subject) {
    case "prices":
      await confirmResourcePrices(slug, at);
      return;
    case "services":
      await confirmPlaceServices(slug, at);
      return;
    case "sources":
      await confirmBlueprintObtention(slug, at);
      return;
  }
}

function sameSubject(target: ContributionTarget, subject: ConfirmSubject) {
  return {
    kind: "confirm" as const,
    "target.type": target.type,
    "target.slug": target.slug,
    "proposal.subject": subject,
    status: "published" as const,
  };
}

/**
 * Les joueurs qui ont dit « plus exact » depuis la dernière confirmation, le
 * plus ancien d'abord.
 */
async function outdatedVoters(
  target: ContributionTarget,
  subject: ConfirmSubject,
  since: Date | undefined,
): Promise<DbContribution[]> {
  const floor = new Date(Date.now() - OUTDATED_WINDOW_DAYS * DAY_MS);
  const from = since && since > floor ? since : floor;
  const docs = await contributions()
    .find({
      ...sameSubject(target, subject),
      "proposal.accurate": false,
      createdAt: { $gt: from },
    })
    .sort({ createdAt: 1 })
    .toArray();
  const seen = new Set<string>();
  return docs.filter((doc) => {
    const key = String(doc.userId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Le troisième « plus exact » ouvre un signalement : chacun des joueurs y
 * entre avec son propre mot. Un joueur que ses limites de signalement
 * arrêtent n'empêche pas les autres d'y entrer.
 */
async function reportOutdated(
  target: ContributionTarget,
  voters: DbContribution[],
): Promise<boolean> {
  let reported = false;
  for (const vote of voters) {
    try {
      await submitReport(
        { id: vote.userId, name: vote.userName },
        {
          target: { type: target.type as ReportTargetType, id: target.slug },
          reason: "outdated",
          comment: (vote.proposal as ConfirmProposal).comment,
        },
      );
      reported = true;
    } catch (error) {
      console.error("Signalement d'une donnée périmée impossible", error);
    }
  }
  return reported;
}

export function parseConfirmationInput(input: unknown): {
  subject: ConfirmSubject;
  slug: string;
  accurate: boolean;
  comment?: string;
} {
  const raw = (input ?? {}) as {
    target?: { type?: unknown; slug?: unknown };
    subject?: unknown;
    accurate?: unknown;
    comment?: unknown;
  };
  const subject = raw.subject;
  const slug = raw.target?.slug;
  if (
    !isConfirmSubject(subject) ||
    typeof slug !== "string" ||
    !slug ||
    slug.length > 200 ||
    typeof raw.accurate !== "boolean" ||
    (raw.target?.type !== undefined &&
      raw.target.type !== CONFIRM_TARGETS[subject])
  ) {
    throw new ContributionError("invalidInput", 400);
  }
  return {
    subject,
    slug,
    accurate: raw.accurate,
    comment: cleanText(raw.comment, MAX_CONFIRM_COMMENT_LENGTH),
  };
}

/** Enregistre une confirmation, ou un « plus exact ». */
export async function submitConfirmation(
  author: Contributor,
  input: unknown,
): Promise<SubmitConfirmationResult> {
  const { subject, slug, accurate, comment } = parseConfirmationInput(input);
  const standing = await getStanding(author.id);
  if (standing.suspendedUntil) throw new ContributionError("suspended", 403);

  const resolved = await resolveSubject(subject, slug);
  if (!resolved) throw new ContributionError("notFound", 404);
  const { target } = resolved;
  const now = new Date();

  const recent = await contributions().countDocuments({
    ...sameSubject(target, subject),
    userId: author.id,
    createdAt: {
      $gte: new Date(now.getTime() - CONFIRM_COOLDOWN_DAYS * DAY_MS),
    },
  });
  if (recent > 0) throw new ContributionError("alreadyConfirmed", 409);

  const today = await contributions().countDocuments({
    kind: "confirm",
    userId: author.id,
    points: { $gt: 0 },
    createdAt: { $gte: new Date(now.getTime() - DAY_MS) },
  });
  const points = today < CONFIRM_DAILY_CAP ? POINTS.confirm : 0;

  const proposal: ConfirmProposal = { subject, accurate, comment };
  const contribution: DbContribution = {
    _id: new ObjectId(),
    userId: author.id,
    userName: author.name,
    kind: "confirm",
    target,
    status: "published",
    mediaIds: [],
    points,
    proposal,
    createdAt: now,
    publishedAt: now,
    updatedAt: now,
  };
  await contributions().insertOne(contribution);

  if (points > 0) {
    try {
      await pointEvents().insertOne({
        userId: author.id,
        contributionId: contribution._id,
        delta: points,
        reason: "published",
        at: now,
      });
      await users().updateOne(
        { _id: author.id },
        { $inc: { "contrib.points": points } },
      );
    } catch (error) {
      console.error("Crédit de confirmation impossible", error);
    }
  }

  let reported = false;
  if (accurate) {
    await markConfirmed(subject, target.slug, now);
  } else {
    const voters = await outdatedVoters(target, subject, resolved.confirmedAt);
    // Au troisième exactement : les suivants rejoignent le dossier déjà
    // ouvert par leur propre signalement, s'ils le souhaitent.
    if (voters.length === OUTDATED_VOTES) {
      reported = await reportOutdated(target, voters);
    }
  }

  await refreshProgress(author.id);
  return {
    confirmation: { points, at: now.toISOString() },
    standing: await getStanding(author.id),
    reported,
  };
}

/** Où en est une donnée : sa date, les « plus exact » depuis, et le lecteur. */
export async function getConfirmState(
  subject: ConfirmSubject,
  slug: string,
  viewer?: ObjectId,
): Promise<ConfirmState | null> {
  const resolved = await resolveSubject(subject, slug);
  if (!resolved) return null;
  const { target, confirmedAt } = resolved;
  const [voters, mine] = await Promise.all([
    outdatedVoters(target, subject, confirmedAt),
    viewer
      ? contributions().countDocuments({
          ...sameSubject(target, subject),
          userId: viewer,
          createdAt: {
            $gte: new Date(Date.now() - CONFIRM_COOLDOWN_DAYS * DAY_MS),
          },
        })
      : 0,
  ]);
  return {
    subject,
    confirmedAt: confirmedAt?.toISOString(),
    outdatedVotes: voters.length,
    mine: mine > 0,
  };
}
