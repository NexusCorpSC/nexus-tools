import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getOrgAccess } from "@/lib/org-events";
import { EventForm } from "../components";
import { EventsShell, orgName, readerIdFromSession } from "../shell";

type Params = { params: Promise<{ orgId: string }> };

export default async function NewOrgEventPage({ params }: Params) {
  const { orgId } = await params;
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();

  const [name, access] = await Promise.all([
    orgName(orgId),
    getOrgAccess(orgId, readerId),
  ]);
  if (!name || !access) notFound();

  return (
    <EventsShell
      orgId={orgId}
      name={name}
      trail={[{ label: t("Form.newTitle") }]}
    >
      <h1 className="text-2xl font-bold">{t("Form.newTitle")}</h1>
      {access.isMember ? (
        <EventForm orgId={orgId} />
      ) : (
        <p className="text-white/70">{t("notMember")}</p>
      )}
    </EventsShell>
  );
}
