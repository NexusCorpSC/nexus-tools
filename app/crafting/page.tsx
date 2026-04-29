import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

export const metadata: Metadata = {
  title: "Crafting",
  description:
    "Gérez vos blueprints et recettes de crafting dans Star Citizen. Partagez-les avec votre organisation et optimisez votre production.",
  openGraph: {
    title: "Crafting — Nexus Tools",
    description:
      "Gérez vos blueprints et recettes de crafting Star Citizen au sein de votre organisation.",
    url: "https://tools.nexus.services/crafting",
  },
};

export default function CraftingPage() {
  const t = useTranslations("Crafting");

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

      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <p>{t("wip")}</p>

      <div className="flex flex-row gap-2">
        <Button asChild>
          <Link href="/crafting/blueprints">{t("blueprints")}</Link>
        </Button>

        <Button asChild>
          <Link href="/inventory">{t("inventory")}</Link>
        </Button>
      </div>
    </div>
  );
}
