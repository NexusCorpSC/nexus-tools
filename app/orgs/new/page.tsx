import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { PointsChip } from "@/components/points-chip";
import { requireContributor } from "@/app/contributions/session";
import { countMyOrgs } from "@/lib/org-contributions";
import { MAX_ORGS_PER_ACCOUNT, POINTS } from "@/types/contributions";
import { NewOrgForm } from "./new-org-form";

export const metadata: Metadata = {
  title: "Nouvelle organisation",
  description: "Créez votre organisation Star Citizen sur Nexus Tools.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Tout joueur connecté crée une organisation, deux au plus. Elle sert ses
 * membres tout de suite, privée ; une fois validée par la modération, ses
 * éditeurs peuvent la rendre publique.
 */
export default async function NewOrgPage() {
  const { userId, standing } = await requireContributor("/orgs/new");
  const [t, created] = await Promise.all([
    getTranslations("NewOrganization"),
    countMyOrgs(userId),
  ]);
  const full = created >= MAX_ORGS_PER_ACCOUNT;

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-[#CCE7FF]/80">
          {t("intro", { max: MAX_ORGS_PER_ACCOUNT })}
        </p>
        <p className="text-sm text-[#CCE7FF]/80">
          {t("validationHint")} <PointsChip points={POINTS.orgCreate} />
        </p>
      </div>

      {standing.suspendedUntil ? (
        <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm">
          {t("suspended")}
        </p>
      ) : full ? (
        <div className="space-y-3">
          <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-sm">
            {t("limitReached", { max: MAX_ORGS_PER_ACCOUNT })}
          </p>
          <Button asChild variant="outline">
            <Link href="/orgs">{t("backToOrgs")}</Link>
          </Button>
        </div>
      ) : (
        <NewOrgForm remaining={MAX_ORGS_PER_ACCOUNT - created} />
      )}
    </div>
  );
}
