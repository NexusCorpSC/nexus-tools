import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Industrie",
  description:
    "Outils industriels pour Star Citizen : gestion du raffinage de minerais et optimisation de votre chaîne de production.",
  openGraph: {
    title: "Industrie — Nexus Tools",
    description:
      "Gérez vos opérations industrielles dans Star Citizen : raffinage, production et plus.",
    url: "https://tools.nexus.services/industry",
  },
};

export default function IndustryPage() {
  const t = useTranslations("Industry");
  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("industry")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Button asChild>
        <Link href="/industry/refine">{t("refine")}</Link>
      </Button>
    </div>
  );
}
