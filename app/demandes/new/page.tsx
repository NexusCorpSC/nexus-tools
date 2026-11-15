import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getItemBySlug } from "@/lib/items";
import { listMyOrgs } from "@/lib/player-requests";
import { cn } from "@/lib/utils";
import { ListLink } from "@/components/list-link";
import { RequestForm } from "@/app/demandes/request-form";
import { MUTED, PAGE_PANEL } from "@/app/demandes/ui";

export const metadata: Metadata = {
  title: "Publier une demande",
  robots: { index: false, follow: false },
};

/** Publier une demande ; `?item=<slug>` vient du bouton « Demander » d'une fiche. */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");
  const { item } = await searchParams;
  const t = await getTranslations("Requests");
  const [orgs, fromItem] = await Promise.all([
    listMyOrgs(new ObjectId(session.user.id)),
    item ? getItemBySlug(item) : Promise.resolve(null),
  ]);

  return (
    <div className={cn(PAGE_PANEL, "max-w-2xl")}>
      <ListLink href="/demandes" className="text-sm text-[#CCE7FF] hover:underline">
        ← {t("backToBoard")}
      </ListLink>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-[#E3F1FF]">{t("form.title")}</h1>
        <p className={cn("text-sm", MUTED)}>{t("form.subtitle")}</p>
      </div>
      <RequestForm orgs={orgs} initialName={fromItem?.name} />
    </div>
  );
}
