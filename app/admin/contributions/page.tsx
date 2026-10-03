import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { listPendingContributions } from "@/lib/contributions";
import { ReviewQueue } from "./review-queue";

export const metadata: Metadata = {
  title: "Admin — Contributions",
  description: "Relecture des contributions de la communauté.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminContributionsPage() {
  const t = await getTranslations("Contributions.Admin");
  const { items, total } = await listPendingContributions();

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-6xl space-y-6 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
        <div>
          <h1 className="text-2xl font-bold text-[#CCE7FF]">{t("title")}</h1>
          <p className="mt-1 text-[#9ED0FF]/70">
            {total > 0 ? t("header", { count: total }) : t("headerEmpty")}
          </p>
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
