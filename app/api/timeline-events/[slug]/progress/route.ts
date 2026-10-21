import { NextResponse } from "next/server";
import {
  getTimelineProgress,
  saveTimelineProgress,
} from "@/lib/timeline-events";
import {
  invalidJson,
  readJson,
  timelineSession,
  unauthenticated,
} from "@/lib/timeline-api";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/timeline-events/{slug}/progress — les points du joueur, par parcours. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const user = await timelineSession();
  if (!user) return unauthenticated();
  return NextResponse.json(await getTimelineProgress(user.id, slug));
}

/**
 * PUT /api/timeline-events/{slug}/progress
 * Body : `{ points: { [trackId]: number } }`, recopiés du mobiGlas.
 */
export async function PUT(request: Request, { params }: Params) {
  const { slug } = await params;
  const user = await timelineSession();
  if (!user) return unauthenticated();
  const body = await readJson(request);
  if (!body) return invalidJson();
  try {
    const saved = await saveTimelineProgress(user.id, slug, body.points);
    if (!saved) {
      return NextResponse.json({ error: "notFound" }, { status: 404 });
    }
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      { error: "invalid", detail: (error as Error).message },
      { status: 400 },
    );
  }
}
