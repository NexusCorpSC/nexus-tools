import { notFound } from "next/navigation";
import { RememberListUrl } from "@/components/remember-list-url";
import type { Metadata } from "next";
import {
  getOrgAccess,
  listOrgEvents,
  listPastOrgEvents,
} from "@/lib/org-events";
import { EventCalendar, type CalendarView } from "./calendar";
import { EventsShell, orgName, readerIdFromSession } from "./shell";

// Ici plutôt que dans `calendar.tsx` : une valeur d'un module client ne se lit
// pas depuis le serveur.
const CALENDAR_VIEWS: readonly CalendarView[] = ["upcoming", "mine", "past"];

type Params = {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ view?: string }>;
};

export async function generateMetadata({
  params,
}: Pick<Params, "params">): Promise<Metadata> {
  const { orgId } = await params;
  const name = await orgName(orgId);
  return { title: name ? `Évènements — ${name}` : "Évènements" };
}

export default async function OrgEventsPage({ params, searchParams }: Params) {
  const { orgId } = await params;
  const { view: asked } = await searchParams;
  const view: CalendarView = (CALENDAR_VIEWS as readonly string[]).includes(
    asked ?? "",
  )
    ? (asked as CalendarView)
    : "upcoming";
  const readerId = await readerIdFromSession();

  const [name, access, events] = await Promise.all([
    orgName(orgId),
    getOrgAccess(orgId, readerId),
    view === "past"
      ? listPastOrgEvents(orgId, readerId)
      : listOrgEvents(orgId, readerId, { from: null, to: null }),
  ]);

  if (!name || !access || !events) notFound();

  return (
    <EventsShell orgId={orgId} name={name} trail={[]}>
      <RememberListUrl />
      <EventCalendar
        orgId={orgId}
        events={events}
        view={view === "mine" && !access.isMember ? "upcoming" : view}
        isMember={access.isMember}
      />
    </EventsShell>
  );
}
