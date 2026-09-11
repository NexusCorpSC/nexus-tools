"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ArrowRightIcon,
  CheckIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ImageCover } from "@/components/image-cover";
import {
  ITEM_KINDS,
  ITEM_PAGE_SIZE,
  MAX_COMPARE_ITEMS,
  type ItemFacets,
  type ItemListResponse,
  type ItemSummary,
} from "@/types/items";

const EMPTY_FACETS: ItemFacets = {
  categories: [],
  manufacturers: [],
  variantGroups: [],
  sets: [],
};

/** Value the selects use for "no filter": Radix forbids an empty string. */
const ANY = "_all";

/**
 * Une carte de résultat. En mode comparaison elle ne navigue plus : elle se
 * coche, et les objets d'un autre type que le premier coché s'éteignent —
 * une comparaison porte sur un seul type d'objet.
 */
export function ItemCard({
  item,
  selection,
}: {
  item: ItemSummary;
  selection?: {
    selected: boolean;
    disabled: boolean;
    reason?: string;
    onToggle: () => void;
  };
}) {
  const t = useTranslations("Items");

  const body = (
    <>
      <div className="relative w-full aspect-square bg-muted flex items-center justify-center overflow-hidden">
        <ImageCover
          imageUrl={item.imageUrl}
          name={item.name}
          width={400}
          height={400}
          className="h-full object-cover"
        />
        {selection && (
          <span
            className={`absolute top-2 left-2 flex size-6 items-center justify-center rounded-md border ${
              selection.selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-white/60 bg-black/50 backdrop-blur-sm"
            }`}
          >
            {selection.selected && <CheckIcon className="size-4 stroke-[3]" />}
          </span>
        )}
        {!selection && typeof item.tier === "number" && item.tier > 0 && (
          <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-bold bg-black/60 text-white rounded-full backdrop-blur-sm">
            T{item.tier}
          </span>
        )}
        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-semibold bg-black/60 text-white rounded-full backdrop-blur-sm">
          {t(`kinds.${item.kind}`)}
        </span>
        {selection?.disabled && selection.reason && (
          <span className="absolute inset-x-2 bottom-2 rounded-md bg-[#092F49]/85 px-2 py-1 text-[11px] leading-snug text-nexus/80">
            {selection.reason}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-0.5 flex-1 text-left">
        <p className="font-semibold text-sm leading-snug line-clamp-2">
          {item.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {[item.category, item.subcategory].filter(Boolean).join(" › ")}
        </p>
        {item.variantName && (
          <p className="text-xs text-muted-foreground/80 truncate">
            {t("variantLabel", { variant: item.variantName })}
          </p>
        )}
      </div>
    </>
  );

  if (selection) {
    return (
      <button
        type="button"
        onClick={selection.onToggle}
        disabled={selection.disabled}
        aria-pressed={selection.selected}
        className={`group flex flex-col overflow-hidden rounded-xl border bg-card transition-all ${
          selection.selected
            ? "border-primary shadow-md"
            : "border-border hover:border-primary/40"
        } ${selection.disabled ? "cursor-not-allowed opacity-45" : ""}`}
      >
        {body}
      </button>
    );
  }

  return (
    <Link
      href={`/items/${item.slug}`}
      className="group flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all overflow-hidden"
    >
      {body}
    </Link>
  );
}

function ItemCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden animate-pulse">
      <div className="aspect-square bg-muted" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>
  );
}

export function ItemGrid() {
  const t = useTranslations("Items");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [facets, setFacets] = useState<ItemFacets>(EMPTY_FACETS);
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [picked, setPicked] = useState<ItemSummary[]>([]);
  const [page, setPage] = useState(() => {
    const parsed = parseInt(searchParams.get("page") ?? "1", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });

  /** Sync the ?page= query param in the URL without a full navigation. */
  const updatePageInUrl = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(window.location.search);
      if (newPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(newPage));
      }
      const search = params.toString();
      router.replace(search ? `?${search}` : window.location.pathname, {
        scroll: false,
      });
    },
    [router],
  );

  useEffect(() => {
    fetch("/api/items/facets")
      .then((response) => response.json())
      .then((data: ItemFacets) => setFacets(data))
      .catch(() => {});
  }, []);

  const subcategories =
    facets.categories.find((entry) => entry.category === category)
      ?.subcategories ?? [];

  const fetchResults = useCallback(
    async (options: {
      query: string;
      kind: string;
      category: string;
      subcategory: string;
      manufacturer: string;
      page: number;
    }) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (options.query.trim()) params.set("query", options.query.trim());
        if (options.kind) params.set("kind", options.kind);
        if (options.category) params.set("category", options.category);
        if (options.subcategory) params.set("subcategory", options.subcategory);
        if (options.manufacturer)
          params.set("manufacturer", options.manufacturer);
        params.set("limit", String(ITEM_PAGE_SIZE));
        params.set("page", String(options.page));

        const response = await fetch(`/api/items?${params.toString()}`);
        const data: ItemListResponse = await response.json();

        setResults(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setHasLoaded(true);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const initialPage = useRef(page); // page value read from URL on mount

  // Re-fetch (debounced) when filters change → back to page 1, except on mount
  useEffect(() => {
    const effectivePage = isFirstRender.current ? initialPage.current : 1;

    if (!isFirstRender.current) {
      setPage(1);
      updatePageInUrl(1);
    }
    isFirstRender.current = false;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults({
        query,
        kind,
        category,
        subcategory,
        manufacturer,
        page: effectivePage,
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kind, category, subcategory, manufacturer, fetchResults]);

  const goToPage = useCallback(
    (newPage: number) => {
      setPage(newPage);
      updatePageInUrl(newPage);
      fetchResults({
        query,
        kind,
        category,
        subcategory,
        manufacturer,
        page: newPage,
      });
    },
    [
      query,
      kind,
      category,
      subcategory,
      manufacturer,
      fetchResults,
      updatePageInUrl,
    ],
  );

  const hasActiveFilters =
    !!query || !!kind || !!category || !!subcategory || !!manufacturer;

  // Le type du premier objet coché verrouille la sélection : ce qui suit doit
  // être comparable, sinon le tableau n'aurait aucune ligne en commun.
  const lockedKind = picked[0]?.kind ?? null;
  const canCompare = picked.length >= 2;

  const togglePicked = (item: ItemSummary) => {
    setPicked((current) => {
      if (current.some((entry) => entry.slug === item.slug)) {
        return current.filter((entry) => entry.slug !== item.slug);
      }
      if (current.length >= MAX_COMPARE_ITEMS) return current;
      return [...current, item];
    });
  };

  const selectionFor = (item: ItemSummary) => {
    if (!compareMode) return undefined;

    const selected = picked.some((entry) => entry.slug === item.slug);
    const wrongKind = lockedKind !== null && item.kind !== lockedKind;
    const full = picked.length >= MAX_COMPARE_ITEMS;

    return {
      selected,
      disabled: !selected && (wrongKind || full),
      reason: wrongKind
        ? t("Compare.otherKind")
        : full
          ? t("Compare.limitReached")
          : undefined,
      onToggle: () => togglePicked(item),
    };
  };

  const resetFilters = () => {
    setQuery("");
    setKind("");
    setCategory("");
    setSubcategory("");
    setManufacturer("");
  };

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full h-9 pl-9 pr-9 rounded-md border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring shadow-xs transition-[color,box-shadow]"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <XMarkIcon className="size-4" />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-start p-4 rounded-xl border border-border bg-card/50">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground self-center mr-1">
          <FunnelIcon className="size-4 shrink-0" />
          <span>{t("filterTitle")}</span>
        </div>

        {/* Kind */}
        <div className="flex rounded-md border border-input overflow-hidden shadow-xs">
          {["", ...ITEM_KINDS].map((option) => (
            <button
              key={option || "all"}
              type="button"
              onClick={() => setKind(option)}
              className={`px-3 h-9 text-sm font-medium transition-colors ${
                kind === option
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              {option ? t(`kinds.${option}`) : t("filterAllKinds")}
            </button>
          ))}
        </div>

        {/* Category */}
        <div className="min-w-44">
          <Select
            value={category || ANY}
            onValueChange={(value) => {
              setCategory(value === ANY ? "" : value);
              setSubcategory("");
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={t("filterAllCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("filterAllCategories")}</SelectItem>
              {facets.categories.map((entry) => (
                <SelectItem key={entry.category} value={entry.category}>
                  {entry.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory */}
        {category && subcategories.length > 0 && (
          <div className="min-w-44">
            <Select
              value={subcategory || ANY}
              onValueChange={(value) =>
                setSubcategory(value === ANY ? "" : value)
              }
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("filterAllSubcategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>
                  {t("filterAllSubcategories")}
                </SelectItem>
                {subcategories.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Manufacturer */}
        {facets.manufacturers.length > 0 && (
          <div className="min-w-44">
            <Select
              value={manufacturer || ANY}
              onValueChange={(value) =>
                setManufacturer(value === ANY ? "" : value)
              }
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("filterAllManufacturers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>
                  {t("filterAllManufacturers")}
                </SelectItem>
                {facets.manufacturers.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Reset */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-9 text-muted-foreground"
          >
            <XMarkIcon className="size-4" />
            {t("filterReset")}
          </Button>
        )}

        {/* Comparaison */}
        <Button
          variant={compareMode ? "default" : "outline"}
          size="sm"
          className="ml-auto h-9"
          aria-pressed={compareMode}
          onClick={() => {
            setCompareMode((value) => !value);
            setPicked([]);
          }}
        >
          <ViewColumnsIcon className="size-4" />
          {compareMode
            ? t("Compare.selectionExit")
            : t("Compare.selectionStart")}
        </Button>
      </div>

      {/* Result count */}
      {hasLoaded && !isLoading && (
        <p className="text-sm text-muted-foreground">
          {t("resultsCount", { count: total })}
        </p>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: ITEM_PAGE_SIZE }).map((_, index) => (
            <ItemCardSkeleton key={index} />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              selection={selectionFor(item)}
            />
          ))}
        </div>
      ) : hasLoaded ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MagnifyingGlassIcon className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">{t("noResults")}</p>
        </div>
      ) : null}

      {/* Barre de comparaison */}
      {compareMode && (
        <div className="sticky bottom-2 z-30">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#9ED0FF]/20 bg-popover/95 p-3 shadow-lg shadow-black/30 backdrop-blur-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <ViewColumnsIcon className="size-5" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {t("Compare.selectedCount", { count: picked.length })}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {picked.map((item) => (
                  <span
                    key={item.slug}
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#9ED0FF]/28 pl-2.5 pr-1 text-xs text-nexus"
                  >
                    {item.name}
                    <button
                      type="button"
                      onClick={() => togglePicked(item)}
                      aria-label={t("Compare.removeColumn")}
                      className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                    >
                      <XMarkIcon className="size-3" />
                    </button>
                  </span>
                ))}
                {!canCompare && (
                  <span className="text-xs text-muted-foreground">
                    {picked.length === 0
                      ? t("Compare.pickTwo")
                      : t("Compare.pickOneMore")}
                  </span>
                )}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPicked([])}
              disabled={picked.length === 0}
              className="text-muted-foreground"
            >
              {t("Compare.clearSelection")}
            </Button>

            {canCompare ? (
              <Button asChild size="sm">
                <Link
                  href={`/items/compare?ids=${picked
                    .map((item) => item.slug)
                    .join(",")}`}
                >
                  {t("Compare.compareCount", { count: picked.length })}
                  <ArrowRightIcon className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button size="sm" disabled>
                {t("Compare.compareAction")}
                <ArrowRightIcon className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pagination */}
      {hasLoaded && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(1)}
            disabled={page <= 1 || isLoading}
            title={t("paginationFirst")}
          >
            <ChevronDoubleLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(Math.max(1, page - 1))}
            disabled={page <= 1 || isLoading}
          >
            <ChevronLeftIcon className="size-4" />
            {t("paginationPrev")}
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            {t("paginationPage", { page, totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages || isLoading}
          >
            {t("paginationNext")}
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(totalPages)}
            disabled={page >= totalPages || isLoading}
            title={t("paginationLast")}
          >
            <ChevronDoubleRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
