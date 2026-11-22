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
import {
  DEFAULT_HALO_BAND,
  DEFAULT_HALO_BANDS,
  findHaloPoint,
} from "@/lib/aaron-halo";
import HaloNavigator from "./components/halo-navigator";

export const metadata: Metadata = {
  title: "Navigation vers l'Aaron Halo",
  description:
    "Atteignez une bande de l'Aaron Halo dans Star Citizen : choisissez le départ, la bande et l'arrivée, et coupez le saut quantique quand le HUD affiche la distance donnée.",
  openGraph: {
    title: "Navigation vers l'Aaron Halo — Nexus Tools",
    description:
      "La distance restante à laquelle couper un saut quantique pour tomber dans la bande voulue de l'Aaron Halo.",
    url: "https://tools.services.nexus/industry/aaron-halo",
  },
};

type Search = {
  from?: string | string[];
  to?: string | string[];
  band?: string | string[];
};

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AaronHaloPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const t = await getTranslations("AaronHalo");

  const from = findHaloPoint(one(params.from))?.id ?? "arc-l1";
  const askedTo = findHaloPoint(one(params.to))?.id ?? null;
  // Une arrivée égale au départ ne fait pas de trajet : on la laisse choisir.
  const to = askedTo === from ? null : askedTo;
  const asked = Number(one(params.band));
  const band = DEFAULT_HALO_BANDS.some((entry) => entry.id === asked)
    ? asked
    : DEFAULT_HALO_BAND;

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

      <HaloNavigator initialFrom={from} initialTo={to} initialBand={band} />
    </div>
  );
}
