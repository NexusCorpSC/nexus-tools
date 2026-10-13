import { NextRequest, NextResponse } from "next/server";
import { inviteUser, removeUser, sharePanel } from "@/lib/share-targets";
import {
  kindOf,
  sessionUserId,
  shareErrorResponse,
  unauthorized,
} from "../../session";

type Params = { params: Promise<{ kind: string; id: string }> };

const notFound = () =>
  NextResponse.json({ error: "notFound" }, { status: 404 });

/**
 * GET /api/shares/:kind/:id
 * The share panel of an event (`kind` = `event`, id = the event id) or a
 * private place (`place`, id = its slug): who has it through sharing, and
 * the share link when the kind has one. Those who manage it only.
 */
export async function GET(_request: Request, { params }: Params) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const { kind: raw, id } = await params;
  const kind = kindOf(raw);
  if (!kind) return notFound();
  try {
    return NextResponse.json(await sharePanel(kind, id, userId));
  } catch (error) {
    return shareErrorResponse(error);
  }
}

/**
 * POST /api/shares/:kind/:id
 * Body `{ userId }`: invites that player. They get access at once and a
 * notification; inviting them again changes nothing. Answers the panel.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const { kind: raw, id } = await params;
  const kind = kindOf(raw);
  if (!kind) return notFound();
  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
  } | null;
  try {
    await inviteUser(kind, id, userId, body?.userId);
    return NextResponse.json(await sharePanel(kind, id, userId), {
      status: 201,
    });
  } catch (error) {
    return shareErrorResponse(error);
  }
}

/**
 * DELETE /api/shares/:kind/:id?userId=…
 * Takes that player's access away, whether invited or come through the link.
 * Answers the panel.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const userId = await sessionUserId();
  if (!userId) return unauthorized();
  const { kind: raw, id } = await params;
  const kind = kindOf(raw);
  const guestId = request.nextUrl.searchParams.get("userId");
  if (!kind) return notFound();
  if (!guestId) {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }
  try {
    await removeUser(kind, id, userId, guestId);
    return NextResponse.json(await sharePanel(kind, id, userId));
  } catch (error) {
    return shareErrorResponse(error);
  }
}
