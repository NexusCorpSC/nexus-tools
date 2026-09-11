import { getTranslations } from "next-intl/server";
import { ImageCover } from "@/components/image-cover";
import { KIND_ACCENT } from "@/lib/item-accents";
import type { ItemDetails } from "@/types/items";
import { ItemAdminMenu } from "../components";
import { ItemCompareButton } from "../compare-button";
import {
  CommonSections,
  ItemBreadcrumb,
  SectionTitle,
  StatisticsGrid,
} from "../sections";

/**
 * The fiche every object falls back to: the shared skeleton, with nothing
 * kind-specific to show.
 */
export async function StandardView({
  item,
  canEdit,
}: {
  item: ItemDetails;
  canEdit: boolean;
}) {
  const t = await getTranslations("Items");

  return (
    <div className="m-2 mx-auto max-w-4xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <ItemBreadcrumb name={item.name} />

      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block rounded bg-indigo-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {t(`kinds.${item.kind}`)}
            </span>
            <span className="text-xs text-nexus">
              {[item.category, item.subcategory].filter(Boolean).join(" › ")}
            </span>
          </div>
          <h1 className="text-3xl font-bold">{item.name}</h1>
          {item.variantName && (
            <p className="text-sm text-nexus">
              {t("variantLabel", { variant: item.variantName })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ItemCompareButton item={item} accent={KIND_ACCENT[item.kind]} />
          {canEdit && <ItemAdminMenu slug={item.slug} />}
        </div>
      </div>

      <div className="relative flex min-h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-[#9ED0FF]/15">
        <ImageCover imageUrl={item.imageUrl} name={item.name} priority />
      </div>

      {item.description && (
        <div>
          <SectionTitle>{t("description")}</SectionTitle>
          <p className="prose prose-invert whitespace-pre-line leading-relaxed">
            {item.description}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-6">
        {item.manufacturer && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t("manufacturer")}
            </span>
            <p className="mt-0.5 font-medium">{item.manufacturer}</p>
          </div>
        )}
        {typeof item.tier === "number" && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t("tier")}
            </span>
            <p className="mt-0.5 font-medium">{item.tier}</p>
          </div>
        )}
        {typeof item.size === "number" && (
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t("size")}
            </span>
            <p className="mt-0.5 font-medium">S{item.size}</p>
          </div>
        )}
      </div>

      {item.statistics && Object.keys(item.statistics).length > 0 && (
        <div>
          <SectionTitle>{t("statistics")}</SectionTitle>
          <StatisticsGrid statistics={item.statistics} />
        </div>
      )}

      <CommonSections item={item} canEdit={canEdit} />
    </div>
  );
}
