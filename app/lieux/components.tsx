"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FunnelIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  MapIcon,
  Squares2X2Icon,
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
import { PLACE_SERVICE_ICON, placeTrail } from "@/lib/place-icons";
import {
  PLACE_SORTS,
  type PlaceFacets,
  type PlaceListResponse,
  type PlaceSummary,
  type PlaceTreeNode,
  type PlaceTreeResponse,
} from "@/types/places";
import { PlacesTree } from "./places-tree";

const EMPTY_FACETS: PlaceFacets = {
  types: [],
  systems: [],
  bodies: [],
  services: [],
};

/** Value the selects use for "no filter": Radix forbids an empty string. */
const ANY = "_all";

export function PlaceCard({ place }: { place: PlaceSummary }) {
  const t = useTranslations("Places");
  const services = (place.services ?? []).slice(0, 5);
  const rest = (place.services ?? []).length - services.length;
  const trail = placeTrail(place);

  return (
    <Link
      href={`/lieux/${place.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/40 hover:shadow-md"
    >
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted">
        <ImageCover
          imageUrl={place.imageUrl}
          name={place.name}
          width={400}
          height={300}
          className="h-full object-cover"
        />
        {place.systemName && (
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
            {place.systemName}
          </span>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
          {t(`types.${place.type}`)}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 text-left">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">
          {place.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{trail}</p>

        {place.childCount > 0 && (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/35 px-2 py-0.5 text-[11px] font-semibold text-primary">
            <ListBulletIcon className="size-3" />
            {t("containedCount", { count: place.childCount })}
          </span>
        )}

        {services.length > 0 && (
          <div className="flex items-center gap-1.5 pt-0.5 text-muted-foreground">
            {services.map((service) => {
              const ServiceIcon = PLACE_SERVICE_ICON[service];
              return (
                <ServiceIcon
                  key={service}
                  className="size-4 shrink-0"
                  title={t(`services.${service}`)}
                />
              );
            })}
            {rest > 0 && <span className="text-xs font-medium">+{rest}</span>}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[#9ED0FF]/15 pt-2">
          <span className="text-xs text-muted-foreground">
            {t("shopsCount", { count: place.shopCount })}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary">
            <MapIcon className="size-3.5" />
            {t("plansCount", { count: place.planCount })}
          </span>
        </div>
      </div>
    </Link>
  );
}

function PlaceCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-border bg-card">
      <div className="aspect-[4/3] bg-muted" />
      <div className="space-y-2 p-3">
        <div className="h-3 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/2 rounded bg-muted" />
      </div>
    </div>
  );
}

export function PlacesBrowser() {
  const t = useTranslations("Places");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [system, setSystem] = useState("");
  const [body, setBody] = useState("");
  const [service, setService] = useState("");
  const [sort, setSort] = useState("name");
  const [view, setView] = useState<"grid" | "tree">(() =>
    searchParams.get("vue") === "arbre" ? "tree" : "grid",
  );

  const [facets, setFacets] = useState<PlaceFacets>(EMPTY_FACETS);
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [nodes, setNodes] = useState<PlaceTreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [truncated, setTruncated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(() => {
    const parsed = parseInt(searchParams.get("page") ?? "1", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  });

  const isFiltered = !!(query.trim() || type || system || body || service);

  /** Sync the ?page= and ?vue= query params without a full navigation. */
  const updateUrl = useCallback(
    (nextPage: number, nextView: "grid" | "tree") => {
      const params = new URLSearchParams(window.location.search);
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));
      if (nextView === "tree") params.set("vue", "arbre");
      else params.delete("vue");
      const search = params.toString();
      router.replace(search ? `?${search}` : window.location.pathname, {
        scroll: false,
      });
    },
    [router],
  );

  useEffect(() => {
    fetch("/api/lieux/facets")
      .then((response) => response.json())
      .then((data: PlaceFacets) => setFacets(data))
      .catch(() => {});
  }, []);

  // Une planète n'a de sens que dans son système : changer de système vide la
  // liste des corps, et n'offre que ceux du système retenu.
  const bodies = facets.bodies.filter(
    (entry) => !system || entry.systemSlug === system,
  );

  const fetchResults = useCallback(
    async (options: {
      query: string;
      type: string;
      system: string;
      body: string;
      service: string;
      sort: string;
      view: "grid" | "tree";
      page: number;
    }) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (options.query.trim()) params.set("query", options.query.trim());
        if (options.type) params.set("type", options.type);
        if (options.system) params.set("system", options.system);
        if (options.body) params.set("body", options.body);
        if (options.service) params.set("service", options.service);

        if (options.view === "tree") {
          const response = await fetch(`/api/lieux/tree?${params.toString()}`);
          const data: PlaceTreeResponse = await response.json();
          setNodes(data.nodes);
          setTotal(data.total);
          setTruncated(data.truncated);
          // Sous filtre, les lieux qui n'ont été ramenés que pour le contexte
          // s'ouvrent d'eux-mêmes : c'est le seul moyen de voir le résultat.
          const context = data.nodes.filter((node) => !node.matched);
          if (context.length > 0) {
            setExpanded(new Set(context.map((node) => node.slug)));
          }
        } else {
          if (options.sort) params.set("sort", options.sort);
          params.set("page", String(options.page));
          const response = await fetch(`/api/lieux?${params.toString()}`);
          const data: PlaceListResponse = await response.json();
          setResults(data.places);
          setTotal(data.total);
          setTotalPages(data.totalPages);
        }
      } catch {
        setResults([]);
        setNodes([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
        setHasLoaded(true);
      }
    },
    [],
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const initialPage = useRef(page);

  useEffect(() => {
    const effectivePage = isFirstRender.current ? initialPage.current : 1;
    if (!isFirstRender.current) {
      setPage(1);
      updateUrl(1, view);
    }
    isFirstRender.current = false;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults({
        query,
        type,
        system,
        body,
        service,
        sort,
        view,
        page: effectivePage,
      });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, type, system, body, service, sort, view, fetchResults]);

  const goToPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(totalPages, nextPage));
    if (bounded === page) return;
    setPage(bounded);
    updateUrl(bounded, view);
    fetchResults({
      query,
      type,
      system,
      body,
      service,
      sort,
      view,
      page: bounded,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const switchView = (next: "grid" | "tree") => {
    if (next === view) return;
    setView(next);
    updateUrl(1, next);
  };

  const toggle = (slug: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  const reset = () => {
    setQuery("");
    setType("");
    setSystem("");
    setBody("");
    setService("");
    setSort("name");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border bg-card/50 p-4">
        <div className="relative min-w-56 flex-1">
          <label htmlFor="place-search" className="sr-only">
            {t("searchLabel")}
          </label>
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="place-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="min-w-44">
          <Select
            value={type || ANY}
            onValueChange={(value) => setType(value === ANY ? "" : value)}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder={t("filterAllTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("filterAllTypes")}</SelectItem>
              {facets.types.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {t(`types.${entry.value}`)} ({entry.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {facets.systems.length > 0 && (
          <div className="min-w-40">
            <Select
              value={system || ANY}
              onValueChange={(value) => {
                setSystem(value === ANY ? "" : value);
                setBody("");
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("filterAllSystems")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("filterAllSystems")}</SelectItem>
                {facets.systems.map((entry) => (
                  <SelectItem key={entry.slug} value={entry.slug}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {bodies.length > 0 && (
          <div className="min-w-44">
            <Select
              value={body || ANY}
              onValueChange={(value) => setBody(value === ANY ? "" : value)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("filterAllBodies")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("filterAllBodies")}</SelectItem>
                {bodies.map((entry) => (
                  <SelectItem key={entry.slug} value={entry.slug}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {facets.services.length > 0 && (
          <div className="min-w-48">
            <Select
              value={service || ANY}
              onValueChange={(value) => setService(value === ANY ? "" : value)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder={t("filterAllServices")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>{t("filterAllServices")}</SelectItem>
                {facets.services.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {t(`services.${entry.value}`)} ({entry.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {view === "grid" && (
          <div className="min-w-40">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLACE_SORTS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {t(`sorts.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isFiltered && (
          <Button variant="outline" size="sm" className="h-9" onClick={reset}>
            <FunnelIcon className="size-4" />
            {t("filterReset")}
          </Button>
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {t("resultsCount", { count: total })}
        </p>

        <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-input p-0.5 shadow-xs">
          <button
            type="button"
            aria-pressed={view === "grid"}
            onClick={() => switchView("grid")}
            className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-sm font-medium transition-colors ${
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <Squares2X2Icon className="size-4" />
            {t("viewGrid")}
          </button>
          <button
            type="button"
            aria-pressed={view === "tree"}
            onClick={() => switchView("tree")}
            className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-sm font-medium transition-colors ${
              view === "tree"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            <ListBulletIcon className="size-4" />
            {t("viewTree")}
          </button>
        </div>
      </div>

      {isLoading ? (
        view === "grid" ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <PlaceCardSkeleton key={index} />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-12 animate-pulse rounded-lg border border-border bg-card"
              />
            ))}
          </div>
        )
      ) : view === "tree" ? (
        nodes.length > 0 ? (
          <>
            {truncated && (
              <p className="rounded-lg border border-[#9ED0FF]/20 bg-[#0B3A5A]/40 px-3 py-2 text-sm text-muted-foreground">
                {t("treeTruncated")}
              </p>
            )}
            <PlacesTree nodes={nodes} expanded={expanded} onToggle={toggle} />
          </>
        ) : (
          hasLoaded && <EmptyState />
        )
      ) : results.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((place) => (
            <PlaceCard key={place.slug} place={place} />
          ))}
        </div>
      ) : (
        hasLoaded && <EmptyState />
      )}

      {view === "grid" && hasLoaded && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            aria-label={t("paginationFirst")}
            disabled={page <= 1}
            onClick={() => goToPage(1)}
          >
            <ChevronDoubleLeftIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("paginationPrev")}
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="px-2 text-sm text-muted-foreground">
            {t("paginationPage", { page, totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("paginationNext")}
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={t("paginationLast")}
            disabled={page >= totalPages}
            onClick={() => goToPage(totalPages)}
          >
            <ChevronDoubleRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  const t = useTranslations("Places");
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <MapIcon className="size-10 text-muted-foreground/30" />
      <p className="text-base font-semibold">{t("noResults")}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("noResultsHint")}
      </p>
    </div>
  );
}
