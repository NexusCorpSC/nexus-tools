"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import Image from "next/image";
import {
  UserGroupIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  XCircleIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { BlueprintOrgMember } from "@/lib/crafting";
import {
  deleteBlueprintAction,
  findInventoryForRecipe,
  craftFromInventory,
  type InventoryComponentMatch,
  type QualityMode,
} from "@/app/crafting/blueprints/actions";
import { BlueprintRecipeStep } from "@/types/crafting";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Org = { id: string; name: string };

type Props = {
  blueprintId: string;
  organizations: Org[];
  sectionTitle: string;
  selectPlaceholder: string;
  emptyLabel: string;
  loadingLabel: string;
  noOrgsLabel: string;
};

export function BlueprintOrgOwnersClient({
  blueprintId,
  organizations,
  sectionTitle,
  selectPlaceholder,
  emptyLabel,
  loadingLabel,
  noOrgsLabel,
}: Props) {
  const firstOrgId = organizations[0]?.id ?? "";
  const [selectedOrgId, setSelectedOrgId] = useState<string>(firstOrgId);
  const [members, setMembers] = useState<BlueprintOrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchMembers = useCallback(
    async (orgId: string) => {
      if (!orgId) {
        setMembers([]);
        setHasFetched(false);
        return;
      }
      setIsLoading(true);
      setHasFetched(false);
      try {
        const res = await fetch(
          `/api/blueprints/${blueprintId}/org-owners?orgId=${encodeURIComponent(orgId)}`,
        );
        const data: BlueprintOrgMember[] = await res.json();
        setMembers(data);
      } catch {
        setMembers([]);
      } finally {
        setIsLoading(false);
        setHasFetched(true);
      }
    },
    [blueprintId],
  );

  // Fetch automatiquement au montage pour la première organisation
  useEffect(() => {
    if (firstOrgId) {
      fetchMembers(firstOrgId);
    }
  }, [firstOrgId, fetchMembers]);

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    fetchMembers(orgId);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserGroupIcon className="size-5 text-gray-500 shrink-0" />
        <h2 className="text-sm font-semibold text-gray-700">{sectionTitle}</h2>
      </div>

      {organizations.length === 0 ? (
        <p className="text-sm text-gray-500">{noOrgsLabel}</p>
      ) : (
        <>
          <select
            value={selectedOrgId}
            onChange={(e) => handleOrgChange(e.target.value)}
            className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          {isLoading && (
            <p className="text-sm text-gray-400 animate-pulse">
              {loadingLabel}
            </p>
          )}

          {!isLoading && hasFetched && members.length === 0 && (
            <p className="text-sm text-gray-500">{emptyLabel}</p>
          )}

          {!isLoading && members.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 py-2"
                >
                  <Image
                    src={member.avatar || "/avatar_empty.png"}
                    alt={member.name}
                    width={32}
                    height={32}
                    className="rounded-full size-8 object-cover"
                  />
                  <span className="text-sm font-medium text-gray-800">
                    {member.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

type AdminBlueprintMenuProps = {
  blueprintId: string;
  blueprintSlug: string;
  labels: {
    menuLabel: string;
    edit: string;
    delete: string;
    deleteConfirmTitle: string;
    deleteConfirmDescription: string;
    deleteConfirmCancel: string;
    deleteConfirmConfirm: string;
  };
};

export function AdminBlueprintMenu({
  blueprintId,
  blueprintSlug,
  labels,
}: AdminBlueprintMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteBlueprintAction(blueprintId);
  };

  return (
    <div className="relative">
      <button
        aria-label={labels.menuLabel}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
      >
        <EllipsisVerticalIcon className="size-5 text-gray-500" />
      </button>

      {open && (
        <>
          {/* Overlay to close on outside click */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-gray-200 bg-white shadow-md py-1">
            <Link
              href={`/crafting/blueprints/${blueprintSlug}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              <PencilIcon className="size-4 text-gray-500" />
              {labels.edit}
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <TrashIcon className="size-4" />
              {labels.delete}
            </button>
          </div>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.deleteConfirmTitle}</DialogTitle>
            <DialogDescription>
              {labels.deleteConfirmDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                {labels.deleteConfirmCancel}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "..." : labels.deleteConfirmConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function selectedTotalForComponent(
  match: InventoryComponentMatch,
  checkedIds: string[],
): number {
  return match.items
    .filter((i) => checkedIds.includes(i.id))
    .reduce((s, i) => s + i.quantity, 0);
}

function buildCraftPayload(
  matches: InventoryComponentMatch[],
  selection: Record<string, string[]>,
): { itemId: string; quantity: number }[] {
  const payload: { itemId: string; quantity: number }[] = [];
  for (const match of matches) {
    const ids = selection[match.componentName] ?? [];
    let remaining = match.requiredQuantity;
    for (const id of ids) {
      if (remaining <= 0) break;
      const item = match.items.find((i) => i.id === id);
      if (!item) continue;
      const take = Math.min(item.quantity, remaining);
      payload.push({ itemId: id, quantity: take });
      remaining -= take;
    }
  }
  return payload;
}

// ─── CraftFromInventoryClient ─────────────────────────────────────────────────

export function CraftFromInventoryClient({
  recipe,
}: {
  recipe: BlueprintRecipeStep[];
}) {
  const t = useTranslations("Crafting.Blueprints");
  const [open, setOpen] = useState(false);
  const [qualityType, setQualityType] = useState<"max" | "min" | "gte">("max");
  const [qualityValue, setQualityValue] = useState<string>("0");
  const [matches, setMatches] = useState<InventoryComponentMatch[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isCrafting, startCraftTransition] = useTransition();
  const [searchError, setSearchError] = useState<string | null>(null);
  const [craftResult, setCraftResult] = useState<{ ok: boolean; error?: string } | null>(null);
  // selection: componentName → ordered array of checked itemIds
  const [selection, setSelection] = useState<Record<string, string[]>>({});

  const performSearch = useCallback(
    (type: "max" | "min" | "gte", value: number) => {
      const mode: QualityMode = type === "gte" ? { type: "gte", value } : { type };
      startTransition(async () => {
        const res = await findInventoryForRecipe(recipe, mode);
        if (res.ok && res.matches) {
          setMatches(res.matches);
          setSearchError(null);
          setCraftResult(null);
        } else {
          setSearchError(res.error ?? "Error");
        }
      });
    },
    [recipe],
  );

  // Auto-initialize selection when matches change (all items checked by default)
  useEffect(() => {
    if (!matches) return;
    const init: Record<string, string[]> = {};
    for (const match of matches) {
      init[match.componentName] = match.items.map((i) => i.id);
    }
    setSelection(init);
  }, [matches]);

  // Auto-search when section opens or quality type changes
  useEffect(() => {
    if (!open) return;
    if (qualityType !== "gte") {
      performSearch(qualityType, 0);
    } else {
      performSearch("gte", parseInt(qualityValue) || 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, qualityType]);

  // Debounced re-search when the gte value changes
  useEffect(() => {
    if (!open || qualityType !== "gte") return;
    const timer = setTimeout(
      () => performSearch("gte", parseInt(qualityValue) || 0),
      400,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qualityValue]);

  const toggleItem = (componentName: string, itemId: string) => {
    setSelection((prev) => {
      const current = prev[componentName] ?? [];
      const next = current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId];
      return { ...prev, [componentName]: next };
    });
  };

  const canCraft =
    matches !== null &&
    matches.length > 0 &&
    matches.every((match) => {
      const selTotal = selectedTotalForComponent(match, selection[match.componentName] ?? []);
      return selTotal >= match.requiredQuantity;
    });

  const handleCraft = () => {
    if (!matches) return;
    const payload = buildCraftPayload(matches, selection);
    startCraftTransition(async () => {
      const res = await craftFromInventory(payload);
      setCraftResult(res);
      if (res.ok) {
        // Re-fetch to reflect updated stock
        performSearch(qualityType, parseInt(qualityValue) || 0);
      }
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
        <WrenchScrewdriverIcon className="size-4" />
        {t("craftTitle")}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <WrenchScrewdriverIcon className="size-5 text-indigo-600" />
          <h3 className="font-semibold text-gray-900">{t("craftTitle")}</h3>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Quality mode selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {t("craftQualityTitle")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {(["max", "min", "gte"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setQualityType(type)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                qualityType === type
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              {type === "max"
                ? t("craftQualityMax")
                : type === "min"
                  ? t("craftQualityMin")
                  : t("craftQualityGte")}
            </button>
          ))}
          {qualityType === "gte" && (
            <Input
              type="number"
              min={0}
              value={qualityValue}
              onChange={(e) => setQualityValue(e.target.value)}
              className="w-28 h-8 text-sm bg-white"
              placeholder="0"
            />
          )}
        </div>
      </div>

      {/* Loading */}
      {isPending && (
        <p className="text-sm text-gray-500 animate-pulse">{t("craftSearching")}</p>
      )}

      {/* Search error */}
      {!isPending && searchError && (
        <p className="text-sm text-red-600">{searchError}</p>
      )}

      {/* Results */}
      {!isPending && matches && (
        <div className="space-y-3">
          {matches.map((match) => {
            const checkedIds = selection[match.componentName] ?? [];
            const selTotal = selectedTotalForComponent(match, checkedIds);
            const isSufficient = selTotal >= match.requiredQuantity;
            const displayUnit = match.requiredUnit ?? "";

            return (
              <div
                key={match.componentName}
                className="rounded-lg border border-gray-200 bg-white overflow-hidden"
              >
                {/* Component header */}
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800">{match.componentName}</span>
                    {match.recipeMinQuality !== undefined && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                        {t("craftMinQuality")}: {match.recipeMinQuality}
                      </span>
                    )}
                    {match.selectedQuality !== undefined && (
                      <span className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">
                        {t("craftQualityLabel")}: {match.selectedQuality}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {t("craftReq")}:{" "}
                      <span className="font-medium">
                        {match.requiredQuantity}
                        {displayUnit ? ` ${displayUnit}` : ""}
                      </span>
                    </span>
                    <span
                      className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        isSufficient
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {isSufficient ? (
                        <CheckCircleIcon className="size-3.5" />
                      ) : (
                        <XCircleIcon className="size-3.5" />
                      )}
                      {t("craftSelected")}: {selTotal}
                      {displayUnit ? ` ${displayUnit}` : ""}
                    </span>
                  </div>
                </div>

                {/* Items list with checkboxes */}
                {match.items.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">{t("craftNoItems")}</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {match.items.map((item) => {
                      const checked = checkedIds.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                            checked ? "bg-white" : "bg-gray-50/50"
                          } hover:bg-indigo-50/30`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItem(match.componentName, item.id)}
                            className="size-4 rounded accent-indigo-600 cursor-pointer shrink-0"
                          />
                          <div className="flex items-center gap-2 text-sm text-gray-600 min-w-0 flex-1">
                            <MapPinIcon className="size-4 shrink-0 text-gray-400" />
                            <span className="truncate">
                              {item.locationName ?? t("craftUnknownLocation")}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-800 shrink-0">
                            {item.quantity}
                            {item.unit
                              ? ` ${item.unit}`
                              : displayUnit
                                ? ` ${displayUnit}`
                                : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Craft result feedback */}
          {craftResult && (
            <div
              className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium ${
                craftResult.ok
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              {craftResult.ok ? (
                <CheckCircleIcon className="size-4 shrink-0" />
              ) : (
                <XCircleIcon className="size-4 shrink-0" />
              )}
              {craftResult.ok ? t("craftSuccess") : (craftResult.error ?? t("craftError"))}
            </div>
          )}

          {/* Craft button */}
          <div className="flex justify-end pt-1">
            <Button
              onClick={handleCraft}
              disabled={!canCraft || isCrafting}
              className="flex items-center gap-2"
            >
              <WrenchScrewdriverIcon className="size-4" />
              {isCrafting ? t("craftCrafting") : t("craftConfirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
