import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrgAccess, listOrgEvents } from "@/lib/org-events";
import { EventCard } from "./components";
import { EventsShell, orgName, readerIdFromSession } from "./shell";

type Params = { params: Promise<{ orgId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { orgId } = await params;
  const name = await orgName(orgId);
  return { title: name ? `Évènements — ${name}` : "Évènements" };
}

export default async function OrgEventsPage({ params }: Params) {
  const { orgId } = await params;
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();

  const [name, access, events] = await Promise.all([
    orgName(orgId),
    getOrgAccess(orgId, readerId),
    listOrgEvents(orgId, readerId, { from: null, to: null }),
  ]);

  if (!name || !access || !events) notFound();

  return (
    <EventsShell orgId={orgId} name={name} trail={[]}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        {access.isMember ? (
          <Button asChild>
            <Link href={`/orgs/${orgId}/events/new`}>
              <Plus className="size-4" />
              {t("plan")}
            </Link>
          </Button>
        ) : null}
      </div>

      {events.length === 0 ? (
        <p className="text-white/70">{t("none")}</p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </EventsShell>
  );
}
