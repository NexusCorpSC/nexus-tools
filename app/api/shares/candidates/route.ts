import { NextRequest, NextResponse } from "next/server";
import { searchShareCandidates } from "@/lib/shares";
import { shareCandidates } from "@/lib/share-targets";
import {
  kindOf,
  sessionUserId,
  shareErrorResponse,
  unauthorized,
} from "../session";

/**
 * GET /api/shares/candidates?q=…&kind=…&id=…
 * Players to invite whose name starts with `q`: the reader's friends first,
 * then the others; without `q`, the friends only. With `kind` and `id`, each
 * says whether they already have that object — for those who manage it only.
 */
export async function GET(request: NextRequest) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const search = request.nextUrl.searchParams;
  const query = search.get("q") ?? "";
  const kind = kindOf(search.get("kind") ?? "");
  const id = search.get("id");
  try {
    const candidates =
      kind && id
        ? await shareCandidates(kind, id, userId, query)
        : await searchShareCandidates(userId, query);
    return NextResponse.json({ candidates });
  } catch (error) {
    return shareErrorResponse(error);
  }
}
