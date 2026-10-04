"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { hasPermission, isAdmin } from "@/lib/permissions";
import {
  ContributorError,
  parseContributorInput,
  updateContributor,
} from "@/lib/gamification";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";
import type { ContributorErrorCode } from "@/types/gamification";

export type ContributorActionResult =
  | { ok: true }
  | { ok: false; error: ContributorErrorCode };

/**
 * Règle un contributeur depuis sa fiche : niveau et points pour un admin,
 * avertissement et suspension pour un modérateur aussi.
 */
export async function updateContributorAction(
  id: string,
  input: unknown,
): Promise<ContributorActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.user ||
    !(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))
  ) {
    throw new Error("Unauthorized");
  }

  try {
    await updateContributor(
      id,
      { id: new ObjectId(session.user.id), name: session.user.name },
      await isAdmin(),
      parseContributorInput(input),
    );
  } catch (error) {
    if (!(error instanceof ContributorError)) throw error;
    return { ok: false, error: error.code };
  }

  revalidatePath("/admin/contributions/contributeurs");
  revalidatePath("/classement");
  return { ok: true };
}
