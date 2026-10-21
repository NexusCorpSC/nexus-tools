import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getTimelineEvent } from "@/lib/timeline-events";
import { timelineToInput } from "@/lib/contribution-catalog";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  openEditOn,
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import {
  DIRECT_EDIT_LEVEL,
  POINTS,
  RENAME_LEVEL,
} from "@/types/contributions";
import {
  TIMELINE_FIELDS,
  type TimelineEventInput,
} from "@/types/timeline-events";
import { TimelineShell, timelinePath } from "../../components";
import { EventForm } from "../../event-form";
import { eventFormProps } from "../../form-props";

export const metadata: Metadata = {
  title: "Modifier un évènement",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Corriger la fiche d'un évènement : dates, sources, récompenses, contrats.
 * Une correction encore ouverte se reprend, sections du guide comprises.
 */
export default async function EditTimelineEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c } = await searchParams;
  const { userId, standing } = await requireContributor(
    `${timelinePath(slug)}/modifier${c ? `?c=${c}` : ""}`,
  );

  const event = await getTimelineEvent(slug);
  if (!event) notFound();

  const resumed =
    (await resumableContribution(c, userId, "timelineEdit", slug)) ??
    (await openEditOn(userId, "timelineEdit", slug));
  // Les champs que la proposition ouverte change ; ses sections du guide
  // restent dans la contribution et ne repassent pas par ce formulaire.
  const proposal = (resumed?.proposal ?? {}) as Record<string, unknown>;
  const initial: TimelineEventInput = {
    ...timelineToInput(event),
    ...Object.fromEntries(
      TIMELINE_FIELDS.filter((field) => field in proposal).map((field) => [
        field,
        proposal[field],
      ]),
    ),
  };
  const [t, props] = await Promise.all([
    getTranslations("Timeline.Form"),
    eventFormProps(initial),
  ]);

  return (
    <TimelineShell
      current={event.name}
      currentHref={timelinePath(slug)}
      last={t("editTitle")}
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            {t("editHeading", { name: event.name })}
          </h1>
          <ContributionNotice
            standing={standing}
            direct={standing.level >= DIRECT_EDIT_LEVEL}
            points={POINTS.edit}
            resumed={resumed}
          />
        </div>
        <EventForm
          mode="edit"
          initial={initial}
          canRename={standing.level >= RENAME_LEVEL}
          contributionId={resumed?.id}
          source={resumed?.source}
          gameVersion={resumed?.gameVersion}
          {...props}
        />
      </div>
    </TimelineShell>
  );
}
