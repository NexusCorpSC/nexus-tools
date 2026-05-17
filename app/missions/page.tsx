import type { Metadata } from "next";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Missions",
  description:
    "Parcourez toutes les missions du jeu et leurs détails et récompenses.",
  openGraph: {
    title: "Missions — Nexus Tools",
    description:
      "Parcourez toutes les missions du jeu et leurs détails et récompenses.",
    url: "https://tools.nexus.services/missions",
  },
};

export default async function MissionsPage() {
  const t = await getTranslations("Missions");

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
      </div>

      <Suspense></Suspense>
    </div>
  );
}
