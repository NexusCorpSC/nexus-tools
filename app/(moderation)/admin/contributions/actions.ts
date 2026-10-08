"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  ContributionError,
  getContribution,
  getStanding,
  listRevertConflicts,
  publishContribution,
  rejectContribution,
  requestChanges,
  revertContribution,
  type Contributor,
} from "@/lib/contributions";
import {
  CONTRIBUTIONS_REVIEW_PERMISSION,
  PLAYER_REVIEW_BATCH,
  REVIEW_LEVEL,
  REVIEWER_REJECT_REASONS,
  type Contribution,
  type ContributionChange,
  type ContributionErrorCode,
  type RejectReason,
} from "@/types/contributions";
import { logModeration } from "@/lib/reports";

export type ReviewActionResult = {
  done: number;
  /** Déjà traitées par quelqu'un d'autre, reprises par leur auteur, ou disparues. */
  skipped: number;
  /** Celles que la fiche a refusées : elles restent en attente, avec la raison. */
  failed: {
    id: string;
    name: string;
    error: ContributionErrorCode;
    detail?: string;
  }[];
};

/** Ce qui veut dire « quelqu'un est passé avant », pas « ça n'a pas marché ». */
const SKIPPED_CODES: ContributionErrorCode[] = [
  "notPending",
  "notFound",
  "ownContribution",
];

export type ReviewVersions = Record<string, string | undefined>;

/** Plus que ça d'un coup, et on relit la file plutôt qu'une sélection. */
const MAX_BATCH = 200;

/** Un modérateur : seul à annuler une publication. */
async function moderator(): Promise<Contributor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.user ||
    !(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))
  ) {
    throw new Error("Unauthorized");
  }
  return { id: new ObjectId(session.user.id), name: session.user.name };
}

/**
 * D'où vient la décision : la file de modération (`/admin/contributions`) ou
 * la vue des Archivistes (`/contributions/review`).
 */
export type ReviewScope = "moderation" | "archivist";

/**
 * Un modérateur, ou un joueur Archiviste (`REVIEW_LEVEL`) non suspendu, qui
 * relit depuis `/contributions/review`. Le joueur ne décide jamais de ses
 * propres contributions : `own` le lui interdit aussi pour un refus.
 *
 * Un modérateur qui passe par la vue des Archivistes relit en joueur : mêmes
 * lots, mêmes règles, et le point de relecture. Depuis la modération, il relit
 * au titre de son rôle et ne gagne rien.
 */
async function reviewer(
  scope: ReviewScope = "moderation",
): Promise<Contributor & { player: boolean }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Unauthorized");
  const by = { id: new ObjectId(session.user.id), name: session.user.name };
  if (await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION)) {
    return { ...by, player: scope === "archivist" };
  }
  const standing = await getStanding(by.id);
  if (standing.suspendedUntil || standing.level < REVIEW_LEVEL) {
    throw new Error("Unauthorized");
  }
  return { ...by, player: true };
}

/** Un joueur relecteur ne refuse ni ne renvoie ses propres contributions. */
async function assertNotOwn(by: { id: ObjectId; player: boolean }, id: string) {
  if (!by.player) return;
  const contribution = await getContribution(id);
  if (contribution && contribution.userId === String(by.id)) {
    throw new ContributionError("ownContribution", 403);
  }
}

/** Les pages qu'une décision change : la file, le journal, et la fiche visée. */
function revalidate(done: Contribution[]) {
  revalidatePath("/admin/contributions");
  revalidatePath("/contributions/review");
  revalidatePath("/admin/contributions/journal");
  revalidatePath("/admin");
  revalidatePath("/contributions");
  const paths = new Set<string>();
  for (const { target } of done) {
    if (target.type === "item") {
      paths.add("/items");
      paths.add(`/items/${target.slug}`);
    } else {
      paths.add("/lieux");
      paths.add(`/lieux/${target.slug}`);
      if (target.parent) paths.add(`/lieux/${target.parent.slug}`);
    }
  }
  for (const path of paths) revalidatePath(path);
}

/**
 * Une à une, et pas en une requête : chaque publication crédite son auteur et
 * peut poser la vignette du lieu. Une contribution déjà traitée entre-temps
 * est comptée à part plutôt que de faire échouer tout le lot.
 */
