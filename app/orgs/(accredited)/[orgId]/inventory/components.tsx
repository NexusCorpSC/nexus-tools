"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { InventoryItemWithLocation } from "@/types/inventory";
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  CubeIcon,
  MapPinIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type OrgInventoryItem = InventoryItemWithLocation & {
  ownerName: string;
};

type ApiResponse = {
  items: OrgInventoryItem[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  members: { id: string; name: string }[];
};

const DEFAULT_LIMIT = 20;

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function OrgInventoryGrid({ orgId }: { orgId: string }) {
  const t = useTranslations("Inventory");

  const [items, setItems] = useState<OrgInventoryItem[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const debouncedQuery = useDebounce(searchQuery, 300);
  const debouncedQuality = useDebounce(qualityFilter, 300);

  const buildParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (debouncedQuery.trim()) params.set("query", debouncedQuery.trim());
      if (debouncedQuality.trim()) params.set("quality", debouncedQuality.trim());
      if (ownerFilter !== "all") params.set("userId", ownerFilter);
      params.set("page", String(p));
      params.set("limit", String(DEFAULT_LIMIT));
      return params;
    },
    [debouncedQuery, debouncedQuality, ownerFilter]
  );

  // Initial / filter-change fetch — resets to page 1
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/inventory?${buildParams(1).toString()}`
      );
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setItems(data.items);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setMembers(data.members);
    } finally {
      setLoading(false);
    }
  }, [orgId, buildParams]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Load next page — appends to the list
  const loadMore = async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/orgs/${orgId}/inventory?${buildParams(nextPage).toString()}`
      );
      if (!res.ok) return;
      const data: ApiResponse = await res.json();
      setItems((prev) => [...prev, ...data.items]);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(nextPage);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </div>

        {/* Owner filter */}
        {members.length > 1 && (
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={t("orgInventoryFilterAllMembers")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("orgInventoryFilterAllMembers")}</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Quality filter */}
        <div className="relative w-36">
          <Input
            type="number"
            min={0}
            step={1}
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            placeholder={t("filterQualityPlaceholder")}
          />
          {qualityFilter && (
            <button
              type="button"
              onClick={() => setQualityFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-gray-500">
          {t("resultsCount", { count: total })}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <CubeIcon className="size-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{t("orgInventoryEmpty")}</p>
          <p className="text-sm mt-1">{t("orgInventoryEmptySubtitle")}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <OrgInventoryItemCard key={item.id} item={item} />
            ))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? t("saving") : t("orgInventoryLoadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function OrgInventoryItemCard({ item }: { item: OrgInventoryItem }) {
  const t = useTranslations("Inventory");

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CubeIcon className="size-5 text-gray-400 shrink-0" />
          <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
        </div>
        {item.quality !== undefined && item.quality !== null && (
          <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {t("qualityLabel")}: {item.quality}
          </span>
        )}
      </div>

      {item.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>
      )}

      <div className="flex items-center justify-between text-sm pt-1">
        <span className="font-medium text-gray-800">
          {item.quantity}
          {item.unit ? ` ${item.unit}` : ""}
        </span>
        {item.location ? (
          <span className="flex items-center gap-1 text-gray-500">
            <MapPinIcon className="size-3.5" />
            {item.location.name}
          </span>
        ) : (
          <span className="text-gray-400 italic text-xs">
            {t("locationUnknown")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100 text-xs text-gray-500">
        <UserIcon className="size-3.5 shrink-0" />
        <span>{item.ownerName}</span>
      </div>
    </div>
  );
}
