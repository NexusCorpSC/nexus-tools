import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getAvailableTransports } from "@/lib/cargo-ships";
import CargoManifest from "./components/cargo-manifest";

export const metadata: Metadata = {
  title: "Cargo",
  description:
    "Feuille de route cargo pour Star Citizen : répartissez vos volumes en conteneurs SCU (32, 24, 16, 8, 4, 2, 1) et suivez le remplissage de votre vaisseau.",
  openGraph: {
    title: "Cargo — Nexus Tools",
    description:
      "Planifiez vos convois Star Citizen : découpage automatique en conteneurs SCU, totaux par destination et capacité restante.",
    url: "https://tools.nexus.services/industry/cargo",
  },
};

export default async function CargoPage() {
  const t = await getTranslations("Cargo");
  const transports = await getAvailableTransports();

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/industry">{t("industry")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-nexus mt-1">{t("description")}</p>
        <p className="mt-1 text-xs text-[#9ED0FF]/60">{t("localOnly")}</p>
      </div>

      <CargoManifest transports={transports} />
    </div>
  );
}
