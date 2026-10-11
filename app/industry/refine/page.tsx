import Link from "next/link";
import type { Metadata } from "next";
import { listRefiningJobs, type RefiningJob } from "@/lib/refining-jobs";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import RefiningBoard from "./components/refining-board";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "Raffinage",
  description:
    "Tableau de bord du raffinage de minerais dans Star Citizen. Suivez vos jobs de raffinage en cours et optimisez votre production.",
  openGraph: {
    title: "Raffinage — Nexus Tools",
    description:
      "Gérez vos jobs de raffinage de minerais Star Citizen depuis votre tableau de bord Nexus.",
    url: "https://tools.services.nexus/industry/refine",
  },
};

/** L'heure du rendu, que le tableau reprend pour son premier affichage. */
function renderedAt() {
  return Date.now();
}

export default async function RefinePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const t = await getTranslations("Refining");

  let jobs: RefiningJob[] = [];
  if (session?.user?.id) {
    jobs = await listRefiningJobs(session.user.id);
  }

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
        <p className="mt-1 max-w-3xl text-sm text-[#A9BFD0]">
          {t("description")}
        </p>
      </div>

      {session ? (
        <RefiningBoard jobs={jobs} now={renderedAt()} />
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-[#9ED0FF]/25 p-6 text-center">
          <p className="mb-4 text-[#C9E4FF]">{t("pleaseLogIn")}</p>
          <Link
            href="/login"
            className="font-medium text-[#9ED0FF] hover:text-[#CCE7FF]"
          >
            {t("logIn")}
          </Link>
        </div>
      )}
    </div>
  );
}
