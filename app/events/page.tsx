import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listCommunityEvents } from "@/lib/org-events";
import { readerIdFromSession } from "@/app/orgs/[orgId]/events/shell";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { CommunityCalendarView } from "./community-calendar";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("OrgEvents.Community");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

/**
 * Communauté › Évènements : les évènements publics de toutes les
 * organisations et, pour un lecteur connecté, ceux de ses organisations.
 */
export default async function CommunityEventsPage() {
  const t = await getTranslations("OrgEvents");
  const readerId = await readerIdFromSession();
  const calendar = await listCommunityEvents(readerId);

  return (
    <div className="m-2 mx-auto max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>{t("Community.community")}</BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <CommunityCalendarView
        events={calendar.events}
        myOrgs={calendar.myOrgs}
        signedIn={readerId !== null}
      />
    </div>
  );
}
