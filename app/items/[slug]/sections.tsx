import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { ImageCover } from "@/components/image-cover";
import { cn } from "@/lib/utils";
import {
  isNumber,
  type ItemBlueprintLink,
  type ItemDetails,
  type ItemKind,
  type ItemStatistics,
  type ItemSummary,
  type ResolvedItemSlot,
} from "@/types/items";

/** Accent carried by each kind of fiche, so the sections follow their page. */
export const KIND_ACCENT: Record<ItemKind, string> = {
  item: "#9ED0FF",
  vehicle: "#7FD4FF",
  weapon: "#E8472B",
  resource: "#D9A441",
};

export async function ItemBreadcrumb({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const t = await getTranslations("Items");

  return (
    <nav
      aria-label="breadcrumb"
      className={cn("flex items-center gap-2 text-sm text-nexus/70", className)}
    >
      <Link href="/" className="hover:text-nexus-primary">
        {t("home")}
      </Link>
      <span aria-hidden>›</span>
      <Link href="/items" className="hover:text-nexus-primary">
        {t("title")}
      </Link>
      <span aria-hidden>›</span>
      <span className="text-nexus">{name}</span>
    </nav>
  );
}

export function SectionTitle({
  children,
  aside,
  className,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-baseline gap-3", className)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-nexus-primary">
        {children}
      </h2>
      <span className="h-px flex-1 bg-[#9ED0FF]/15" />
      {aside && <span className="text-xs text-nexus">{aside}</span>}
    </div>
  );
}

/**
 * What a section shows while nobody has filled it in. Deliberately an invite
 * rather than a blank: an editor gets the link that fills it, everyone else is
 * told the data is missing instead of being left to wonder.
 */
export async function EmptySection({
  label,
  slug,
  canEdit,
  sharp,
}: {
  label: string;
  slug: string;
  canEdit: boolean;
  sharp?: boolean;
}) {
  const t = await getTranslations("Items.Empty");

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 border border-dashed border-[#9ED0FF]/25 px-4 py-3 text-sm text-nexus/70",
        sharp ? "clip-notch" : "rounded-lg",
      )}
    >
      <span>{label}</span>
      {canEdit && (
        <Link
          href={`/admin/items/${slug}/edit`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <PencilSquareIcon className="size-3.5" />
          {t("fill")}
        </Link>
      )}
    </div>
  );
}

/**
 * What a whole fiche shows when its kind-specific block was never filled in —
 * one notice for the lot, instead of a page of empty sections.
 */
export async function KindDataNotice({
  kind,
  slug,
  canEdit,
  sharp,
}: {
  kind: ItemKind;
  slug: string;
  canEdit: boolean;
  sharp?: boolean;
}) {
  const t = await getTranslations("Items.Empty");

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-3 border border-dashed border-[#9ED0FF]/25 bg-white/[0.02] p-6",
        sharp ? "clip-notch" : "rounded-xl",
      )}
    >
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="size-5 text-nexus/60" />
        <h2 className="text-sm font-semibold uppercase tracking-wide text-nexus-primary">
          {t(`${kind}.title`)}
        </h2>
      </div>
      <p className="max-w-prose text-sm leading-relaxed text-nexus/75">
        {t(`${kind}.description`)}
      </p>
      <p className="text-sm text-nexus/60">
        {canEdit ? t("editorHint") : t("visitorHint")}
      </p>
      {canEdit && (
        <Link
          href={`/admin/items/${slug}/edit`}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <PencilSquareIcon className="size-4" />
          {t(`${kind}.cta`)}
        </Link>
      )}
    </div>
  );
}

