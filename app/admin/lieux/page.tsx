import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon, Square2StackIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { PlacesManager } from "./components/places-manager";

export const metadata: Metadata = {
  title: "Admin — Lieux",
  description: "Gestion du catalogue des lieux du 'verse.",
  robots: { index: false, follow: false },
};

export default async function AdminPlacesPage() {
  const t = await getTranslations("Places.Admin");

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-5xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-8 shadow-xl shadow-black/20 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#CCE7FF]">
              {t("managerTitle")}
            </h1>
            <p className="mt-1 text-[#9ED0FF]/70">{t("managerHeader")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/admin/lieux/plans-partages">
                <Square2StackIcon className="size-4" />
                {t("sharedPlansButton")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/lieux/new">
                <PlusIcon className="size-4" />
                {t("newPlaceButton")}
              </Link>
            </Button>
          </div>
        </div>

        <PlacesManager />

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">{t("backToAdmin")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
