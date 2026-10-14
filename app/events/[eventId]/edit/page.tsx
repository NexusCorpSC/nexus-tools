import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getOrgEventView } from "@/lib/org-events";
import { eventHref } from "@/types/org-events";
import { EventForm } from "@/app/orgs/[orgId]/events/form";
import {
  EventsShell,
  readerIdFromSession,
} from "@/app/orgs/[orgId]/events/shell";

type Params = { params: Promise<{ eventId: string }> };

export default async function EditPersonalEventPage({ params }: Params) {
  const { eventId } = await params;
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();

  const event = await getOrgEventView(null, eventId, readerId);
  if (!event) notFound();

  return (
    <EventsShell
      orgId={null}
      name=""
      trail={[
        { label: event.title, href: eventHref(event) },
        { label: t("Form.editTitle") },
      ]}
    >
      <h1 className="text-3xl font-bold tracking-tight">
        {t("Form.editTitle")}
      </h1>
      {event.canManage ? (
        <EventForm orgId={null} orgName="" initial={event} />
      ) : (
        <p className="text-white/70">{t("forbidden")}</p>
      )}
    </EventsShell>
  );
}
