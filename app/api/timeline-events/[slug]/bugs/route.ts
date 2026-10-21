import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createTimelineBug, listTimelineBugs } from "@/lib/timeline-events";
import {
  invalidJson,
  readJson,
  timelineErrorResponse,
  timelineSession,
  unauthenticated,
} from "@/lib/timeline-api";
import type { TimelineBugInput } from "@/types/timeline-events";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/timeline-events/{slug}/bugs — les bugs connus, les plus partagés d'abord. */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const user = await timelineSession();
  return NextResponse.json({ bugs: await listTimelineBugs(slug, user?.id) });
}

/**
 * POST /api/timeline-events/{slug}/bugs
 * Body : `{ title, description?, workaround?, status?, fixedIn?,
 * issueCouncilUrl? }`. Publié tout de suite ; son auteur l'a d'office.
 */
export async function POST(request: Request, { params }: Params) {
  const { slug } = await params;
  const user = await timelineSession();
  if (!user) return unauthenticated();
  const body = await readJson(request);
  if (!body) return invalidJson();
  try {
    const bug = await createTimelineBug(
      slug,
      user,
      body as unknown as TimelineBugInput,
    );
    revalidatePath(`/timeline/${slug}`);
    return NextResponse.json(bug, { status: 201 });
  } catch (error) {
    return timelineErrorResponse(error);
  }
}
