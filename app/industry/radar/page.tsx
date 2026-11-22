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
import { isRadarContext } from "@/lib/radar";
import { getRadarSignatures } from "@/lib/radar-signatures";
import RadarScanner from "./components/radar-scanner";

export const metadata: Metadata = {
  title: "Scanner de signature radar",
  description:
    "Identifiez ce que vous scannez dans Star Citizen : saisissez la signature radar affichée et retrouvez le minerai, l'astéroïde ou l'épave, et le nombre de rochers.",
  openGraph: {
    title: "Scanner de signature radar — Nexus Tools",
    description:
      "La signature radar d'un scan Star Citizen, comparée aux signatures connues des minerais, astéroïdes et épaves.",
    url: "https://tools.services.nexus/industry/radar",
  },
};

export default async function RadarPage({
  searchParams,
}: {
  searchParams: Promise<{ context?: string | string[] }>;
}) {
  const { context } = await searchParams;
  const t = await getTranslations("Radar");
  const signatures = await getRadarSignatures();

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
        <p className="mt-1 text-xs text-[#9ED0FF]/60">{t("desktopHint")}</p>
      </div>

      <RadarScanner
        signatures={signatures}
        initialContext={isRadarContext(context) ? context : "all"}
      />
    </div>
  );
}
