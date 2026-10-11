"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { checkCollectInput, checkJobInput } from "@/lib/refining";
import {
  collectRefiningJob,
  createRefiningJob,
  deleteRefiningJob,
  RefiningError,
  updateRefiningJob,
} from "@/lib/refining-jobs";

/**
 * Les actions de la page Raffinage. Elles répondent par un résultat plutôt
 * que par une exception : un message d'erreur levé dans une action serveur
 * n'arrive pas jusqu'au navigateur en production.
 */
export type RefiningActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

async function currentUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof RefiningError) return { ok: false, error: error.code };
  console.error(error);
  return { ok: false, error: "unexpected" };
}

export async function addRefiningJob(
  input: unknown,
): Promise<RefiningActionResult<{ jobId: string }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checked = checkJobInput(input);
  if (!checked.ok) return { ok: false, error: "invalid" };

  try {
    const job = await createRefiningJob(userId, checked.value);
    revalidatePath("/industry/refine");
    return { ok: true, jobId: job.id };
  } catch (error) {
    return failure(error);
  }
}

export async function editRefiningJob(
  jobId: string,
  input: unknown,
): Promise<RefiningActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checked = checkJobInput(input);
  if (!checked.ok) return { ok: false, error: "invalid" };

  try {
    await updateRefiningJob(userId, jobId, checked.value);
    revalidatePath("/industry/refine");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function removeRefiningJob(
  jobId: string,
): Promise<RefiningActionResult> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  try {
    await deleteRefiningJob(userId, jobId);
    revalidatePath("/industry/refine");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function collectJob(
  jobId: string,
  input: unknown,
): Promise<RefiningActionResult<{ created: number; merged: number }>> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "unauthorized" };

  const checked = checkCollectInput(input);
  if (!checked.ok) return { ok: false, error: "invalid" };

  try {
    const result = await collectRefiningJob(userId, jobId, checked.value);
    revalidatePath("/industry/refine");
    revalidatePath("/inventory");
    return { ok: true, ...result };
  } catch (error) {
    return failure(error);
  }
}
