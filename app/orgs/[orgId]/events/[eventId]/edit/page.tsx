import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getOrgEventView } from "@/lib/org-events";
import { EventForm } from "../../components";
import { EventsShell, orgName, readerIdFromSession } from "../../shell";

type Params = { params: Promise<{ orgId: string; eventId: string }> };

export default async function EditOrgEventPage({ params }: Params) {
  const { orgId, eventId } = await params;
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();

  const [name, event] = await Promise.all([
    orgName(orgId),
    getOrgEventView(orgId, eventId, readerId),
  ]);
  if (!name || !event) notFound();

  return (
    <EventsShell
      orgId={orgId}
      name={name}
      trail={[
        { label: event.title, href: `/orgs/${orgId}/events/${eventId}` },
        { label: t("Form.editTitle") },
      ]}
    >
      <h1 className="text-2xl font-bold">{t("Form.editTitle")}</h1>
      {event.canManage ? (
        <EventForm orgId={orgId} initial={event} />
      ) : (
        <p className="text-white/70">{t("forbidden")}</p>
      )}
    </EventsShell>
  );
}
