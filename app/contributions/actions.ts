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
import { submitConfirmation } from "@/lib/confirmations";
import type {
  Contribution,
  ContributionErrorCode,
  ContributorStanding,
  SubmitConfirmationResult,
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
  } else if (target.type === "mission") {
    revalidatePath(`/missions/${target.slug}`);
    // Ses lieux la citent sur leur fiche.
    revalidatePath("/lieux/[slug]", "page");
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
    } else if (result.contribution.target.type === "mission") {
      revalidatePath(`/missions/${result.contribution.target.slug}`);
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

export type ConfirmResult =
  | ({ ok: true } & SubmitConfirmationResult)
  | { ok: false; error: ContributionErrorCode };

/** Confirme une donnée telle quelle, ou la dit périmée. */
export async function confirmAction(input: unknown): Promise<ConfirmResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  try {
    const result = await submitConfirmation(
      { id: new ObjectId(session.user.id), name: session.user.name },
      input,
    );
    revalidatePath("/contributions");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof ContributionError) {
      return { ok: false, error: error.code };
    }
    throw error;
  }
}
