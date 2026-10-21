import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import { DIRECT_EDIT_LEVEL, POINTS } from "@/types/contributions";
import type { TimelineEventInput } from "@/types/timeline-events";
import { TimelineShell } from "../components";
import { EventForm } from "../event-form";
import { eventFormProps } from "../form-props";

export const metadata: Metadata = {
  title: "Proposer un évènement",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Proposer un évènement officiel ; `?c=` reprend une proposition ouverte. */
export default async function NewTimelineEventPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const { userId, standing } = await requireContributor(
    `/timeline/nouveau${c ? `?c=${c}` : ""}`,
  );
  const resumed = await resumableContribution(c, userId, "timelineCreate");
  const initial = resumed?.proposal as Partial<TimelineEventInput> | undefined;
  const [t, props] = await Promise.all([
    getTranslations("Timeline.Form"),
    eventFormProps(initial),
  ]);

  return (
    <TimelineShell last={t("createTitle")}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("createTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("createHint")}</p>
          <ContributionNotice
            standing={standing}
            direct={standing.level >= DIRECT_EDIT_LEVEL}
            points={POINTS.timelineCreate}
            resumed={resumed}
          />
        </div>
        <EventForm
          mode="create"
          initial={initial}
          canRename
          contributionId={resumed?.id}
          source={resumed?.source}
          gameVersion={resumed?.gameVersion}
          {...props}
        />
      </div>
    </TimelineShell>
  );
}
