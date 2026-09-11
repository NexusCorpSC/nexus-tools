"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
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

export function ItemCard({ item }: { item: ItemSummary }) {
  const t = useTranslations("Items");

  return (
    <Link
      href={`/items/${item.slug}`}
      className="group flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all overflow-hidden"
    >
      <div className="relative w-full aspect-square bg-muted flex items-center justify-center overflow-hidden">
        <ImageCover
          imageUrl={item.imageUrl}
          name={item.name}
          width={400}
          height={400}
          className="h-full object-cover"
        />
        {typeof item.tier === "number" && item.tier > 0 && (
          <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-bold bg-black/60 text-white rounded-full backdrop-blur-sm">
            T{item.tier}
          </span>
        )}
        <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-semibold bg-black/60 text-white rounded-full backdrop-blur-sm">
          {t(`kinds.${item.kind}`)}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-0.5 flex-1">
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
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : hasLoaded ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MagnifyingGlassIcon className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">{t("noResults")}</p>
        </div>
      ) : null}

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
