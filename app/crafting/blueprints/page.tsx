import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/24/outline";
import { hasPermission } from "@/lib/permissions";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { BlueprintGrid } from "./components";

export const metadata: Metadata = {
  title: "Blueprints",
  description:
    "Parcourez tous les blueprints de crafting disponibles dans Star Citizen. Gérez votre collection, filtrez par catégorie et partagez avec votre organisation.",
  openGraph: {
    title: "Blueprints — Nexus Tools",
    description:
      "Tous les blueprints de crafting Star Citizen : recettes, matériaux, temps de fabrication.",
    url: "https://tools.nexus.services/crafting/blueprints",
  },
};

export default async function Page() {
  const t = await getTranslations("Crafting");
  const canOperateBlueprints = await hasPermission("blueprints:edit");

  const session = await auth.api.getSession({ headers: await headers() });
  const isLoggedIn = !!session?.user;

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/crafting">{t("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("Blueprints.title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">{t("Blueprints.title")}</h1>
          <p className="text-nexus">{t("Blueprints.header")}</p>
        </div>
        {canOperateBlueprints && (
          <Button asChild size="sm">
            <Link href="/crafting/blueprints/new">
              <PlusIcon className="size-4 mr-1.5" />
              {t("Blueprints.Admin.newBlueprintButton")}
            </Link>
          </Button>
        )}
      </div>

      <Suspense>
        <BlueprintGrid isLoggedIn={isLoggedIn} />
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
