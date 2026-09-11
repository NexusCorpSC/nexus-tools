"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowRightIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ImageCover } from "@/components/image-cover";
import { cn } from "@/lib/utils";
import { MAX_COMPARE_ITEMS, type ItemSummary } from "@/types/items";
import { useItemSearch } from "../use-item-search";

/**
 * Ouvre une comparaison depuis une fiche : l'objet courant occupe la première
 * colonne, la barre de recherche va chercher n'importe quel autre objet du
 * même type — la liste s'ouvre sur sa classe, on en sort en tapant.
 */
export function ItemCompareButton({
  item,
  accent,
}: {
  item: Pick<ItemSummary, "slug" | "name" | "kind" | "category">;
  accent: string;
}) {
  const t = useTranslations("Items.Compare");
  const tItems = useTranslations("Items");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ItemSummary[]>([]);

  const { results, isLoading } = useItemSearch({
    kind: item.kind,
    category: item.category,
    query,
    enabled: open,
  });

  const pickedSlugs = picked.map((entry) => entry.slug);
  const candidates = results.filter((entry) => entry.slug !== item.slug);
  // La fiche courante compte pour une colonne : elle mange une place.
  const isFull = picked.length >= MAX_COMPARE_ITEMS - 1;

  const toggle = (candidate: ItemSummary) => {
    setPicked((current) => {
      if (current.some((entry) => entry.slug === candidate.slug)) {
        return current.filter((entry) => entry.slug !== candidate.slug);
      }
      if (current.length >= MAX_COMPARE_ITEMS - 1) return current;
      return [...current, candidate];
    });
  };

  const launch = () => {
    if (picked.length === 0) return;
    setOpen(false);
    router.push(`/items/compare?ids=${[item.slug, ...pickedSlugs].join(",")}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold transition-colors hover:bg-white/10"
          style={{ borderColor: accent, color: accent }}
        >
          <ViewColumnsIcon className="size-4" />
          {t("compareAction")}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-nexus-primary">
          {t("compareWith")}
        </p>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-nexus/60">
          {t("sameKindOnly", { kind: tItems(`kinds.${item.kind}`) })}
        </p>

        <div className="relative mb-2">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-8 text-sm shadow-xs transition-[color,box-shadow] placeholder:text-muted-foreground focus:border-ring focus:ring-1 focus:ring-ring focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={tItems("filterReset")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <XMarkIcon className="size-4" />
            </button>
          )}
        </div>

        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {candidates.map((candidate) => {
            const selected = pickedSlugs.includes(candidate.slug);
            const disabled = isFull && !selected;

            return (
              <button
                key={candidate.slug}
                type="button"
                onClick={() => toggle(candidate)}
                disabled={disabled}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition-colors",
                  selected
                    ? "bg-white/[0.06]"
                    : "border-[#9ED0FF]/15 bg-white/[0.02]",
                  disabled
                    ? "cursor-not-allowed opacity-45"
                    : "hover:bg-white/[0.06]",
                )}
                style={selected ? { borderColor: accent } : undefined}
              >
                <span
                  className="flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border"
                  style={
                    selected
                      ? { backgroundColor: accent, borderColor: accent }
                      : { borderColor: "rgba(158,208,255,0.45)" }
                  }
                >
                  {selected && (
                    <CheckIcon className="size-3 stroke-[3] text-[#0B2030]" />
                  )}
                </span>
                <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
                  <ImageCover
                    imageUrl={candidate.imageUrl}
                    name={candidate.name}
                    width={64}
                    height={64}
                    className="h-full object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-nexus-primary">
                    {candidate.name}
                  </span>
                  <span className="block truncate text-xs text-nexus/60">
                    {[candidate.category, candidate.subcategory]
                      .filter(Boolean)
                      .join(" › ")}
                  </span>
                </span>
              </button>
            );
          })}

          {candidates.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-nexus/65">
              {isLoading ? t("searchLoading") : t("searchEmpty")}
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="flex-1 text-xs text-nexus/60">
            {isFull
              ? t("limitReached")
              : picked.length === 0
                ? t("pickAtLeastOne")
                : t("columnsCount", {
                    count: picked.length + 1,
                    max: MAX_COMPARE_ITEMS,
                  })}
          </span>
          <button
            type="button"
            onClick={launch}
            disabled={picked.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {picked.length > 0
              ? t("compareCount", { count: picked.length + 1 })
              : t("compareAction")}
            <ArrowRightIcon className="size-3.5" />
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
