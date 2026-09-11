import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ImageCover } from "@/components/image-cover";
import { getItemDetails } from "@/lib/items";
import { hasPermission } from "@/lib/permissions";
import {
  ITEMS_EDIT_PERMISSION,
  type ItemBlueprintLink,
  type ItemSummary,
} from "@/types/items";
import { ItemAdminMenu } from "./components";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getItemDetails(slug);

  if (!item) {
    return { title: "Objet introuvable" };
  }

  const description =
    item.description?.slice(0, 160) ??
    `${item.name} — ${[item.category, item.subcategory].filter(Boolean).join(" › ")}`;

  return {
    title: item.name,
    description,
    openGraph: {
      title: `${item.name} — Objets Nexus Tools`,
      description,
      url: `https://tools.services.nexus/items/${item.slug}`,
      images: item.imageUrl ? [{ url: item.imageUrl, alt: item.name }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: `${item.name} — Objets Nexus Tools`,
      description,
      images: item.imageUrl ? [item.imageUrl] : [],
    },
  };
}

/** A sibling item, in the variants list or in the set list. */
function RelatedItemCard({
  item,
  isCurrent,
  currentLabel,
}: {
  item: ItemSummary;
  isCurrent: boolean;
  currentLabel: string;
}) {
  const subtitle = item.variantName ?? item.subcategory ?? item.category;

  const content = (
    <>
      <div className="size-12 shrink-0 rounded-md bg-muted overflow-hidden flex items-center justify-center">
        <ImageCover
          imageUrl={item.imageUrl}
          name={item.name}
          width={96}
          height={96}
          className="h-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{item.name}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>
      {isCurrent && (
        <span className="ml-auto shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
          {currentLabel}
        </span>
      )}
    </>
  );

  if (isCurrent) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-primary/50 bg-primary/5 p-2.5">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/items/${item.slug}`}
      className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:border-primary/40 hover:bg-white/5 transition-colors"
    >
      {content}
    </Link>
  );
}

function BlueprintCard({ blueprint }: { blueprint: ItemBlueprintLink }) {
  return (
    <Link
      href={`/crafting/blueprints/${blueprint.slug}`}
      className="flex items-center gap-3 rounded-lg border border-border p-2.5 hover:border-primary/40 hover:bg-white/5 transition-colors"
    >
      <div className="size-12 shrink-0 rounded-md bg-muted overflow-hidden flex items-center justify-center">
        <ImageCover
          imageUrl={
            blueprint.imageUrl ??
            `https://gwgsmex5adyadzri.public.blob.vercel-storage.com/blueprints/images/${blueprint.slug}.jpg`
          }
          name={blueprint.name}
          width={96}
          height={96}
          className="h-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{blueprint.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {[blueprint.category, blueprint.subcategory]
            .filter(Boolean)
            .join(" › ")}
          {typeof blueprint.tier === "number" && blueprint.tier > 0
            ? ` · T${blueprint.tier}`
            : ""}
        </p>
      </div>
    </Link>
  );
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations("Items");
  const { slug } = await params;
  const item = await getItemDetails(slug);

  if (!item) {
    return (
      <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold mb-4">{t("notFound")}</h1>
        <Button asChild variant="outline">
          <Link href="/items">{t("backToItems")}</Link>
        </Button>
      </div>
    );
  }

  const canEdit = await hasPermission(ITEMS_EDIT_PERMISSION);

  return (
    <div className="m-2 mx-auto max-w-4xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/items">{t("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{item.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block text-xs font-semibold uppercase tracking-wide text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
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
        {canEdit && <ItemAdminMenu slug={item.slug} />}
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-[#9ED0FF]/15 flex items-center justify-center min-h-24">
        <ImageCover imageUrl={item.imageUrl} name={item.name} priority />
      </div>

      {item.description && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-1">
            {t("description")}
          </h2>
          <p className="leading-relaxed prose prose-invert whitespace-pre-line">
            {item.description}
          </p>
        </div>
      )}

      {item.obtention && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-1">
            {t("obtention")}
          </h2>
          <p className="prose prose-invert leading-relaxed whitespace-pre-line">
            {item.obtention}
          </p>
        </div>
      )}

      {/* Manufacturer, tier & size */}
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

      {/* Statistics */}
      {item.statistics && Object.keys(item.statistics).length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">
            {t("statistics")}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(item.statistics).map(([name, stat]) => (
              <div
                key={name}
                className="rounded-lg border border-[#9ED0FF]/15 bg-white/5 px-3 py-2"
              >
                <p className="text-xs text-nexus">{name}</p>
                <p className="text-sm font-semibold">
                  {stat.value}
                  {stat.unit ? ` ${stat.unit}` : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blueprints crafting this item */}
      {item.blueprints.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">
            {t("blueprintsTitle")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.blueprints.map((blueprint) => (
              <BlueprintCard key={blueprint.slug} blueprint={blueprint} />
            ))}
          </div>
          {item.blueprintsInferred && (
            <p className="mt-2 text-xs text-nexus">{t("blueprintsInferred")}</p>
          )}
        </div>
      )}

      {/* Variants (styles) of the same object */}
      {item.variants.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">
            {t("variantsTitle", { count: item.variants.length })}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.variants.map((variant) => (
              <RelatedItemCard
                key={variant.slug}
                item={variant}
                isCurrent={variant.slug === item.slug}
                currentLabel={t("currentItem")}
              />
            ))}
          </div>
        </div>
      )}

      {/* Set this object belongs to */}
      {item.setItems.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-2">
            {item.setName
              ? t("setTitleNamed", { set: item.setName })
              : t("setTitle")}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.setItems.map((piece) => (
              <RelatedItemCard
                key={piece.slug}
                item={piece}
                isCurrent={piece.slug === item.slug}
                currentLabel={t("currentItem")}
              />
            ))}
          </div>
        </div>
      )}

      <Button asChild variant="outline">
        <Link href="/items">{t("backToItems")}</Link>
      </Button>
    </div>
  );
}
