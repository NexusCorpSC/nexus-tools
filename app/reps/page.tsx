import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { getFactions, getPlayerReputations } from "@/lib/reputations";
import { FactionsList } from "@/app/reps/components/factions-list";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export const metadata: Metadata = {
  title: "Réputations",
  description:
    "Centralisez et suivez les réputations de faction de vos membres Star Citizen. Partagez votre progression avec votre guilde.",
  openGraph: {
    title: "Réputations — Nexus Tools",
    description:
      "Suivez les niveaux de réputation de faction pour vous et vos équipiers Star Citizen.",
    url: "https://tools.nexus.services/reps",
  },
};

export default async function ReputationPage() {
  const t = await getTranslations("Reputations");

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

        <p>{t("connectToUse")}</p>

        <Button asChild>
          <Link href="/">{t("backToHome")}</Link>
        </Button>
      </div>
    );
  }

  const factions = await getFactions();

  if (!factions) {
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

        <p>{t("noFactions")}</p>
      </div>
    );
  }

  const playerReputation = await getPlayerReputations(session.user.id);

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("selectCurrentLevelInstructions")}</p>

      <FactionsList factions={factions} playerReputation={playerReputation} />
    </div>
  );
}
