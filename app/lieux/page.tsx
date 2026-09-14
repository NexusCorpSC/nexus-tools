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
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { PlacesBrowser } from "./components";

export const metadata: Metadata = {
  title: "Lieux",
  description:
    "Tous les lieux du 'verse : villes, stations, avant-postes et les lieux qu'ils contiennent, avec leurs services, leurs magasins et leurs plans.",
  openGraph: {
    title: "Lieux — Nexus Tools",
    description:
      "Villes, stations et avant-postes du 'verse : services, magasins et plans.",
    url: "https://tools.services.nexus/lieux",
  },
};

export default async function PlacesPage() {
  const t = await getTranslations("Places");
  const canEdit = await hasPermission(PLACES_EDIT_PERMISSION);

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
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-nexus">{t("header")}</p>
        </div>
        {canEdit && (
          <Button asChild size="sm">
            <Link href="/admin/lieux/new">
              <PlusIcon className="mr-1.5 size-4" />
              {t("Admin.newPlaceButton")}
            </Link>
          </Button>
        )}
      </div>

      <Suspense>
        <PlacesBrowser />
      </Suspense>

      <p className="text-xs text-nexus">{t("footnote")}</p>
    </div>
  );
}
