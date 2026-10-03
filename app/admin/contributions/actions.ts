"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  ContributionError,
  publishContribution,
  rejectContribution,
  type Contributor,
} from "@/lib/contributions";
import {
  CONTRIBUTIONS_REVIEW_PERMISSION,
  isRejectReason,
} from "@/types/contributions";

export type ReviewActionResult = {
  done: number;
  /** Déjà traitées par quelqu'un d'autre, ou disparues. */
  skipped: number;
};

/** Plus que ça d'un coup, et on relit la file plutôt qu'une sélection. */
const MAX_BATCH = 200;

async function reviewer(): Promise<Contributor> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.user ||
    !(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))
  ) {
    throw new Error("Unauthorized");
  }
  return { id: new ObjectId(session.user.id), name: session.user.name };
}

function revalidate(slugs: string[]) {
  revalidatePath("/admin/contributions");
  revalidatePath("/admin");
  for (const slug of new Set(slugs)) revalidatePath(`/lieux/${slug}`);
}

/**
 * Une à une, et pas en une requête : chaque publication crédite son auteur et
 * peut poser la vignette du lieu. Une contribution déjà traitée entre-temps
 * est comptée à part plutôt que de faire échouer tout le lot.
 */
async function forEachId(
  ids: string[],
  apply: (id: string) => Promise<{ target: { slug: string } }>,
): Promise<ReviewActionResult> {
  const unique = [...new Set(ids)].slice(0, MAX_BATCH);
  const slugs: string[] = [];
  let skipped = 0;

  try {
    for (const id of unique) {
      try {
        const contribution = await apply(id);
        slugs.push(contribution.target.slug);
      } catch (error) {
        if (!(error instanceof ContributionError)) throw error;
        skipped += 1;
      }
    }
  } finally {
    // Une erreur au milieu du lot n'annule pas ce qui est déjà publié : les
    // pages concernées doivent le montrer.
    revalidate(slugs);
  }

  return { done: slugs.length, skipped };
}

export async function publishContributionsAction(
  ids: string[],
): Promise<ReviewActionResult> {
  const by = await reviewer();
  return forEachId(ids, (id) => publishContribution(id, by));
}

export async function rejectContributionsAction(
  ids: string[],
  reason: string,
  message?: string,
): Promise<ReviewActionResult> {
  const by = await reviewer();
  if (!isRejectReason(reason)) throw new Error("Invalid reason");
  return forEachId(ids, (id) => rejectContribution(id, by, reason, message));
}
