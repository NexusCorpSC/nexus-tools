import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { PrivatePlaceError } from "@/lib/private-places";
import { ContributionError } from "@/lib/contribution-store";

/** Le joueur connecté, site ou app : les lieux privés n'existent que pour lui. */
export async function sessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** Les erreurs connues reviennent par leur code, que les formulaires traduisent. */
export function errorResponse(error: unknown) {
  if (error instanceof PrivatePlaceError) {
    return NextResponse.json(
      { error: error.code, detail: error.message },
      { status: error.status },
    );
  }
  if (error instanceof ContributionError) {
    return NextResponse.json(
      { error: error.code, detail: error.detail },
      { status: error.status },
    );
  }
  throw error;
}
