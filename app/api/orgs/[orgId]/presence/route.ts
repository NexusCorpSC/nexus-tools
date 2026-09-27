import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getOrgPresence } from "@/lib/presence";

type Params = { params: Promise<{ orgId: string }> };

/**
 * GET /api/orgs/:orgId/presence
 * The members of the organization currently playing, with their activity.
 *
 * Members only, public organization or not: who is playing right now is
 * between members. A non-member gets the same 404 as a missing organization,
 * so the answer does not confirm which private organizations exist.
 */
export async function GET(_request: Request, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;
  const presence = await getOrgPresence(orgId, session.user.id);

  if (!presence) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(presence);
}
