import { NextResponse } from "next/server";
import {
  getRequestAlertsOff,
  listNotices,
  markNoticesSeen,
  setRequestAlertsOff,
} from "@/lib/player-requests";
import { readJson, sessionActor, unauthorized } from "@/app/api/requests/session";

/**
 * GET /api/me/request-notices
 * La cloche des demandes : les dernières activités et combien sont nouvelles,
 * et si le joueur est prévenu des demandes de ses amis et de ses orgas.
 */
export async function GET() {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const [list, alertsOff] = await Promise.all([
    listNotices(actor.id),
    getRequestAlertsOff(actor.id),
  ]);
  return NextResponse.json({ ...list, alertsOff });
}

/**
 * POST /api/me/request-notices
 * Sans corps : tout est vu (la cloche a été ouverte). Avec `alertsOff` :
 * couper ou rétablir l'annonce des nouvelles demandes des amis et des orgas.
 */
export async function POST(request: Request) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const body = await readJson(request);
  if (typeof body.alertsOff === "boolean") {
    await setRequestAlertsOff(actor.id, body.alertsOff);
    return NextResponse.json({ alertsOff: body.alertsOff });
  }
  await markNoticesSeen(actor.id);
  return new NextResponse(null, { status: 204 });
}
