"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  ReportError,
  getReportDetail,
  parseResolveInput,
  resolveReport,
  targetHref,
} from "@/lib/reports";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";
import type { ReportErrorCode } from "@/types/reports";

export type ResolveActionResult =
  | { ok: true }
  | { ok: false; error: ReportErrorCode; detail?: string };

/** Tranche un dossier. Les pages de la cible sont relues : un masquage tombe. */
export async function resolveReportAction(
  id: string,
  input: unknown,
): Promise<ResolveActionResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (
    !session?.user ||
    !(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))
  ) {
    throw new Error("Unauthorized");
  }

  const detail = await getReportDetail(id);
  try {
    await resolveReport(
      id,
      { id: new ObjectId(session.user.id), name: session.user.name },
      parseResolveInput(input),
      {
        places: await hasPermission(PLACES_EDIT_PERMISSION),
        items: await hasPermission(ITEMS_EDIT_PERMISSION),
      },
    );
  } catch (error) {
    if (!(error instanceof ReportError)) throw error;
    return { ok: false, error: error.code, detail: error.detail };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/contributions", "layout");
  revalidatePath("/contributions");
  if (detail) {
    revalidatePath(targetHref(detail.report.target).split("?")[0]);
    if (detail.report.target.type === "org") revalidatePath("/orgs");
  }
  return { ok: true };
}
