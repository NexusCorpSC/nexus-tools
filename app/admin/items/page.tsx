import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ItemsManager } from "./components/items-manager";

export const metadata: Metadata = {
  title: "Admin — Objets",
  description: "Gestion des objets, armes et véhicules du jeu.",
  robots: { index: false, follow: false },
};

export default async function AdminItemsPage() {
  const t = await getTranslations("Items.Admin");

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
          <Button asChild>
            <Link href="/admin/items/new">
              <PlusIcon className="size-4" />
              {t("newItemButton")}
            </Link>
          </Button>
        </div>

        <ItemsManager />

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">{t("backToAdmin")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
