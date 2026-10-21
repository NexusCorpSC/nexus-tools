import { NextResponse } from "next/server";
import { submitCatalogContribution } from "@/lib/contributions";
import {
  listLiveTimelineEvents,
  listTimelineEvents,
} from "@/lib/timeline-events";
import {
  invalidJson,
  readJson,
  timelineErrorResponse,
  timelineSession,
  unauthenticated,
} from "@/lib/timeline-api";

/**
 * GET /api/timeline-events
 * Tous les évènements officiels, du plus récent au plus ancien, avec leur
 * statut calculé (`announced`, `upcoming`, `live`, `ended`). `?status=live` :
 * les seuls évènements en cours, celui qui finit le plus tôt d'abord.
 */
export async function GET(request: Request) {
  const live = new URL(request.url).searchParams.get("status") === "live";
  return NextResponse.json({
    events: live ? await listLiveTimelineEvents() : await listTimelineEvents(),
  });
}

/**
 * POST /api/timeline-events
 * Body : `{ event: TimelineEventInput, source?, gameVersion?, contributionId? }`.
 * Propose un évènement : c'est une contribution, publiée tout de suite à
 * partir du niveau 3, relue sinon. Répond `{ contribution, standing }`.
 */
export async function POST(request: Request) {
  const user = await timelineSession();
  if (!user) return unauthenticated();
  const body = await readJson(request);
  if (!body) return invalidJson();

  try {
    return NextResponse.json(
      await submitCatalogContribution(
        user,
        { kind: "timelineCreate", input: body.event },
        {
          source: body.source,
          gameVersion: body.gameVersion,
          contributionId:
            typeof body.contributionId === "string"
              ? body.contributionId
              : undefined,
        },
      ),
      { status: 201 },
    );
  } catch (error) {
    return timelineErrorResponse(error);
  }
}
