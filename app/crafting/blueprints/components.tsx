"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Blueprint } from "@/types/crafting";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BlueprintImageCover } from "@/app/crafting/blueprints/[slug]/components";

// ─── Types ──────────────────────────────────────────────────────────────────

type Category = {
  category: string;
  subcategories: string[];
};

// ─── MaterialTagInput ────────────────────────────────────────────────────────

function MaterialTagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/blueprints/component-names?query=${encodeURIComponent(query)}`,
        );
        const data: string[] = await res.json();
        setSuggestions(data.filter((s) => !value.includes(s)));
      } catch {
        setSuggestions([]);
      }
    },
    [value],
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInputValue("");
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1.5 items-center min-h-9 px-3 py-1.5 rounded-md border border-input bg-background text-sm shadow-xs focus-within:ring-1 focus-within:ring-ring focus-within:border-ring transition-[color,box-shadow]">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-primary/60 transition-colors"
            >
              <XMarkIcon className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            fetchSuggestions(e.target.value);
            setShowSuggestions(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && inputValue.trim()) {
              e.preventDefault();
              addTag(inputValue.trim());
            } else if (
              e.key === "Backspace" &&
              !inputValue &&
              value.length > 0
            ) {
              removeTag(value[value.length - 1]);
            }
          }}
          onFocus={() => {
            if (inputValue.trim()) setShowSuggestions(true);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-28 outline-none bg-transparent text-sm placeholder:text-muted-foreground"
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-md overflow-auto max-h-48">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(s)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BlueprintCard ────────────────────────────────────────────────────────────

function BlueprintCard({
  blueprint,
}: {
  blueprint: Blueprint & { owned?: boolean };
}) {
  const t = useTranslations("Crafting.Blueprints");
  return (
    <Link
      href={`/crafting/blueprints/${blueprint.slug}`}
      className="group flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all overflow-hidden"
    >
      <div className="relative w-full aspect-square bg-muted flex items-center justify-center overflow-hidden">
        <BlueprintImageCover
          imageUrl={
            blueprint.imageUrl ??
            `https://gwgsmex5adyadzri.public.blob.vercel-storage.com/blueprints/images/${blueprint.slug}.jpg`
          }
          name={blueprint.name}
          fallback
        />
        {blueprint.tier !== undefined && blueprint.tier > 0 && (
          <span className="absolute top-2 left-2 px-2 py-0.5 text-xs font-bold bg-black/60 text-white rounded-full backdrop-blur-sm">
            T{blueprint.tier}
          </span>
        )}
        {blueprint.owned && (
          <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-semibold bg-green-500 text-white rounded-full shadow">
            {t("owned")}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-0.5 flex-1">
        <p className="font-semibold text-sm leading-snug line-clamp-2">
          {blueprint.name}
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {blueprint.category}
          {blueprint.subcategory ? ` › ${blueprint.subcategory}` : ""}
        </p>
      </div>
    </Link>
  );
}

