import { NextRequest, NextResponse } from "next/server";
import { searchShareCandidates } from "@/lib/shares";
import { kindOf, sessionUserId, unauthorized } from "../session";

/**
 * GET /api/shares/candidates?q=…&kind=…&id=…
 * Players to invite whose name starts with `q`: the reader's friends first,
 * then the others; without `q`, the friends only. With `kind` and `id`, each
 * says whether they already have that object.
 */
export async function GET(request: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const search = request.nextUrl.searchParams;
  const kind = kindOf(search.get("kind") ?? "");
  const id = search.get("id");
  const candidates = await searchShareCandidates(
    userId,
    search.get("q") ?? "",
    kind && id ? { kind, targetId: id } : undefined,
  );
  return NextResponse.json({ candidates });
}
