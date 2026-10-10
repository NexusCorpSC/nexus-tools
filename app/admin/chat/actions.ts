"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import {
  grantChatAccess,
  revokeChatAccess,
  saveChatSettings,
  searchChatCandidates,
  setChatBudget,
} from "@/lib/chat/access";
import {
  isChatModelId,
  MAX_MONTHLY_BUDGET_MICROS,
  MICROS_PER_USD,
  type ChatAccessStatus,
} from "@/types/chat";

export type ChatAdminResult =
  | { ok: true }
  | { ok: false; error: "invalid_budget" | "invalid_model" | "not_found" };

async function requireAdminId(): Promise<ObjectId> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !(await isAdmin())) throw new Error("Unauthorized");
  return new ObjectId(session.user.id);
}

/** Un montant en dollars saisi dans l'admin, en microdollars ; `null` s'il ne tient pas. */
function budgetMicros(usd: unknown): number | null {
  const value = typeof usd === "string" ? Number(usd.replace(",", ".")) : usd;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const micros = Math.round(value * MICROS_PER_USD);
  return micros > MAX_MONTHLY_BUDGET_MICROS ? null : micros;
}

function userId(id: unknown): ObjectId | null {
  return typeof id === "string" && ObjectId.isValid(id)
    ? new ObjectId(id)
    : null;
}

function revalidate() {
  revalidatePath("/admin/chat");
  revalidatePath("/chat");
}

export async function saveChatSettingsAction(input: {
  enabled: boolean;
  model: string;
  defaultBudgetUsd: string;
}): Promise<ChatAdminResult> {
  const adminId = await requireAdminId();
  if (!isChatModelId(input.model)) return { ok: false, error: "invalid_model" };
  const defaultMonthlyBudgetMicros = budgetMicros(input.defaultBudgetUsd);
  if (defaultMonthlyBudgetMicros === null) {
    return { ok: false, error: "invalid_budget" };
  }
  await saveChatSettings(adminId, {
    enabled: input.enabled === true,
    model: input.model,
    defaultMonthlyBudgetMicros,
  });
  revalidate();
  return { ok: true };
}

export async function grantChatAccessAction(
  id: string,
  budgetUsd: string,
): Promise<ChatAdminResult> {
  const adminId = await requireAdminId();
  const target = userId(id);
  const micros = budgetMicros(budgetUsd);
  if (micros === null) return { ok: false, error: "invalid_budget" };
  if (!target || !(await grantChatAccess(adminId, target, micros))) {
    return { ok: false, error: "not_found" };
  }
  revalidate();
  return { ok: true };
}

export async function setChatBudgetAction(
  id: string,
  budgetUsd: string,
): Promise<ChatAdminResult> {
  await requireAdminId();
  const target = userId(id);
  const micros = budgetMicros(budgetUsd);
  if (micros === null) return { ok: false, error: "invalid_budget" };
  if (!target || !(await setChatBudget(target, micros))) {
    return { ok: false, error: "not_found" };
  }
  revalidate();
  return { ok: true };
}

export async function revokeChatAccessAction(
  id: string,
): Promise<ChatAdminResult> {
  await requireAdminId();
  const target = userId(id);
  if (!target || !(await revokeChatAccess(target))) {
    return { ok: false, error: "not_found" };
  }
  revalidate();
  return { ok: true };
}

export async function searchChatCandidatesAction(
  query: string,
): Promise<
  { id: string; name: string; email?: string; status: ChatAccessStatus }[]
> {
  await requireAdminId();
  return searchChatCandidates(typeof query === "string" ? query : "");
}
