import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { EventForm } from "@/app/orgs/[orgId]/events/form";
import {
  EventsShell,
  readerIdFromSession,
} from "@/app/orgs/[orgId]/events/shell";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OrgEvents.Personal");
  return { title: t("newTitle") };
}

/** Un évènement personnel, hors de toute organisation. */
export default async function NewPersonalEventPage() {
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();

  return (
    <EventsShell
      orgId={null}
      name=""
      trail={[{ label: t("Personal.newTitle") }]}
    >
      <h1 className="text-3xl font-bold tracking-tight">
        {t("Personal.newTitle")}
      </h1>
      {readerId ? (
        <EventForm orgId={null} orgName="" />
      ) : (
        <div className="space-y-3">
          <p className="text-white/70">{t("Personal.signIn")}</p>
          <Button asChild variant="outline">
            <Link
              href={`/login?callbackUrl=${encodeURIComponent("/events/new")}`}
            >
              {t("Community.signIn")}
            </Link>
          </Button>
        </div>
      )}
    </EventsShell>
  );
}
