import { NextResponse } from "next/server";
import { removeShare } from "@/lib/shares";
import {
  kindOf,
  sessionUserId,
  unauthorized,
} from "@/app/api/shares/session";

type Params = { params: Promise<{ kind: string; id: string }> };

/**
 * DELETE /api/me/shares/:kind/:id
 * The reader gives up what was shared with them — an event they were invited
 * to, a private place — and no longer sees it.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const { kind: raw, id } = await params;
  const kind = kindOf(raw);
  if (!kind || !(await removeShare(kind, id, userId))) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
