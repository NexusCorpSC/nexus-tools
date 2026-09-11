import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "@heroicons/react/24/outline";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/permissions";
import { ITEMS_EDIT_PERMISSION } from "@/types/items";
import { ItemGrid } from "./components";

export const metadata: Metadata = {
  title: "Objets",
  description:
    "Recherchez tous les objets, armes et véhicules du jeu : statistiques, variantes, ensembles et blueprints permettant de les fabriquer.",
  openGraph: {
    title: "Objets — Nexus Tools",
    description:
      "Tous les objets, armes et véhicules du jeu : statistiques, variantes, ensembles et blueprints.",
    url: "https://tools.services.nexus/items",
  },
};

export default async function ItemsPage() {
  const t = await getTranslations("Items");
  const canEdit = await hasPermission(ITEMS_EDIT_PERMISSION);

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

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("title")}</h1>
          <p className="text-nexus">{t("header")}</p>
        </div>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/admin/items/new">
              <PlusIcon className="size-4 mr-1.5" />
              {t("Admin.newItemButton")}
            </Link>
          </Button>
        )}
      </div>

      <Suspense>
        <ItemGrid />
      </Suspense>

      <p className="text-xs text-nexus">
        Images retrieved from various incredible tools such as{" "}
        <Link href="https://starcitizen.tools/" target="_blank">
          Star Citizen Tools
        </Link>
        .
      </p>
    </div>
  );
}
