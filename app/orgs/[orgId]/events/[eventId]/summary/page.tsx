import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  getEventSquad,
  getOrgEventSummary,
  getOrgEventView,
} from "@/lib/org-events";
import { OrganizerSummary } from "../../organizer";
import { EventsShell, orgName, readerIdFromSession } from "../../shell";

type Params = { params: Promise<{ orgId: string; eventId: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OrgEvents.Summary");
  return { title: t("title") };
}

export default async function OrgEventSummaryPage({ params }: Params) {
  const { orgId, eventId } = await params;
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();
  if (!readerId) notFound();

  const [name, event, outcome] = await Promise.all([
    orgName(orgId),
    getOrgEventView(orgId, eventId, readerId),
    getOrgEventSummary(orgId, eventId, readerId),
  ]);
  if (!name || !event) notFound();
  const squad = await getEventSquad(event.squadId);

  return (
    <EventsShell
      orgId={orgId}
      name={name}
      trail={[
        { label: event.title, href: `/orgs/${orgId}/events/${eventId}` },
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
