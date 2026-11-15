import { NextRequest, NextResponse } from "next/server";
import { createRequest, listBoard } from "@/lib/player-requests";
import { REQUEST_KIND_FILTERS, type RequestKindFilter } from "@/types/requests";
import type { RequestInput } from "@/lib/player-requests";
import {
  readJson,
  requestErrorResponse,
  sessionActor,
  unauthorized,
} from "./session";

const AUDIENCES = ["friends", "orgs", "public"] as const;

/**
 * GET /api/requests
 * Le tableau des demandes : les demandes ouvertes que le lecteur voit, les
 * plus récentes d'abord, et ses orgas (pour les filtres et la publication).
 *
 * Paramètres : `q`, `aud` (friends | orgs | public), `kind`
 * (resource | item | vehicle), `system`, `supply=1` (ce que mon inventaire
 * couvre), `offset`, `limit`.
 */
export async function GET(request: NextRequest) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const sp = request.nextUrl.searchParams;
  const aud = sp.get("aud");
  const kind = sp.get("kind");
  const result = await listBoard(actor.id, {
    q: sp.get("q") ?? undefined,
    audience: (AUDIENCES as readonly string[]).includes(aud ?? "")
      ? (aud as (typeof AUDIENCES)[number])
      : undefined,
    kind: (REQUEST_KIND_FILTERS as readonly string[]).includes(kind ?? "")
      ? (kind as RequestKindFilter)
      : undefined,
    system: sp.get("system") ?? undefined,
    supply: sp.get("supply") === "1",
    offset: Number(sp.get("offset")) || 0,
    limit: Number(sp.get("limit")) || undefined,
  });
  return NextResponse.json(result);
}

/**
 * POST /api/requests
 * Publie une demande : `name` ou `itemSlug`, `quantity`, `unit`
 * (SCU | cSCU | absent), `minQuality`, `locationId`, `unitPrice`, `note`,
 * `audience` { friends, orgIds, public }, `expiresInDays` (1, 3, 7, 14, 30).
 */
export async function POST(request: NextRequest) {
  const actor = await sessionActor();
  if (!actor) return unauthorized();
  const body = await readJson(request);
  try {
    const created = await createRequest(actor, body as RequestInput);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return requestErrorResponse(error);
  }
}
