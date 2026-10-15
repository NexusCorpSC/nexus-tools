import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { Organization } from "@/app/orgs/page";
import {
  listOrgInventory,
  ORG_INVENTORY_ALL_LIMIT as ALL_LIMIT,
} from "@/lib/org-inventory";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

type Params = { params: Promise<{ orgId: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orgId } = await params;

  // Fetch org and verify membership
  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const isMember = org.members.some((m) =>
    new ObjectId(m.userId).equals(session.user.id)
  );
  // Masquée par un signalement, elle n'est plus publique pour personne
  // d'autre que ses membres.
  const hidden = (org as { reportHidden?: boolean }).reportHidden === true;
  if (!isMember && (!org.public || hidden)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse query params
  const sp = request.nextUrl.searchParams;
  const query = sp.get("query") ?? "";
  const quality = sp.get("quality") ?? "";
  const userId = sp.get("userId") ?? "";
  const all = sp.get("all") === "1";
  const page = all ? 1 : Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
  const limit = all
    ? ALL_LIMIT
    : Math.min(
        MAX_LIMIT,
        Math.max(1, parseInt(sp.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
      );
  const skip = (page - 1) * limit;

  const { total, items, members } = await listOrgInventory(org.members, {
    query,
    quality,
    userId,
    skip,
    limit,
  });

  return NextResponse.json({
    items,
    total,
    page,
    limit,
    hasMore: skip + items.length < total,
    members,
  });
}
