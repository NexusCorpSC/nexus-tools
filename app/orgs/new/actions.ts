"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { ContributionError } from "@/lib/contribution-store";
import { createOrganization } from "@/lib/org-contributions";
import type { ContributionErrorCode } from "@/types/contributions";

export type CreateOrgResult =
  | { ok: true; orgId: string }
  | { ok: false; error: ContributionErrorCode; detail?: string };

/** Crée une organisation, privée jusqu'à sa validation. */
export async function createOrgAction(
  formData: FormData,
): Promise<CreateOrgResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return { ok: false, error: "unauthenticated" };

  const logo = formData.get("logo");
  try {
    const { orgId } = await createOrganization(
      { id: new ObjectId(session.user.id), name: session.user.name },
      {
        name: formData.get("name"),
        tag: formData.get("tag"),
        description: formData.get("description"),
      },
      logo instanceof File ? logo : null,
    );
    revalidatePath("/orgs");
    revalidatePath("/admin/contributions");
    return { ok: true, orgId };
  } catch (error) {
    if (error instanceof ContributionError) {
      return { ok: false, error: error.code, detail: error.detail };
    }
    throw error;
  }
}
