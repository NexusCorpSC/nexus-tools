import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import {
  DisplayOrgError,
  getMyDisplayOrg,
  setMyDisplayOrg,
} from "@/lib/display-org";

/**
 * GET /api/me/display-org
 * L'organisation que le lecteur affiche avec son pseudo (`null` : la première
 * qu'il partage avec chacun) et ses organisations, parmi lesquelles choisir.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    await getMyDisplayOrg(new ObjectId(session.user.id)),
  );
}

/**
 * PUT /api/me/display-org
 * Body: `{ orgId }`, une organisation dont le lecteur est membre, ou `null`
 * pour revenir au comportement par défaut. Répond comme GET. Refus :
 * `{ error }` — voir `DisplayOrgErrorCode`.
 */
export async function PUT(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await setMyDisplayOrg(
        new ObjectId(session.user.id),
        (body as { orgId?: unknown } | null)?.orgId,
      ),
    );
  } catch (error) {
    if (error instanceof DisplayOrgError) {
      return NextResponse.json(error.toJSON(), { status: error.status });
    }
    throw error;
  }
}
