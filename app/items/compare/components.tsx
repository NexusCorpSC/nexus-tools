"use client";

import {
  useCallback,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowsRightLeftIcon,
  CheckIcon,
  EyeSlashIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { ImageCover } from "@/components/image-cover";
import { KIND_ACCENT } from "@/lib/item-accents";
import { cn } from "@/lib/utils";
import {
  MAX_COMPARE_ITEMS,
  isNumber,
  type ComparisonRow,
  type ComparisonValue,
  type ItemComparison,
  type ItemSummary,
} from "@/types/items";
import { PickerShell } from "../picker-shell";
import { useItemSearch } from "../use-item-search";
import { PHONE_QUERY, useMediaQuery } from "../use-media-query";

/** Largeur d'une colonne d'objet : la même partout, sinon rien ne s'aligne. */
const COLUMN_WIDTH = "w-60";

/**
 * Une teinte par objet, sur téléphone, où les colonnes n'ont plus la place
 * d'un nom au-dessus de chaque valeur : le point de couleur de la carte se
 * retrouve dans l'ordre des cellules. Des bleus aux roses seulement — le vert
 * et l'ambre disent déjà autre chose ailleurs sur le site.
 */
const COLUMN_HUES = [250, 300, 340, 200, 275];

/** Ce qu'une cellule a à dire, calculé une fois pour les deux mises en page. */
type Cell = {
  slug: string;
  value: ComparisonValue;
  isBest: boolean;
  isReference: boolean;
  delta: string | null;
  /** Longueur de la barre de proportion, en pourcentage ; 0 sans barre. */
  share: number;
};

function compareHref(slugs: string[]): string {
  return `/items/compare?ids=${slugs.join(",")}`;
}

/**
 * Le sélecteur d'une colonne supplémentaire. Il cherche dans tout le type
 * comparé — pas seulement dans la catégorie de départ — pour qu'on puisse
 * confronter deux objets qui ne se rangent pas au même endroit du catalogue.
 */
function ItemSearch({
  kind,
  category,
  excluded,
  onPick,
  emptyQueryHint,
}: {
  kind: string;
  category?: string;
  excluded: string[];
  onPick: (item: ItemSummary) => void;
  emptyQueryHint: string;
}) {
  const t = useTranslations("Items.Compare");
  const [query, setQuery] = useState("");
  const { results, isLoading } = useItemSearch({ kind, category, query });

  const candidates = results.filter((item) => !excluded.includes(item.slug));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative shrink-0">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none max-sm:h-11 max-sm:text-base"
        />
      </div>

      {/* La seule chose qui défile : la liste, jamais le contenant. */}
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
        {candidates.map((item) => (
          <button
            key={item.slug}
            type="button"
            onClick={() => onPick(item)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-[#9ED0FF]/15 bg-white/[0.02] p-2 text-left transition-colors hover:border-primary/40 hover:bg-white/[0.06] max-sm:min-h-14"
          >
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
              <ImageCover
                imageUrl={item.imageUrl}
                name={item.name}
                width={72}
                height={72}
                className="h-full object-cover"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-nexus-primary">
                {item.name}
              </span>
              <span className="block truncate text-xs text-nexus/65">
                {[item.category, item.subcategory].filter(Boolean).join(" › ")}
              </span>
            </span>
            <PlusIcon className="size-4 shrink-0 text-primary" />
          </button>
        ))}

        {candidates.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-nexus/65">
            {isLoading ? t("searchLoading") : t("searchEmpty")}
          </p>
        )}
      </div>

      <p className="shrink-0 text-xs leading-relaxed text-nexus/55">
        {emptyQueryHint}
      </p>
    </div>
  );
}

export function ComparisonBoard({
  comparison,
}: {
  comparison: ItemComparison;
}) {
  const t = useTranslations("Items.Compare");
  const tItems = useTranslations("Items");
  const format = useFormatter();
  const router = useRouter();

  const serverSlugs = useMemo(
    () => comparison.items.map((item) => item.slug),
    [comparison.items],
  );

  // Retirer une colonne se voit tout de suite, pendant que l'URL — qui fait
  // autorité — rattrape l'écran.
  const [slugs, removeOptimistically] = useOptimistic(
    serverSlugs,
    (current: string[], removed: string) =>
      current.filter((slug) => slug !== removed),
  );
  const [, startTransition] = useTransition();

  const [referenceSlug, setReferenceSlug] = useState<string>("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [highlightBest, setHighlightBest] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(serverSlugs.length < 2);
  const [copied, setCopied] = useState(false);

  const columns = useMemo(
    () =>
      slugs
        .map((slug) => ({
          slug,
          index: comparison.items.findIndex((item) => item.slug === slug),
        }))
        .filter((column) => column.index >= 0)
        .map((column) => ({
          ...column,
          item: comparison.items[column.index],
        })),
    [slugs, comparison.items],
  );

  // La référence choisie tombe d'elle-même sur la première colonne quand
  // l'objet qui la portait quitte la comparaison : rien à resynchroniser.
  const referenceColumn =
    columns.find((column) => column.slug === referenceSlug) ?? columns[0];
  const accent = KIND_ACCENT[comparison.kind];
  const isFull = columns.length >= MAX_COMPARE_ITEMS;

  const removeColumn = useCallback(
    (slug: string) => {
      const next = slugs.filter((entry) => entry !== slug);
      if (next.length === 0) return;
      startTransition(() => {
        removeOptimistically(slug);
        router.replace(compareHref(next), { scroll: false });
      });
    },
    [slugs, removeOptimistically, startTransition, router],
  );

  const addColumn = useCallback(
    (item: ItemSummary) => {
      setPickerOpen(false);
      router.push(compareHref([...slugs, item.slug]));
    },
    [slugs, router],
  );

  const copyLink = useCallback(() => {
    navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {});
  }, []);

  const formatValue = (value: ComparisonValue, unit?: string) => {
    if (value === null) return t("missing");
    const text = isNumber(value)
      ? format.number(value, { maximumFractionDigits: 2 })
      : String(value);
    return unit ? `${text} ${unit}` : text;
  };

  /**
   * L'écart se lit toujours face à la colonne de référence. « identique »
   * dit une égalité stricte — jamais un pourcentage qui a fini par arrondir
   * à zéro, sans quoi une cellule pourrait être « identique » et gagnante.
   */
  const formatDelta = (
    row: ComparisonRow,
    value: ComparisonValue,
    reference: ComparisonValue,
    isReference: boolean,
  ): string | null => {
    if (isReference) return t("reference");
    if (value === null) return t("missing");
    if (value === reference) return t("identical");
    if (!row.delta || !isNumber(value)) return null;
    if (reference === null) return t("referenceMissing");
    if (!isNumber(reference)) return null;

    if (row.delta === "abs") {
      const diff = value - reference;
      return `${diff > 0 ? "+" : "−"}${format.number(Math.abs(diff), {
        maximumFractionDigits: 2,
      })}`;
    }

    if (reference === 0) return null;
    const pct = ((value - reference) / Math.abs(reference)) * 100;
    return `${pct > 0 ? "+" : "−"}${format.number(Math.abs(pct), {
      maximumFractionDigits: Math.abs(pct) >= 10 ? 0 : 1,
    })} %`;
  };

  // Une ligne dont toutes les colonnes disent la même chose — la même valeur,
  // ou rien du tout — n'apporte aucun écart à lire.
  const isIdentical = (row: ComparisonRow) => {
    const values = columns.map((column) => row.values[column.index]);
    return values.every((value) => value === values[0]);
  };

  const groups = comparison.groups
    .map((group) => ({
      key: group.key,
      rows: onlyDiff
        ? group.rows.filter((row) => !isIdentical(row))
        : group.rows,
    }))
    .filter((group) => group.rows.length > 0);

  const hiddenRows = onlyDiff
    ? comparison.groups.reduce(
        (count, group) => count + group.rows.filter(isIdentical).length,
        0,
      )
    : 0;

  const rowLabel = (row: ComparisonRow) =>
    row.labelKey ? t(`rows.${row.labelKey}`) : (row.label ?? row.key);

  const cellValue = (row: ComparisonRow, index: number): ComparisonValue => {
    const value = row.values[index];
    if (value !== null && row.translateValues) return t(`values.${value}`);
    return value;
  };

  const cellsOf = (row: ComparisonRow): Cell[] => {
    const values = columns.map((column) => cellValue(row, column.index));
    const numbers = values.filter(isNumber);
    const distinct = new Set(numbers).size > 1;
    const best =
      highlightBest && row.direction && distinct
        ? row.direction > 0
          ? Math.max(...numbers)
          : Math.min(...numbers)
        : null;
    const scale = row.bar ? Math.max(...numbers.map(Math.abs), 0) : 0;
    const reference = referenceColumn
      ? cellValue(row, referenceColumn.index)
      : null;

    return columns.map((column, position) => {
      const value = values[position];
      const isReference = column.slug === referenceColumn?.slug;
      return {
        slug: column.slug,
        value,
        isBest: best !== null && value === best,
        isReference,
        delta: formatDelta(row, value, reference, isReference),
        share:
          scale > 0 && isNumber(value)
            ? Math.max(4, (Math.abs(value) / scale) * 100)
            : 0,
      };
    });
  };

  const rendered = groups.map((group) => ({
    key: group.key,
    rows: group.rows.map((row) => ({ row, cells: cellsOf(row) })),
  }));

  /*
   * Sur téléphone, le tableau à colonnes cède la place à une grille par
   * caractéristique. Les deux sont rendues et c'est la feuille de style qui
   * choisit (`sm:hidden` / `hidden sm:block`), pour que le premier rendu —
   * celui du serveur — soit déjà le bon : un tableau qui déborde le temps de
   * l'hydratation, puis saute, serait exactement le défaut qu'on corrige.
   *
   * Le sélecteur, lui, est porté par les deux mises en page ; seule celle qui
   * est affichée peut l'ouvrir, sans quoi les deux s'ouvriraient ensemble.
   */
  const phone = useMediaQuery(PHONE_QUERY);

  const picker = (
    trigger: React.ReactNode,
    className: string,
    layout: "phone" | "desktop",
  ) => (
    <PickerShell
      open={pickerOpen && (layout === "phone") === phone}
      onOpenChange={setPickerOpen}
      title={t("addColumn")}
      align="end"
      className={className}
      trigger={trigger}
    >
      <p className="mb-2 shrink-0 text-[11px] font-semibold uppercase tracking-wider text-nexus-primary">
        {t("addColumn")}
      </p>
      <ItemSearch
        kind={comparison.kind}
        category={comparison.category}
        excluded={slugs}
        onPick={addColumn}
        emptyQueryHint={t("sameKindOnly", {
          kind: tItems(`kinds.${comparison.kind}`),
        })}
      />
    </PickerShell>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-nexus">
            {t("subtitle", { kind: tItems(`kinds.${comparison.kind}`) })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyLink}>
            {copied ? (
              <CheckIcon className="size-4" />
            ) : (
              <LinkIcon className="size-4" />
            )}
            {copied ? t("linkCopied") : t("copyLink")}
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-nexus/75">
            <Link href="/items">{t("backToCatalogue")}</Link>
          </Button>
        </div>
      </div>

      {comparison.rejected.length > 0 && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-nexus">
          {t("rejected", {
            count: comparison.rejected.length,
            names: comparison.rejected.map((item) => item.name).join(", "),
          })}
        </p>
      )}

      {comparison.missing.length > 0 && (
        <p className="rounded-lg border border-dashed border-[#9ED0FF]/25 px-4 py-2.5 text-sm text-nexus/70">
          {t("missingItems", {
            count: comparison.missing.length,
            slugs: comparison.missing.join(", "),
          })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-[#9ED0FF]/15 bg-white/[0.025] px-4 py-3">
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#0B2030]"
          style={{ backgroundColor: accent }}
        >
          {tItems(`kinds.${comparison.kind}`)}
        </span>
        <span className="text-sm text-nexus/75">
          {t("columnsCount", {
            count: columns.length,
            max: MAX_COMPARE_ITEMS,
          })}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <ToggleChip
            active={onlyDiff}
            onClick={() => setOnlyDiff((value) => !value)}
            label={t("onlyDifferences")}
          />
          <ToggleChip
            active={highlightBest}
            onClick={() => setHighlightBest((value) => !value)}
            label={t("highlightBest")}
          />
        </div>
      </div>

      <div className="sm:hidden">
        <PhoneBoard
          columns={columns}
          referenceSlug={referenceColumn?.slug}
          accent={accent}
          rendered={rendered}
          hiddenRows={hiddenRows}
          rowLabel={rowLabel}
          formatValue={formatValue}
          onReference={setReferenceSlug}
          onRemove={removeColumn}
          picker={picker(
            <button
              type="button"
              disabled={isFull}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed text-xs font-medium transition-colors",
                isFull
                  ? "cursor-not-allowed border-[#9ED0FF]/15 text-nexus/35"
                  : "border-[#9ED0FF]/30 text-nexus/75 hover:border-primary/50 hover:bg-white/5",
              )}
            >
              <PlusIcon className="size-4" />
              {isFull ? t("limitReached") : t("addColumn")}
            </button>,
            "w-88",
            "phone",
          )}
        />
      </div>

      <div className="hidden rounded-xl border border-[#9ED0FF]/15 bg-[#0B3856] sm:block">
        <div className="overflow-x-auto p-4">
          <div className="min-w-full" style={{ width: "max-content" }}>
            {/* En-têtes de colonnes */}
            <div className="flex items-stretch">
              <div className="sticky left-0 z-20 flex w-60 shrink-0 flex-col justify-end bg-[#0B3856] pr-4">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-nexus/60">
                  {t("characteristic")}
                </p>
                {referenceColumn && (
                  <p className="mb-2.5 mt-1 text-xs text-nexus/50">
                    {t.rich("deltaAgainst", {
                      name: referenceColumn.item.name,
                      ref: (chunks) => (
                        <span style={{ color: accent }}>{chunks}</span>
                      ),
                    })}
                  </p>
                )}
              </div>

              {columns.map((column) => {
                const isReference = column.slug === referenceColumn?.slug;
                return (
                  <div
                    key={column.slug}
                    className={cn("shrink-0 px-1.5", COLUMN_WIDTH)}
                  >
                    <div
                      className="flex h-full flex-col gap-2 rounded-xl border p-2.5"
                      style={{
                        borderColor: isReference
                          ? accent
                          : "rgba(158,208,255,0.15)",
                        backgroundColor: isReference
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div className="flex items-start gap-2.5">
                        <Link
                          href={`/items/${column.item.slug}`}
                          className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5"
                        >
                          <ImageCover
                            imageUrl={column.item.imageUrl}
                            name={column.item.name}
                            width={96}
                            height={96}
                            className="h-full object-cover"
                          />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/items/${column.item.slug}`}
                            className="block text-sm font-semibold leading-snug text-nexus-primary hover:underline"
                          >
                            {column.item.name}
                          </Link>
                          <p className="truncate text-xs text-nexus/60">
                            {column.item.manufacturer ??
                              column.item.subcategory ??
                              column.item.category}
                          </p>
                        </div>
                        {columns.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeColumn(column.slug)}
                            title={t("removeColumn")}
                            aria-label={t("removeColumn")}
                            className="rounded-md p-1 text-nexus/55 transition-colors hover:bg-white/10 hover:text-nexus"
                          >
                            <XMarkIcon className="size-3.5" />
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setReferenceSlug(column.slug)}
                        disabled={isReference}
                        className="inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] transition-colors disabled:cursor-default"
                        style={
                          isReference
                            ? {
                                backgroundColor: accent,
                                borderColor: accent,
                                color: "#0B2030",
                              }
                            : {
                                borderColor: "rgba(158,208,255,0.28)",
                                color: "rgba(201,228,255,0.7)",
                              }
                        }
                      >
                        {isReference ? t("isReference") : t("setReference")}
                      </button>
                    </div>
                  </div>
                );
              })}

              <div className="w-44 shrink-0 px-1.5">
                {picker(
                  <button
                    type="button"
                    disabled={isFull}
                    className={cn(
                      "flex h-full min-h-26 w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-2 text-center transition-colors",
                      isFull
                        ? "cursor-not-allowed border-[#9ED0FF]/15 text-nexus/35"
                        : "border-[#9ED0FF]/30 text-nexus/75 hover:border-primary/50 hover:bg-white/5",
                    )}
                  >
                    <PlusIcon className="size-5" />
                    <span className="text-xs font-medium leading-snug">
                      {isFull ? t("limitReached") : t("addColumn")}
                    </span>
                  </button>,
                  "w-88",
                  "desktop",
                )}
              </div>
            </div>

            {/* Lignes */}
            {rendered.map((group) => (
              <div key={group.key}>
                <div className="flex items-center gap-3 pb-1.5 pt-6">
                  <div className="sticky left-0 z-10 w-60 shrink-0 bg-[#0B3856]">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-nexus-primary">
                      {t(`groups.${group.key}`)}
                    </span>
                  </div>
                  <span className="h-px flex-1 bg-[#9ED0FF]/15" />
                </div>

                {group.rows.map(({ row, cells }) => {
                  return (
                    <div
                      key={row.key}
                      className="flex items-stretch border-t border-[#9ED0FF]/10"
                    >
                      <div className="sticky left-0 z-10 w-60 shrink-0 bg-[#0B3856] py-2.5 pr-4">
                        <p className="text-[13px] font-medium leading-snug text-nexus">
                          {rowLabel(row)}
                        </p>
                        {row.direction === -1 && (
                          <p className="mt-0.5 text-[11px] text-nexus/45">
                            {t("lowerIsBetter")}
                          </p>
                        )}
                      </div>

                      {cells.map(({ slug, value, isBest, delta, share }) => {
                        return (
                          <div
                            key={slug}
                            className={cn("shrink-0 p-1.5", COLUMN_WIDTH)}
                          >
                            <div
                              className="h-full rounded-lg border-l-2 px-2.5 py-1"
                              style={{
                                borderLeftColor: isBest
                                  ? accent
                                  : "transparent",
                                backgroundColor: isBest
                                  ? "rgba(255,255,255,0.06)"
                                  : "transparent",
                              }}
                            >
                              <p
                                className={cn(
                                  "font-mono text-[15px] font-semibold leading-snug",
                                  value === null
                                    ? "text-nexus/40"
                                    : isBest
                                      ? "text-[#F2F7FC]"
                                      : "text-nexus-primary",
                                )}
                              >
                                {formatValue(value, row.unit)}
                              </p>
                              <div className="mt-0.5 flex min-h-4 items-center gap-2">
                                {delta && (
                                  <span className="font-mono text-[11px] text-nexus/55">
                                    {delta}
                                  </span>
                                )}
                                {share > 0 && (
                                  <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                                    <span
                                      className="block h-full rounded-full"
                                      style={{
                                        width: `${share}%`,
                                        backgroundColor: isBest
                                          ? accent
                                          : "rgba(158,208,255,0.3)",
                                      }}
                                    />
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}

            {groups.length === 0 && (
              <p className="sticky left-0 w-[32rem] py-10 text-sm text-nexus/65">
                {t("noRows")}
              </p>
            )}

            {hiddenRows > 0 && (
              <p className="sticky left-0 mt-4 flex w-fit items-center gap-2 rounded-lg border border-dashed border-[#9ED0FF]/20 px-3 py-2 text-xs text-nexus/65">
                <EyeSlashIcon className="size-4 shrink-0" />
                {t("hiddenRows", { count: hiddenRows })}
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-nexus/55">
        <ArrowsRightLeftIcon className="size-3.5 shrink-0" />
        {t("shareHint")}
      </p>
    </div>
  );
}

/**
 * La grille par caractéristique, pour un écran de la largeur d'un téléphone.
 *
 * Le tableau à colonnes gardait une colonne de libellés de 240 px collée à
 * gauche et coupait les valeurs dans ce qui restait. Ici chaque caractéristique
 * prend une ligne entière : le libellé au-dessus, puis une cellule égale par
 * objet — tous visibles d'un coup, sans défilement horizontal. La bande des
 * objets reste collée en haut pendant qu'on défile, et le point de couleur de
 * chaque carte se retrouve dans l'ordre des cellules.
 */
function PhoneBoard({
  columns,
  referenceSlug,
  accent,
  rendered,
  hiddenRows,
  rowLabel,
  formatValue,
  onReference,
  onRemove,
  picker,
}: {
  columns: { slug: string; item: ItemSummary }[];
  referenceSlug: string | undefined;
  accent: string;
  rendered: {
    key: string;
    rows: { row: ComparisonRow; cells: Cell[] }[];
  }[];
  hiddenRows: number;
  rowLabel: (row: ComparisonRow) => string;
  formatValue: (value: ComparisonValue, unit?: string) => string;
  onReference: (slug: string) => void;
  onRemove: (slug: string) => void;
  picker: React.ReactNode;
}) {
  const t = useTranslations("Items.Compare");
  const gridStyle = {
    gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))`,
  };

  /*
   * À quatre objets et plus, une cellule fait moins de 80 px : plus la place
   * d'un nom au-dessus de chaque colonne, ni d'un nombre à 15 px. Les noms
   * passent alors dans une légende au-dessus — une pastille par objet, avec
   * son point de couleur et sa référence — et la bande collée ne garde que
   * les images ; les valeurs se resserrent et les mentions se raccourcissent.
   */
  const dense = columns.length >= 4;

  const hueOf = (index: number) => COLUMN_HUES[index % COLUMN_HUES.length];

  const pillStyle = (isReference: boolean) =>
    isReference
      ? { backgroundColor: accent, borderColor: accent, color: "#0B2030" }
      : {
          borderColor: "rgba(158,208,255,0.28)",
          color: "rgba(201,228,255,0.7)",
        };

  const deltaText = ({ isReference, delta }: Cell) => {
    if (!dense) return delta;
    if (isReference) return t("referenceShort");
    if (delta === t("identical")) return t("identicalShort");
    return delta;
  };

  return (
    <div className="rounded-xl border border-[#9ED0FF]/15 bg-[#0B3856] p-3">
      {dense && (
        <div className="mb-2.5 flex flex-wrap gap-1.5">
          {columns.map((column, index) => {
            const isReference = column.slug === referenceSlug;

            return (
              <span
                key={column.slug}
                className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border pl-2 pr-1"
                style={{
                  borderColor: isReference ? accent : "rgba(158,208,255,0.2)",
                  backgroundColor: isReference
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(255,255,255,0.02)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: `oklch(0.74 0.13 ${hueOf(index)})` }}
                />
                <button
                  type="button"
                  onClick={() => onReference(column.slug)}
                  disabled={isReference}
                  title={isReference ? t("isReference") : t("setReference")}
                  className="min-w-0 truncate text-xs font-semibold text-nexus-primary disabled:cursor-default"
                >
                  {column.item.name}
                </button>
                {isReference && (
                  <span
                    className="shrink-0 rounded-full border px-1.5 text-[9px] font-bold uppercase tracking-[0.08em]"
                    style={pillStyle(true)}
                  >
                    {t("referenceShort")}
                  </span>
                )}
                {columns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(column.slug)}
                    title={t("removeColumn")}
                    aria-label={t("removeColumn")}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full text-nexus/55 transition-colors hover:bg-white/10 hover:text-nexus"
                  >
                    <XMarkIcon className="size-3.5" />
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      <div
        className="sticky top-0 z-10 -mx-3 grid gap-1.5 bg-[#0B3856] px-3 pb-2.5"
        style={gridStyle}
      >
        {columns.map((column, index) => {
          const isReference = column.slug === referenceSlug;

          if (dense) {
            return (
              <Link
                key={column.slug}
                href={`/items/${column.item.slug}`}
                title={column.item.name}
                className="flex h-11 items-center justify-center gap-1 rounded-lg border"
                style={{
                  borderColor: isReference ? accent : "rgba(158,208,255,0.15)",
                  backgroundColor: isReference
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(255,255,255,0.02)",
                }}
              >
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
                  <ImageCover
                    imageUrl={column.item.imageUrl}
                    name={column.item.name}
                    width={64}
                    height={64}
                    className="h-full object-cover"
                  />
                </span>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: `oklch(0.74 0.13 ${hueOf(index)})` }}
                />
              </Link>
            );
          }

          return (
            <div
              key={column.slug}
              className="flex min-w-0 flex-col gap-1.5 rounded-[10px] border p-2"
              style={{
                borderColor: isReference ? accent : "rgba(158,208,255,0.15)",
                backgroundColor: isReference
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.02)",
              }}
            >
              <div className="flex items-center gap-1.5">
                <Link
                  href={`/items/${column.item.slug}`}
                  className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5"
                >
                  <ImageCover
                    imageUrl={column.item.imageUrl}
                    name={column.item.name}
                    width={72}
                    height={72}
                    className="h-full object-cover"
                  />
                </Link>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: `oklch(0.74 0.13 ${hueOf(index)})` }}
                />
                <span className="flex-1" />
                {columns.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(column.slug)}
                    title={t("removeColumn")}
                    aria-label={t("removeColumn")}
                    className="-mr-1 -mt-1 rounded-md p-1 text-nexus/55 transition-colors hover:bg-white/10 hover:text-nexus"
                  >
                    <XMarkIcon className="size-3.5" />
                  </button>
                )}
              </div>

              <Link
                href={`/items/${column.item.slug}`}
                className="line-clamp-2 text-xs font-semibold leading-tight text-nexus-primary hover:underline"
              >
                {column.item.name}
              </Link>

              <button
                type="button"
                onClick={() => onReference(column.slug)}
                disabled={isReference}
                className="inline-flex h-5 w-fit max-w-full items-center truncate rounded-full border px-2 text-[9px] font-bold uppercase tracking-[0.08em] transition-colors disabled:cursor-default"
                style={pillStyle(isReference)}
              >
                {isReference ? t("isReference") : t("setReference")}
              </button>
            </div>
          );
        })}
      </div>

      {picker}

      {rendered.map((group) => (
        <div key={group.key}>
          <div className="flex items-center gap-3 pb-1.5 pt-4">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-nexus-primary">
              {t(`groups.${group.key}`)}
            </span>
            <span className="h-px flex-1 bg-[#9ED0FF]/15" />
          </div>

          {group.rows.map(({ row, cells }) => (
            <div
              key={row.key}
              className="flex flex-col gap-1.5 border-t border-[#9ED0FF]/10 py-2.5"
            >
              <div>
                <p className="text-[13px] font-medium leading-snug text-nexus">
                  {rowLabel(row)}
                </p>
                {row.direction === -1 && (
                  <p className="mt-0.5 text-[11px] text-nexus/45">
                    {t("lowerIsBetter")}
                  </p>
                )}
              </div>

              <div className="grid gap-1.5" style={gridStyle}>
                {cells.map((cell) => {
                  const { slug, value, isBest, share } = cell;
                  const delta = deltaText(cell);

                  return (
                  <div
                    key={slug}
                    className={cn(
                      "min-w-0 rounded-lg border-l-2 py-1",
                      dense ? "px-1.5" : "px-2",
                    )}
                    style={{
                      borderLeftColor: isBest ? accent : "transparent",
                      backgroundColor: isBest
                        ? "rgba(255,255,255,0.06)"
                        : "transparent",
                    }}
                  >
                    <p
                      className={cn(
                        "font-mono font-semibold leading-snug",
                        dense ? "text-[12px]" : "text-[15px]",
                        value === null
                          ? "text-nexus/40"
                          : isBest
                            ? "text-[#F2F7FC]"
                            : "text-nexus-primary",
                      )}
                    >
                      {/* Un nombre ne se coupe jamais : seule son unité peut
                          passer à la ligne. */}
                      {isNumber(value) && row.unit ? (
                        <>
                          <span className="whitespace-nowrap">
                            {formatValue(value)}
                          </span>{" "}
                          <span className="whitespace-nowrap">{row.unit}</span>
                        </>
                      ) : (
                        <span className="[overflow-wrap:anywhere]">
                          {formatValue(value, row.unit)}
                        </span>
                      )}
                    </p>
                    {delta && (
                      <p
                        className={cn(
                          "mt-0.5 truncate font-mono text-nexus/55",
                          dense ? "text-[10px]" : "text-[11px]",
                        )}
                      >
                        {delta}
                      </p>
                    )}
                    {share > 0 && (
                      <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${share}%`,
                            backgroundColor: isBest
                              ? accent
                              : "rgba(158,208,255,0.3)",
                          }}
                        />
                      </span>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}

      {rendered.length === 0 && (
        <p className="py-8 text-sm text-nexus/65">{t("noRows")}</p>
      )}

      {hiddenRows > 0 && (
        <p className="mt-3 flex w-fit items-center gap-2 rounded-lg border border-dashed border-[#9ED0FF]/20 px-3 py-2 text-xs text-nexus/65">
          <EyeSlashIcon className="size-4 shrink-0" />
          {t("hiddenRows", { count: hiddenRows })}
        </p>
      )}
    </div>
  );
}

function ToggleChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
        active
          ? "border-primary/45 bg-primary/12 text-nexus-primary"
          : "border-[#9ED0FF]/22 text-nexus/75 hover:bg-white/5",
      )}
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-[4px] border",
          active
            ? "border-primary bg-primary text-primary-foreground"
            : "border-[#9ED0FF]/45",
        )}
      >
        {active && <CheckIcon className="size-3 stroke-[3]" />}
      </span>
      {label}
    </button>
  );
}
