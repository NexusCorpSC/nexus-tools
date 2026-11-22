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
import QuantumNavigator, {
  type QuantumInitial,
} from "./components/quantum-navigator";

export const metadata: Metadata = {
  title: "Saut quantique vers un point",
  description:
    "Rejoignez n'importe quel point de Star Citizen sans balise : un marqueur, un lieu ou des coordonnées. Nexus Tools trouve le saut dont la ligne passe le plus près et la distance restante où le couper.",
  openGraph: {
    title: "Saut quantique vers un point — Nexus Tools",
    description:
      "Le saut quantique à lancer et la distance restante où le couper pour approcher un point sans balise.",
    url: "https://tools.services.nexus/saut-quantique",
  },
};

type Search = Record<string, string | string[] | undefined>;

function one(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() ? first.trim() : undefined;
}

function number(value: string | string[] | undefined) {
  const text = one(value);
  const parsed = text === undefined ? NaN : Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default async function QuantumJumpPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const t = await getTranslations("QuantumRoute");

  const x = number(params.x);
  const y = number(params.y);
  const z = number(params.z);
  const initial: QuantumInitial = {
    marker: one(params.marker),
    place: one(params.place),
    system: one(params.system),
    coordinates:
      x !== undefined && y !== undefined && z !== undefined
        ? { x, y, z }
        : undefined,
    from: one(params.from),
  };

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

      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-nexus mt-1">{t("description")}</p>
        <p className="mt-1 text-xs text-[#9ED0FF]/60">{t("desktopHint")}</p>
      </div>

      <QuantumNavigator initial={initial} />
    </div>
  );
}
