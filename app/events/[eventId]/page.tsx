import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOrgEventView, markEventSeen } from "@/lib/org-events";
import { EventDetail } from "@/app/orgs/[orgId]/events/detail";
import {
  EventsShell,
  readerIdFromSession,
} from "@/app/orgs/[orgId]/events/shell";

type Params = { params: Promise<{ eventId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { eventId } = await params;
  const event = await getOrgEventView(
    null,
    eventId,
    await readerIdFromSession(),
  );
  if (!event) return { title: "Évènement introuvable" };

  return {
    title: event.title,
    description: event.description.slice(0, 160) || undefined,
  };
}

/** La fiche d'un évènement personnel : son créateur et ses invités. */
export default async function PersonalEventPage({ params }: Params) {
  const { eventId } = await params;
  const readerId = await readerIdFromSession();

  const event = await getOrgEventView(null, eventId, readerId);
  if (!event) notFound();
  // Ouvert par l'invité : son invitation n'est plus nouvelle.
  if (readerId && event.guest === "invite") {
    await markEventSeen(eventId, readerId);
  }

  return (
    <EventsShell orgId={null} name="" trail={[{ label: event.title }]}>
      <EventDetail initial={event} signedIn={!!readerId} orgName="" />
    </EventsShell>
  );
}
