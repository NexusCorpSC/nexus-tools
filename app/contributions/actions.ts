"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import {
  ContributionError,
  submitCatalogContribution,
  type CatalogSubmission,
  type CatalogSubmissionMeta,
} from "@/lib/contributions";
import type {
  Contribution,
  ContributionErrorCode,
  ContributorStanding,
} from "@/types/contributions";

export type ContributeResult =
  | { ok: true; contribution: Contribution; standing: ContributorStanding }
  | { ok: false; error: ContributionErrorCode; detail?: string };

/** Les pages qu'une contribution publiée change. */
function revalidateTarget(contribution: Contribution) {
  const { target } = contribution;
  if (target.type === "place") {
    revalidatePath("/lieux");
    revalidatePath(`/lieux/${target.slug}`);
    if (target.parent) revalidatePath(`/lieux/${target.parent.slug}`);
  } else {
    revalidatePath("/items");
    revalidatePath(`/items/${target.slug}`);
  }
}

/**
 * Envoie une proposition au catalogue : un lieu, une correction de lieu, un
 * plan, un objet, une correction d'objet. Les erreurs reviennent par leur
 * code, que le formulaire traduit ; celles des fiches portent en plus leur
 * message, déjà écrit pour un humain.
 */
export async function contributeAction(
  submission: CatalogSubmission,
  meta: CatalogSubmissionMeta = {},
): Promise<ContributeResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  try {
    const result = await submitCatalogContribution(
      { id: new ObjectId(session.user.id), name: session.user.name },
      submission,
      meta,
    );
    revalidatePath("/contributions");
    revalidatePath("/admin/contributions");
    if (result.contribution.status === "published") {
      revalidateTarget(result.contribution);
    } else if (result.contribution.target.type === "place") {
      revalidatePath(`/lieux/${result.contribution.target.slug}`);
    } else {
      revalidatePath(`/items/${result.contribution.target.slug}`);
    }
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ContributionError) {
      return { ok: false, error: error.code, detail: error.detail };
    }
    throw error;
  }
}
