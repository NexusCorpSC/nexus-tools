import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { listPendingContributions } from "@/lib/contributions";
import { hasPermission } from "@/lib/permissions";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";
import { ReviewQueue } from "./review-queue";
import { ModerationTabs } from "./moderation-tabs";

export const metadata: Metadata = {
  title: "Admin — Contributions",
  description: "Relecture des contributions de la communauté.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminContributionsPage() {
  // Le layout d'admin ne suffit pas : une navigation peut ne rendre que la
  // page. Même contrôle que les actions de relecture.
  if (!(await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION))) notFound();

  const t = await getTranslations("Contributions.Admin");
  const { items, total } = await listPendingContributions();

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
        <ModerationTabs current="queue" />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#CCE7FF]">{t("title")}</h1>
            <p className="mt-1 text-[#9ED0FF]/70">
              {total > 0 ? t("header", { count: total }) : t("headerEmpty")}
            </p>
            {total > 0 && (
              <p className="mt-1 text-xs text-[#9ED0FF]/55">{t("shortcuts")}</p>
            )}
          </div>
        </div>

        <ReviewQueue items={items} total={total} />

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">{t("backToAdmin")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