async function forEachId(
  ids: string[],
  apply: (id: string) => Promise<Contribution>,
  /** Ce que le journal de modération retient de chaque contribution traitée. */
  log: { by: Contributor; action: string; note?: string },
): Promise<ReviewActionResult> {
  const unique = [...new Set(ids)].slice(
    0,
    log.by.player ? PLAYER_REVIEW_BATCH : MAX_BATCH,
  );
  const done: Contribution[] = [];
  const failed: ReviewActionResult["failed"] = [];
  let skipped = 0;

  try {
    for (const id of unique) {
      try {
        const contribution = await apply(id);
        done.push(contribution);
        await logModeration({
          by: log.by.id,
          byName: log.by.name,
          action: log.action,
          contributionId: new ObjectId(contribution.id),
          userId: new ObjectId(contribution.userId),
          target: {
            type: contribution.target.type,
            id: contribution.target.slug,
            name: contribution.target.name,
          },
          note: log.note,
        });
      } catch (error) {
        if (!(error instanceof ContributionError)) throw error;
        if (SKIPPED_CODES.includes(error.code)) {
          skipped += 1;
        } else {
          const doc = await getContribution(id);
          failed.push({
            id,
            name: doc?.target.name ?? id,
            error: error.code,
            detail: error.detail,
          });
        }
      }
    }
  } finally {
    // Une erreur au milieu du lot n'annule pas ce qui est déjà publié : les
    // pages concernées doivent le montrer.
    revalidate(done);
  }

  return { done: done.length, skipped, failed };
}

/**
 * `versions` porte l'`updatedAt` de chaque contribution telle que le relecteur
 * l'a vue : une contribution reprise entre-temps est comptée comme déjà
 * traitée plutôt que publiée sans avoir été relue.
 */
export async function publishContributionsAction(
  ids: string[],
  versions: ReviewVersions = {},
  scope: ReviewScope = "moderation",
): Promise<ReviewActionResult> {
  const by = await reviewer(scope);
  return forEachId(ids, (id) => publishContribution(id, by, versions[id]), {
    by,
    action: "contribution.publish",
  });
}

export async function rejectContributionsAction(
  ids: string[],
  reason: string,
  message?: string,
  versions: ReviewVersions = {},
  scope: ReviewScope = "moderation",
): Promise<ReviewActionResult> {
  const by = await reviewer(scope);
  // « Expirée » ne se choisit pas : c'est le délai qui la donne.
  if (!(REVIEWER_REJECT_REASONS as readonly string[]).includes(reason)) {
    throw new Error("Invalid reason");
  }
  return forEachId(
    ids,
    (id) =>
      assertNotOwn(by, id).then(() =>
        rejectContribution(
          id,
          by,
          reason as RejectReason,
          message,
          versions[id],
        ),
      ),
    { by, action: "contribution.reject", note: reason },
  );
}

/** Renvoyer à l'auteur ce qu'il doit reprendre. Le message est obligatoire. */
export async function requestChangesAction(
  ids: string[],
  message: string,
  versions: ReviewVersions = {},
  scope: ReviewScope = "moderation",
): Promise<ReviewActionResult> {
  const by = await reviewer(scope);
  if (!message.trim()) throw new Error("Message required");
  return forEachId(
    ids,
    (id) =>
      assertNotOwn(by, id).then(() =>
        requestChanges(id, by, message, versions[id]),
      ),
    {
      by,
      action: "contribution.requestChanges",
    },
  );
}

export type RevertActionResult =
  | { ok: true }
  | {
      ok: false;
      error: ContributionErrorCode;
      /** Pour `revertConflict` : ce que l'annulation écraserait. */
      conflicts?: ContributionChange[];
    };

/**
 * Annule une publication. Si la fiche a changé depuis sur les mêmes champs,
 * on renvoie ce qui a changé, et l'interface ne repasse avec `force` qu'après
 * confirmation.
 */
export async function revertContributionAction(
  id: string,
  force = false,
): Promise<RevertActionResult> {
  const by = await moderator();
  try {
    const reverted = await revertContribution(id, by, force);
    revalidate([reverted]);
    await logModeration({
      by: by.id,
      byName: by.name,
      action: "contribution.revert",
      contributionId: new ObjectId(reverted.id),
      userId: new ObjectId(reverted.userId),
      target: {
        type: reverted.target.type,
        id: reverted.target.slug,
        name: reverted.target.name,
      },
      note: force ? "force" : undefined,
    });
    return { ok: true };
  } catch (error) {
    if (!(error instanceof ContributionError)) throw error;
    if (error.code === "revertConflict") {
      return {
        ok: false,
        error: error.code,
        conflicts: await listRevertConflicts(id),
      };
    }
    return { ok: false, error: error.code };
  }
}
