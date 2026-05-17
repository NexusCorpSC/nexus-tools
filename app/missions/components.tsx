"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Mission, MissionFaction } from "@/types/missions";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ShieldExclamationIcon,
  UsersIcon,
  CurrencyDollarIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── MissionCard ─────────────────────────────────────────────────────────────

function MissionCard({ mission }: { mission: Mission }) {
  const t = useTranslations("Missions");

  return (
    <Link
      href={`/missions/${mission._id}`}
      className="group flex flex-col rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-4 gap-3 hover:border-[#9ED0FF]/30 hover:bg-[#0B2A42]/80 transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-blue-400/70 uppercase tracking-wider mb-1">
            {mission.missionType}
          </p>
          <h3 className="font-semibold text-sm leading-snug group-hover:text-blue-200 transition-colors line-clamp-2">
            {mission.title}
          </h3>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          {mission.illegal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-900/50 border border-red-500/30 px-2 py-0.5 text-xs text-red-300">
              <ShieldExclamationIcon className="size-3" />
              {t("illegal")}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2">
        {mission.description}
      </p>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 mt-auto pt-1 border-t border-white/5">
        {mission.faction && (
          <span className="inline-flex items-center gap-1 text-xs text-blue-300/70">
            <UsersIcon className="size-3" />
            {mission.faction.name}
          </span>
        )}
        {mission.canBeShared && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-300/70">
            <UsersIcon className="size-3" />
            {t("shareable")}
          </span>
        )}
        {mission.rewardUEC !== undefined && mission.rewardUEC > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-yellow-300/70">
            <CurrencyDollarIcon className="size-3" />
            {mission.rewardUEC.toLocaleString()} aUEC
          </span>
        )}
        {mission.blueprintDetails.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-purple-300/80 font-medium">
            <CubeIcon className="size-3" />
            {t("blueprintsCount", { count: mission.blueprintDetails.length })}
          </span>
        )}
      </div>
    </Link>
  );
}

// ─── MissionsExplorer ─────────────────────────────────────────────────────────

export function MissionsExplorer({
  factions,
}: {
  factions: MissionFaction[];
}) {
  const t = useTranslations("Missions");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [factionId, setFactionId] = useState(searchParams.get("faction") || "");
  const [hasBlueprints, setHasBlueprints] = useState(
    searchParams.get("blueprints") === "true"
  );
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") || "1", 10)
  );

  const [missions, setMissions] = useState<Mission[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const LIMIT = 24;

  const fetchMissions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (factionId) params.set("factionId", factionId);
    if (hasBlueprints) params.set("hasBlueprints", "true");
    params.set("limit", LIMIT.toString());
    params.set("page", page.toString());

    try {
      const res = await fetch(`/api/missions?${params.toString()}`);
      const data = await res.json();
      setMissions(data.missions ?? []);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 0);
    } catch {
      setMissions([]);
    } finally {
      setLoading(false);
    }
  }, [query, factionId, hasBlueprints, page]);

  useEffect(() => {
    fetchMissions();
  }, [fetchMissions]);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (factionId) params.set("faction", factionId);
    if (hasBlueprints) params.set("blueprints", "true");
    if (page > 1) params.set("page", page.toString());
    const url = params.toString() ? `?${params}` : "/missions";
    router.replace(url, { scroll: false });
  }, [query, factionId, hasBlueprints, page, router]);

  const resetFilters = () => {
    setQuery("");
    setFactionId("");
    setHasBlueprints(false);
    setPage(1);
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const handleFaction = (value: string) => {
    setFactionId(value === "all" ? "" : value);
    setPage(1);
  };

  const hasActiveFilters = query || factionId || hasBlueprints;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>

        <Select value={factionId || "all"} onValueChange={handleFaction}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filterAllFactions")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAllFactions")}</SelectItem>
            {factions.map((f) => (
              <SelectItem key={f._id} value={f._id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="button"
          onClick={() => {
            setHasBlueprints((v) => !v);
            setPage(1);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-colors",
            hasBlueprints
              ? "border-purple-500/50 bg-purple-900/30 text-purple-200"
              : "border-white/10 text-muted-foreground hover:border-white/20"
          )}
        >
          <CubeIcon className="size-4" />
          {t("filterWithBlueprints")}
        </button>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <XMarkIcon className="size-4 mr-1" />
            {t("filterReset")}
          </Button>
        )}
      </div>

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        {t("resultsCount", { count: total })}
      </p>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-4 h-36 animate-pulse"
            />
          ))}
        </div>
      ) : missions.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          {t("noResults")}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {missions.map((m) => (
            <MissionCard key={m._id.toString()} mission={m} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeftIcon className="size-4" />
            {t("paginationPrev")}
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("paginationPage", { page, totalPages })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t("paginationNext")}
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

