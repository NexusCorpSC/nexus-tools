import { NextResponse } from "next/server";
import { disableLink, renewLink, sharePanel } from "@/lib/share-targets";
import {
  kindOf,
  sessionUserId,
  shareErrorResponse,
  unauthorized,
} from "../../../session";

type Params = { params: Promise<{ kind: string; id: string }> };

/**
 * POST /api/shares/:kind/:id/link
 * A new share link (events only). The previous one stops working, and those
 * who came through it lose access unless they registered. Answers the panel.
 */
export async function POST(_request: Request, { params }: Params) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const { kind: raw, id } = await params;
  const kind = kindOf(raw);
  if (!kind) return NextResponse.json({ error: "notFound" }, { status: 404 });
  try {
    await renewLink(kind, id, userId);
    return NextResponse.json(await sharePanel(kind, id, userId), {
      status: 201,
    });
  } catch (error) {
    return shareErrorResponse(error);
  }
}

/**
 * DELETE /api/shares/:kind/:id/link
 * Disables the share link, with the same effect on those who came through it.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const { kind: raw, id } = await params;
  const kind = kindOf(raw);
  if (!kind) return NextResponse.json({ error: "notFound" }, { status: 404 });
  try {
    await disableLink(kind, id, userId);
    return NextResponse.json(await sharePanel(kind, id, userId));
  } catch (error) {
    return shareErrorResponse(error);
  }
}
