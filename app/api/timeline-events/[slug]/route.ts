import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { submitCatalogContribution } from "@/lib/contributions";
import {
  countTimelineBugs,
  getTimelineEvent,
  getTimelineProgress,
  resolveTimelineRefs,
  setTimelineEventRemoved,
} from "@/lib/timeline-events";
import {
  invalidJson,
  isTimelineModerator,
  readJson,
  timelineErrorResponse,
  timelineSession,
  unauthenticated,
} from "@/lib/timeline-api";
import { timelineStatus } from "@/types/timeline-events";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/timeline-events/{slug}
 * L'évènement, son statut, ce que ses récompenses et contrats désignent
 * (`refs.items` par slug, avec leur image ; `refs.missions` par identifiant),
 * le nombre de bugs signalés, et la progression du joueur connecté.
 */
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const event = await getTimelineEvent(slug);
  if (!event) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  const user = await timelineSession();
  const [refs, bugs, progress] = await Promise.all([
    resolveTimelineRefs(event),
    countTimelineBugs(slug),
    user ? getTimelineProgress(user.id, slug) : Promise.resolve(null),
  ]);
  return NextResponse.json({
    event: { ...event, status: timelineStatus(event) },
    refs,
    bugs,
    progress,
  });
}

/**
 * PATCH /api/timeline-events/{slug}
 * Body : `{ event: Partial<TimelineEventInput> & { guide?: section[],
 * guideRemoved?: string[] }, source?, gameVersion?, contributionId? }`.
 * Une correction, en contribution : seuls les champs envoyés comptent, et une
 * correction encore ouverte du même auteur est reprise et complétée.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { slug } = await params;
  const user = await timelineSession();
  if (!user) return unauthenticated();
  const body = await readJson(request);
  if (!body) return invalidJson();

  try {
    return NextResponse.json(
      await submitCatalogContribution(
        user,
        { kind: "timelineEdit", slug, input: body.event },
        {
          source: body.source,
          gameVersion: body.gameVersion,
          contributionId:
            typeof body.contributionId === "string"
              ? body.contributionId
              : undefined,
        },
      ),
    );
  } catch (error) {
    return timelineErrorResponse(error);
  }
}

/**
 * DELETE /api/timeline-events/{slug}
 * Retire l'évènement de la vue publique (modérateurs). Rien n'est effacé :
 * `?restore=1` le remet.
 */
export async function DELETE(request: Request, { params }: Params) {
  const { slug } = await params;
  if (!(await isTimelineModerator())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const restore = new URL(request.url).searchParams.get("restore") === "1";
  if (!(await setTimelineEventRemoved(slug, !restore))) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  revalidatePath("/timeline");
  revalidatePath(`/timeline/${slug}`);
  revalidatePath("/");
  return NextResponse.json({ ok: true });
}
