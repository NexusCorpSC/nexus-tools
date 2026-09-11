import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { getItemComparison } from "@/lib/items";
import { parseCompareIds } from "@/types/items";
import { ComparisonBoard } from "./components";

export const metadata: Metadata = {
  title: "Comparateur",
  description:
    "Mettez côte à côte plusieurs objets du même type — vaisseaux, armes, composants — et lisez les écarts caractéristique par caractéristique.",
  openGraph: {
    title: "Comparateur — Nexus Tools",
    description:
      "Comparez plusieurs objets du même type en colonnes : performances, capacités, armement.",
    url: "https://tools.services.nexus/items/compare",
  },
};

/**
 * La comparaison tient dans l'URL (`?ids=slug1,slug2`) : elle se partage, se
 * range dans un message d'organisation et se retrouve telle quelle au retour.
 */
export default async function CompareItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const { ids } = await searchParams;
  const slugs = parseCompareIds(Array.isArray(ids) ? ids.join(",") : ids);
  const [comparison, t] = await Promise.all([
    getItemComparison(slugs),
    getTranslations("Items.Compare"),
  ]);
  const tItems = await getTranslations("Items");

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{tItems("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/items">{tItems("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {comparison ? (
        <ComparisonBoard comparison={comparison} />
      ) : (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-[#9ED0FF]/25 bg-white/[0.02] p-6">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="max-w-prose text-sm leading-relaxed text-nexus/75">
            {t("emptyHint")}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/items">
              <ArrowLeftIcon className="size-4" />
              {t("emptyCta")}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
