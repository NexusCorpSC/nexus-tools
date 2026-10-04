import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ItemForm } from "@/app/admin/items/components/item-form";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import { ItemBreadcrumb } from "../[slug]/sections";
import { DIRECT_EDIT_LEVEL, POINTS } from "@/types/contributions";
import type { Item } from "@/types/items";

export const metadata: Metadata = {
  title: "Proposer un objet",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Proposer un objet qui manque au catalogue. Le doublon se détecte par le nom,
 * qui fait l'adresse de la fiche.
 */
export default async function ProposeItemPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const { userId, standing } = await requireContributor(
    `/items/proposer${c ? `?c=${c}` : ""}`,
  );

  const resumed = await resumableContribution(c, userId, "itemCreate");
  const t = await getTranslations("Contributions.Form");

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <ItemBreadcrumb name={t("newItemCrumb")} />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("newItemTitle")}</h1>
        <ContributionNotice
          standing={standing}
          direct={standing.level >= DIRECT_EDIT_LEVEL}
          points={POINTS.itemCreate}
          resumed={resumed}
        />
        <p className="text-sm text-muted-foreground">{t("newItemHint")}</p>
      </div>

      <ItemForm
        contribution={{
          mode: "create",
          canRename: true,
          contributionId: resumed?.id,
          initial: resumed?.proposal as Partial<Item> | undefined,
          source: resumed?.source,
          gameVersion: resumed?.gameVersion,
        }}
      />
    </div>
  );
}
