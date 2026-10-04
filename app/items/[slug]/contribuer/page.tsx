import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getItemDetails } from "@/lib/items";
import { ItemForm } from "@/app/admin/items/components/item-form";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  openEditOn,
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import { ItemBreadcrumb } from "../sections";
import { DIRECT_EDIT_LEVEL, POINTS, RENAME_LEVEL } from "@/types/contributions";
import type { Item } from "@/types/items";

export const metadata: Metadata = {
  title: "Compléter un objet",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Compléter ou corriger un objet. Le formulaire est celui de l'admin, en mode
 * contribution ; `?c=` reprend une proposition encore ouverte.
 */
export default async function ContributeItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug } = await params;
  const { c } = await searchParams;
  const { userId, standing } = await requireContributor(
    `/items/${slug}/contribuer${c ? `?c=${c}` : ""}`,
  );

  const item = await getItemDetails(slug);
  if (!item) notFound();

  // Un lien `?c=` périmé (publiée, refusée) retombe sur la correction encore
  // ouverte, s'il y en a une : sinon l'envoi la remplacerait à l'aveugle.
  const resumed =
    (await resumableContribution(c, userId, "itemEdit", slug)) ??
    (await openEditOn(userId, "itemEdit", slug));
  const t = await getTranslations("Contributions.Form");

  return (
    <div className="m-2 mx-auto max-w-3xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <ItemBreadcrumb name={item.name} />
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {t("editItemTitle", { name: item.name })}
        </h1>
        <ContributionNotice
          standing={standing}
          direct={standing.level >= DIRECT_EDIT_LEVEL}
          resumed={resumed}
        />
        <p className="text-sm text-muted-foreground">
          {t("itemPointsHint", {
            section: POINTS.section,
            edit: POINTS.edit,
          })}
        </p>
      </div>

      <ItemForm
        item={item}
        blueprints={item.blueprintsInferred ? [] : item.blueprints}
        contribution={{
          mode: "edit",
          canRename: standing.level >= RENAME_LEVEL,
          contributionId: resumed?.id,
          initial: resumed?.proposal as Partial<Item> | undefined,
          source: resumed?.source,
          gameVersion: resumed?.gameVersion,
        }}
      />

      <p className="text-xs text-muted-foreground">
        <Link href={`/items/${item.slug}`} className="text-nexus underline">
          {t("backToItem")}
        </Link>
      </p>
    </div>
  );
}