function BlueprintCardSkeleton() {
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

// ─── BlueprintGrid ─────────────────────────────────────────────────────────────

export function BlueprintGrid({ isLoggedIn }: { isLoggedIn: boolean }) {
  const t = useTranslations("Crafting.Blueprints");

  const LIMIT = 24;

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [category, setCategory] = useState<string>("");
  const [subcategory, setSubcategory] = useState<string>("");
  const [ownedFilter, setOwnedFilter] = useState<"all" | "owned" | "not-owned">(
    "all",
  );
  const [materials, setMaterials] = useState<string[]>([]);
  const [results, setResults] = useState<(Blueprint & { owned?: boolean })[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    fetch("/api/blueprints/categories")
      .then((r) => r.json())
      .then((data: Category[]) => setCategories(data))
      .catch(() => {});
  }, []);

  const subcategories =
    categories.find((c) => c.category === category)?.subcategories ?? [];

  const fetchResults = useCallback(
    async (opts: {
      query: string;
      category: string;
      subcategory: string;
      ownedFilter: "all" | "owned" | "not-owned";
      materials: string[];
      page: number;
    }) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (opts.query.trim()) params.set("query", opts.query.trim());
        if (opts.category) params.set("category", opts.category);
        if (opts.subcategory) params.set("subcategory", opts.subcategory);
        if (opts.ownedFilter === "owned") params.set("owned", "true");
        if (opts.ownedFilter === "not-owned") params.set("owned", "false");
        if (opts.materials.length > 0)
          params.set("materials", opts.materials.join(","));
        params.set("limit", String(LIMIT));
        params.set("page", String(opts.page));
        const res = await fetch(`/api/blueprints?${params.toString()}`);
        const data: {
          blueprints: (Blueprint & { owned?: boolean })[];
          total: number;
          page: number;
          totalPages: number;
        } = await res.json();
        setResults(data.blueprints);
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

  // Re-fetch (with debounce) when filters change → always reset to page 1
  useEffect(() => {
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults({ query, category, subcategory, ownedFilter, materials, page: 1 });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, subcategory, ownedFilter, materials, fetchResults]);

  const goToPage = useCallback(
    (newPage: number) => {
      setPage(newPage);
      fetchResults({ query, category, subcategory, ownedFilter, materials, page: newPage });
    },
    [query, category, subcategory, ownedFilter, materials, fetchResults],
  );

  const resetFilters = () => {
    setQuery("");
    setCategory("");
    setSubcategory("");
    setOwnedFilter("all");
    setMaterials([]);
  };

  const hasActiveFilters =
    !!query ||
    !!category ||
    !!subcategory ||
    ownedFilter !== "all" ||
    materials.length > 0;

  return (
    <div className="space-y-5">
      {/* Search */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
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

        {/* Category */}
        <div className="min-w-44">
          <Select
            value={category || "_all"}
            onValueChange={(v) => {
              setCategory(v === "_all" ? "" : v);
              setSubcategory("");
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={t("filterAllCategories")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">{t("filterAllCategories")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.category} value={c.category}>
                  {c.category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Subcategory */}
        {category && subcategories.length > 0 && (
          <div className="min-w-44">
            <Select
              value={subcategory || "_all"}
              onValueChange={(v) => setSubcategory(v === "_all" ? "" : v)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("filterAllSubcategories")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">
                  {t("filterAllSubcategories")}
                </SelectItem>
                {subcategories.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Owned toggle */}
        {isLoggedIn && (
          <div className="flex rounded-md border border-input overflow-hidden shadow-xs">
            {(["all", "owned", "not-owned"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setOwnedFilter(opt)}
                className={`px-3 h-9 text-sm font-medium transition-colors ${
                  ownedFilter === opt
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {opt === "all"
                  ? t("filterOwnedAll")
                  : opt === "owned"
                    ? t("filterOwnedOwned")
                    : t("filterOwnedNotOwned")}
              </button>
            ))}
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

      {/* Materials */}
      <div>
        <p className="text-sm font-medium mb-1.5">
          {t("filterMaterials")}
          <span className="ml-1.5 text-xs text-muted-foreground font-normal">
            {t("filterMaterialsHint")}
          </span>
        </p>
        <MaterialTagInput
          value={materials}
          onChange={setMaterials}
          placeholder={t("filterMaterialsPlaceholder")}
        />
      </div>

      {/* Result count */}
      {hasLoaded && !isLoading && (
        <p className="text-sm text-muted-foreground">
          {t("filterResultsCount", { count: total })}
        </p>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: LIMIT }).map((_, i) => (
            <BlueprintCardSkeleton key={i} />
          ))}
        </div>
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.map((blueprint) => (
            <BlueprintCard key={blueprint.id} blueprint={blueprint} />
          ))}
        </div>
      ) : hasLoaded ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MagnifyingGlassIcon className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">{t("searchNoResults")}</p>
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
