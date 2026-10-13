import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ShareError } from "@/lib/shares";
import { isShareKind, type ShareKind } from "@/types/shares";

/** Le joueur connecté, site ou app : le partage n'existe que pour lui. */
export async function sessionUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

export function kindOf(raw: string): ShareKind | null {
  return isShareKind(raw) ? raw : null;
}

/** Les refus connus reviennent par leur code, que le panneau traduit. */
export function shareErrorResponse(error: unknown) {
  if (error instanceof ShareError) {
    return NextResponse.json({ error: error.code }, { status: error.status });
  }
  throw error;
}