export function StatisticsGrid({
  statistics,
  columns = 3,
}: {
  statistics: ItemStatistics;
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        "grid gap-2",
        columns === 3
          ? "grid-cols-2 sm:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2",
      )}
    >
      {Object.entries(statistics).map(([name, stat]) => (
        <div
          key={name}
          className="rounded-lg border border-[#9ED0FF]/15 bg-white/5 px-3 py-2"
        >
          <p className="text-xs text-nexus/70">{name}</p>
          <p className="font-mono text-sm font-semibold text-nexus-primary">
            {stat.value}
            {stat.unit ? ` ${stat.unit}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

/** A figure of the headline strip: rendered only when it has a value. */
export function KeyFigure({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="border-r border-[#9ED0FF]/12 px-6 py-4 last:border-r-0">
      <p className="text-[11px] uppercase tracking-wide text-nexus/60">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-semibold text-nexus-primary">
        {value}
        {unit && <span className="text-[13px] text-nexus/70"> {unit}</span>}
      </p>
    </div>
  );
}

/**
 * One mounted slot: the object it carries links to its own fiche when the
 * catalogue knows it, and an empty slot stays visible rather than disappearing.
 */
export function SlotRow({
  slot,
  accent,
  sharp,
  emptyLabel,
  index,
}: {
  slot: ResolvedItemSlot;
  accent: string;
  sharp?: boolean;
  emptyLabel: string;
  index?: number;
}) {
  const mountedName = slot.mounted?.name ?? slot.itemName;
  const detail = [
    slot.quantity && mountedName ? `${slot.quantity} × ${mountedName}` : null,
    !slot.quantity ? mountedName : null,
    slot.note,
  ]
    .filter(Boolean)
    .join(" · ");

  const body = (
    <>
      {index !== undefined && (
        <span
          className="w-5 shrink-0 font-mono text-[13px]"
          style={{ color: mountedName ? accent : undefined }}
        >
          {index}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            mountedName ? "text-nexus-primary" : "text-nexus-primary/55",
          )}
        >
          {slot.label}
        </span>
        <span className="block truncate text-xs text-nexus/70">
          {detail || emptyLabel}
        </span>
      </span>
      {isNumber(slot.size) && (
        <span className="shrink-0 rounded-full border border-[#9ED0FF]/25 px-2 py-0.5 font-mono text-xs text-nexus/80">
          S{slot.size}
        </span>
      )}
    </>
  );

  const className = cn(
    "flex items-center gap-3 border px-3.5 py-3",
    sharp ? "clip-notch" : "rounded-lg",
    mountedName
      ? "border-[#9ED0FF]/15 bg-white/[0.03]"
      : "border-dashed border-[#9ED0FF]/20",
    slot.mounted && "hover:border-primary/40 hover:bg-white/[0.06]",
  );

  return slot.mounted ? (
    <Link href={`/items/${slot.mounted.slug}`} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function BlueprintCard({
  blueprint,
  quantityLabel,
}: {
  blueprint: ItemBlueprintLink;
  quantityLabel?: string;
}) {
  return (
    <Link
      href={`/crafting/blueprints/${blueprint.slug}`}
      className="flex items-center gap-3 rounded-lg border border-[#9ED0FF]/15 p-2.5 transition-colors hover:border-primary/40 hover:bg-white/5"
    >
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
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
        <p className="truncate text-sm font-semibold text-nexus-primary">
          {blueprint.name}
        </p>
        <p className="truncate text-xs text-nexus/70">
          {[blueprint.category, blueprint.subcategory]
            .filter(Boolean)
            .join(" › ")}
          {typeof blueprint.tier === "number" && blueprint.tier > 0
            ? ` · T${blueprint.tier}`
            : ""}
          {quantityLabel ? ` · ${quantityLabel}` : ""}
        </p>
      </div>
    </Link>
  );
}

export function RelatedItemCard({
  item,
  isCurrent,
  currentLabel,
  accent,
}: {
  item: ItemSummary;
  isCurrent: boolean;
  currentLabel: string;
  accent: string;
}) {
  const subtitle = item.variantName ?? item.subcategory ?? item.category;

  const content = (
    <>
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
        <ImageCover
          imageUrl={item.imageUrl}
          name={item.name}
          width={96}
          height={96}
          className="h-full object-cover"
        />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-nexus-primary">
          {item.name}
        </p>
        {subtitle && (
          <p className="truncate text-xs text-nexus/70">{subtitle}</p>
        )}
      </div>
      {isCurrent && (
        <span
          className="ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
          style={{ color: accent, backgroundColor: `${accent}22` }}
        >
          {currentLabel}
        </span>
      )}
    </>
  );

  if (isCurrent) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border p-2.5"
        style={{ borderColor: accent, backgroundColor: `${accent}0F` }}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={`/items/${item.slug}`}
      className="flex items-center gap-3 rounded-lg border border-[#9ED0FF]/15 p-2.5 transition-colors hover:border-primary/40 hover:bg-white/5"
    >
      {content}
    </Link>
  );
}

/**
 * The sections every fiche ends with, whatever its kind: what crafts it, what
 * it is crafted into, its variants and its set.
 */
export async function CommonSections({
  item,
  canEdit,
}: {
  item: ItemDetails;
  canEdit: boolean;
}) {
  const t = await getTranslations("Items");
  const accent = KIND_ACCENT[item.kind];

  return (
    <>
      {item.blueprints.length > 0 && (
        <div>
          <SectionTitle>{t("blueprintsTitle")}</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.blueprints.map((blueprint) => (
              <BlueprintCard key={blueprint.slug} blueprint={blueprint} />
            ))}
          </div>
          {item.blueprintsInferred && (
            <p className="mt-2 text-xs text-nexus/70">
              {t("blueprintsInferred")}
            </p>
          )}
        </div>
      )}

      {item.kind !== "resource" && item.consumedBy.length > 0 && (
        <div>
          <SectionTitle>{t("consumedByTitle")}</SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.consumedBy.map((blueprint) => (
              <BlueprintCard
                key={blueprint.slug}
                blueprint={blueprint}
                quantityLabel={
                  blueprint.quantity
                    ? t("quantityUnits", { count: blueprint.quantity })
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}

      {item.variants.length > 0 && (
        <div>
          <SectionTitle>
            {t("variantsTitle", { count: item.variants.length })}
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.variants.map((variant) => (
              <RelatedItemCard
                key={variant.slug}
                item={variant}
                isCurrent={variant.slug === item.slug}
                currentLabel={t("currentItem")}
                accent={accent}
              />
            ))}
          </div>
        </div>
      )}

      {item.setItems.length > 0 && (
        <div>
          <SectionTitle>
            {item.setName
              ? t("setTitleNamed", { set: item.setName })
              : t("setTitle")}
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2">
            {item.setItems.map((piece) => (
              <RelatedItemCard
                key={piece.slug}
                item={piece}
                isCurrent={piece.slug === item.slug}
                currentLabel={t("currentItem")}
                accent={accent}
              />
            ))}
          </div>
        </div>
      )}

      {item.obtention && (
        <div>
          <SectionTitle>{t("obtention")}</SectionTitle>
          <p className="prose prose-invert whitespace-pre-line leading-relaxed">
            {item.obtention}
          </p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Link
          href="/items"
          className="inline-flex h-9 items-center rounded-md border border-[#9ED0FF]/30 px-4 text-sm font-medium text-nexus hover:bg-white/5"
        >
          {t("backToItems")}
        </Link>
        {canEdit && (
          <Link
            href={`/admin/items/${item.slug}/edit`}
            className="inline-flex h-9 items-center gap-1.5 px-2 text-sm text-nexus/70 hover:text-nexus-primary"
          >
            <PencilSquareIcon className="size-4" />
            {t("Admin.edit")}
          </Link>
        )}
      </div>
    </>
  );
}
