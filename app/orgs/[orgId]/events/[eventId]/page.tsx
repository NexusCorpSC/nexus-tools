import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getOrgEventView } from "@/lib/org-events";
import { EventDetail } from "../components";
import { EventsShell, orgName, readerIdFromSession } from "../shell";

type Params = { params: Promise<{ orgId: string; eventId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { orgId, eventId } = await params;
  const event = await getOrgEventView(
    orgId,
    eventId,
    await readerIdFromSession(),
  );
  if (!event) return { title: "Évènement introuvable" };

  return {
    title: event.title,
    description: event.description.slice(0, 160) || undefined,
  };
}

export default async function OrgEventPage({ params }: Params) {
  const { orgId, eventId } = await params;
  const readerId = await readerIdFromSession();

  const [name, event] = await Promise.all([
    orgName(orgId),
    getOrgEventView(orgId, eventId, readerId),
  ]);
  if (!name || !event) notFound();

  return (
    <EventsShell orgId={orgId} name={name} trail={[{ label: event.title }]}>
      <EventDetail initial={event} signedIn={!!readerId} />
    </EventsShell>
  );
}
