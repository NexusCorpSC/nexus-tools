import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { listPlaceGroups } from "@/lib/places";
import { PlanGroups } from "../components/plan-groups";

export const metadata: Metadata = {
  title: "Admin — Plans partagés",
  description: "Rapprocher les lieux qui se ressemblent pour partager un plan.",
  robots: { index: false, follow: false },
};

/**
 * Les groupes sont calculés sur le serveur et rendus d'un bloc : ils tiennent
 * en quelques dizaines de lignes pour tout le catalogue, et une route d'API
 * publique n'apporterait rien qu'un `router.refresh()` ne fasse déjà.
 */
export default async function SharedPlansPage() {
  const t = await getTranslations("Places.Admin");
  const groups = await listPlaceGroups();

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-5xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#CCE7FF]">
            {t("sharedTitle")}
          </h1>
          <p className="mt-1 text-[#9ED0FF]/70">{t("sharedHeader")}</p>
        </div>

        <PlanGroups groups={groups} />

        <div className="flex gap-2 border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin/lieux">{t("backToPlaces")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
