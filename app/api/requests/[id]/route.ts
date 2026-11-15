import { NextRequest, NextResponse } from "next/server";
import {
  changeRequest,
  getRequestDetail,
  type RequestChange,
} from "@/lib/player-requests";
import {
  readJson,
  requestErrorResponse,
  sessionActor,
  unauthorized,
} from "../session";

/**
 * GET /api/requests/[id]
 * La fiche d'une demande : la demande, les offres que le lecteur peut voir
 * (toutes pour l'auteur, la sienne pour un fournisseur) et ses lots qui
 * portent ce nom, pour « J'en ai ».
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const detail = await getRequestDetail(id, actor.id);
  if (!detail) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * PATCH /api/requests/[id]
 * L'auteur modifie (`action: "update"` et les champs), prolonge
 * (`action: "extend"`, `days`) ou clôture (`action: "close"`) sa demande.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  if (!["update", "extend", "close"].includes(String(body.action))) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await changeRequest(actor, id, body as unknown as RequestChange),
    );
  } catch (error) {
    return requestErrorResponse(error);
  }
}
