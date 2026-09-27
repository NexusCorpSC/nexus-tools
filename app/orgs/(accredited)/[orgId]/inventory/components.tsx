"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { InventoryItemWithLocation } from "@/types/inventory";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  CubeIcon,
  MapPinIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, roundQty } from "@/lib/utils";
import {
  groupByLocation,
  ItemGroup,
  QualityBadge,
} from "@/app/inventory/components";

export type OrgInventoryItem = InventoryItemWithLocation & {
  ownerName: string;
};

type ApiResponse = {
  items: OrgInventoryItem[];
  total: number;
  members: { id: string; name: string }[];
};

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Le même inventaire que celui du joueur — par lieu, une carte par ressource,
 * un lot par qualité — mais en lecture seule, et chaque lot dit à qui il est.
 */
export function OrgInventoryGrid({ orgId }: { orgId: string }) {
  const t = useTranslations("Inventory");
  const locale = useLocale();

  const [items, setItems] = useState<OrgInventoryItem[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");

  const debouncedQuery = useDebounce(searchQuery, 300);
  const debouncedQuality = useDebounce(qualityFilter, 300);

  // Tout d'un coup : une page de 20 couperait une ressource en deux cartes.
  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ all: "1" });
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      if (debouncedQuality.trim()) params.set("quality", debouncedQuality.trim());
      if (ownerFilter !== "all") params.set("userId", ownerFilter);
      const res = await fetch(`/api/orgs/${orgId}/inventory?${params}`);
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setItems(data.items);
      setMembers(data.members);
    } finally {
      setLoading(false);
    }
  }, [orgId, debouncedQuery, debouncedQuality, ownerFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const sections = useMemo(() => groupByLocation(items), [items]);
  // Un lieu choisi que les autres filtres ont vidé ne masque pas tout : on
  // revient à « Tous ».
  const activeLocation = sections.some((s) => s.key === locationFilter)
    ? locationFilter
    : "all";
  const shown =
    activeLocation === "all"
      ? sections
      : sections.filter((section) => section.key === activeLocation);

  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );

  const chips = [
    {
      key: "all",
      label: t("filterAll"),
      count: sections.reduce((sum, section) => sum + section.count, 0),
    },
    ...sections.map((section) => ({
      key: section.key,
      label: section.location?.name ?? t("locationUnknown"),
      count: section.count,
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-2.5 items-center">
        <label className="relative flex-1 min-w-48">
          <span className="sr-only">{t("searchPlaceholder")}</span>
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#7E9FB7] pointer-events-none" />
          <Input
            className="h-10 pl-9 bg-[#0A2A42] border-[#9ED0FF]/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </label>

        {members.length > 1 && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-10 w-48 bg-[#0A2A42] border-[#9ED0FF]/20">
              <SelectValue placeholder={t("orgInventoryFilterAllMembers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("orgInventoryFilterAllMembers")}
              </SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <label className="flex h-10 items-center gap-2 rounded-md border border-[#9ED0FF]/20 bg-[#0A2A42] pl-3 pr-1.5 text-sm">
          <span className="text-[#7E9FB7] whitespace-nowrap">
            {t("filterQualityLabel")}
          </span>
          <Input
            type="number"
            min={0}
            step={1}
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            placeholder="0"
            className="h-7 w-16 px-2 font-mono text-sm"
          />
          {qualityFilter && (
            <button
              type="button"
              onClick={() => setQualityFilter("")}
              aria-label={t("filterQualityClear")}
              className="text-[#7E9FB7] hover:text-[#CCE7FF]"
            >
              <XMarkIcon className="size-4" />
            </button>
          )}
        </label>
      </div>

      {/* Places */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => {
            const on = activeLocation === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                aria-pressed={on}
                onClick={() => setLocationFilter(chip.key)}
                className={cn(
                  "flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors",
                  on
                    ? "border-[#9ED0FF] bg-[#9ED0FF] font-semibold text-[#061E30]"
                    : "border-[#9ED0FF]/25 text-[#C9E4FF] hover:border-[#9ED0FF]/55",
                )}
              >
                {chip.label}
                <span className="font-mono text-xs opacity-70">
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-36 rounded-xl animate-pulse bg-[#0A2A42]"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <CubeIcon className="size-10 mx-auto mb-3 text-[#7E9FB7]" />
          <p className="font-medium">{t("orgInventoryEmpty")}</p>
          <p className="text-sm mt-1 text-[#7E9FB7]">
            {t("orgInventoryEmptySubtitle")}
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {shown.map((section) => (
            <section key={section.key} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <MapPinIcon className="size-4 shrink-0 text-[#7E9FB7]" />
                <h2 className="text-[15px] font-semibold text-[#CCE7FF]">
                  {section.location?.name ?? t("locationUnknown")}
                </h2>
                <span className="font-mono text-xs text-[#7E9FB7]">
                  {t("sectionCount", { count: section.count })}
                  {section.scu > 0 &&
                    ` · ${number.format(roundQty(section.scu))} SCU`}
                </span>
                <span className="h-px flex-1 bg-[#9ED0FF]/12" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
                {section.groups.map((group) => (
                  <OrgInventoryGroupCard key={group.key} group={group} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgInventoryGroupCard({
  group,
}: {
  group: ItemGroup<OrgInventoryItem>;
}) {
  const t = useTranslations("Inventory");
  const locale = useLocale();

  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  const multi = group.lots.length > 1;
  const total = roundQty(group.lots.reduce((sum, lot) => sum + lot.quantity, 0));
  const latest = group.lots.reduce((a, b) =>
    a.updatedAt > b.updatedAt ? a : b,
  );

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[#9ED0FF]/12 bg-[#0A2A42] p-4 transition-colors hover:border-[#9ED0FF]/35">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold break-words text-[#CCE7FF]">
            {group.name}
          </h3>
          <p className="mt-1 text-xs text-[#7E9FB7]">
            {multi && <>{t("lotsCount", { count: group.lots.length })} · </>}
            {t("updatedAt", { date: date.format(new Date(latest.updatedAt)) })}
          </p>
        </div>
        <p className="shrink-0 text-right leading-none whitespace-nowrap">
          <span className="font-mono text-xl font-bold tracking-tight text-[#9ED0FF] tabular-nums">
            ×{number.format(total)}
          </span>
          {group.unit && (
            <span className="ml-1 text-xs font-semibold text-[#7E9FB7]">
              {group.unit}
            </span>
          )}
        </p>
      </header>

      {!multi && group.lots[0].description && (
        <p className="line-clamp-2 text-xs text-[#A9BFD0]">
          {group.lots[0].description}
        </p>
      )}

      <ul className="space-y-0.5">
        {group.lots.map((lot) => (
          <li
            key={lot.id}
            className="flex min-h-8 items-center gap-2 py-1"
          >
            {lot.quality != null ? (
              <QualityBadge quality={lot.quality} />
            ) : (
              <span className="text-xs text-[#7E9FB7]">{t("noQuality")}</span>
            )}
            <span
              className="flex min-w-0 flex-1 items-center gap-1 text-xs text-[#A9BFD0]"
              title={t("orgInventoryOwner")}
            >
              <UserIcon className="size-3.5 shrink-0 text-[#7E9FB7]" />
              <span className="truncate">{lot.ownerName}</span>
            </span>
            {multi && (
              <span className="font-mono text-[13px] font-semibold text-[#C9E4FF] tabular-nums">
                ×{number.format(lot.quantity)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </article>
  );
}
