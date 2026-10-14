import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  getEventSquad,
  getOrgEventSummary,
  getOrgEventView,
} from "@/lib/org-events";
import { eventHref } from "@/types/org-events";
import { OrganizerSummary } from "@/app/orgs/[orgId]/events/organizer";
import {
  EventsShell,
  readerIdFromSession,
} from "@/app/orgs/[orgId]/events/shell";

type Params = { params: Promise<{ eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OrgEvents.Summary");
  return { title: t("title") };
}

export default async function PersonalEventSummaryPage({ params }: Params) {
  const { eventId } = await params;
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();
  if (!readerId) notFound();

  const [event, outcome] = await Promise.all([
    getOrgEventView(null, eventId, readerId),
    getOrgEventSummary(null, eventId, readerId),
  ]);
  if (!event) notFound();
  const squad = await getEventSquad(event.squadId);

  return (
    <EventsShell
      orgId={null}
      name=""
      trail={[
        { label: event.title, href: eventHref(event) },
        { label: t("Summary.title") },
      ]}
    >
      {"summary" in outcome ? (
        <OrganizerSummary
          event={event}
          summary={outcome.summary}
          squad={squad}
        />
      ) : (
        <p className="text-white/70">{t("forbidden")}</p>
      )}
    </EventsShell>
  );
}
