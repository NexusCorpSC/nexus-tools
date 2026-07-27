import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * GET /api/me
 * Returns the currently authenticated user.
 * Used by API clients (desktop app) to validate a stored session token.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
  });
}
