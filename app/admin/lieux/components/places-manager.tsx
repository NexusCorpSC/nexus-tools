"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  MagnifyingGlassIcon,
  PencilIcon,
  MapIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePlaceSearch } from "@/app/lieux/use-place-search";
import { placeTrail } from "@/lib/place-icons";
import { MAX_BULK_IMAGE_PLACES, MAX_PLACE_PAGE_SIZE } from "@/types/places";
import type { PlaceSummary } from "@/types/places";
import { BulkImageDialog } from "./bulk-image-dialog";

/**
 * La liste d'administration : chercher un lieu, puis l'ouvrir pour l'éditer.
 * Les cases à cocher composent une sélection qui survit aux recherches — on
 * cherche « Breaker », on coche tout, on cherche autre chose et on ajoute —,
 * à laquelle on pose ensuite une même image.
 */
export function PlacesManager() {
  const t = useTranslations("Places");
  const [query, setQuery] = useState("");
  const { results, total, isLoading } = usePlaceSearch({
    query,
    limit: MAX_PLACE_PAGE_SIZE,
  });
  const [selected, setSelected] = useState<Map<string, PlaceSummary>>(
    () => new Map(),
  );
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
  // Les images posées depuis l'ouverture de la page. La liste n'est pas
  // rechargée après coup : sans elles, un lieu recoché garderait l'image
  // d'avant, et la confirmation suivante tairait qu'elle va la remplacer.
  const [applied, setApplied] = useState<Map<string, string>>(() => new Map());

  function withApplied(place: PlaceSummary): PlaceSummary {
    const imageUrl = applied.get(place.slug);
    return imageUrl ? { ...place, imageUrl } : place;
  }

  const allShownSelected =
    results.length > 0 && results.every((place) => selected.has(place.slug));
  const tooMany = selected.size > MAX_BULK_IMAGE_PLACES;

  function toggle(place: PlaceSummary) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(place.slug)) next.delete(place.slug);
      else next.set(place.slug, withApplied(place));
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((current) => {
      const next = new Map(current);
      for (const place of results) {
        if (allShownSelected) next.delete(place.slug);
        else next.set(place.slug, withApplied(place));
      }
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-md">
        <label htmlFor="admin-place-search" className="sr-only">
          {t("Admin.searchPlaceholder")}
        </label>
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="admin-place-search"
          type="search"
          className="pl-9"
          value={query}
          placeholder={t("Admin.searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#9ED0FF]/25 bg-white/5 px-3 py-2">
          <span className="flex-1 text-sm text-nexus">
            {t("Admin.bulkSelected", { count: selected.size })}
            {tooMany && (
              <span className="block text-xs text-red-400">
                {t("Admin.bulkTooMany", { max: MAX_BULK_IMAGE_PLACES })}
              </span>
            )}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Map())}
          >
            {t("Admin.bulkClear")}
          </Button>
          <Button
            size="sm"
            disabled={tooMany}
            onClick={() => setIsImageDialogOpen(true)}
          >
            <PhotoIcon className="size-4" />
            {t("Admin.bulkSetImage")}
          </Button>
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">{t("Admin.searching")}</p>
      )}

      {!isLoading && results.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("Admin.noResults")}</p>
      )}

      {!isLoading && results.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-3 text-xs text-muted-foreground">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-[#C2E2FF]"
              checked={allShownSelected}
              onChange={toggleAllShown}
            />
            {t("Admin.bulkSelectShown", { count: results.length })}
          </label>
          {total > results.length && (
            <span>
              {t("Admin.bulkTruncated", { shown: results.length, total })}
            </span>
          )}
        </div>
      )}

      <div className="divide-y divide-[#9ED0FF]/10 overflow-hidden rounded-xl border border-[#9ED0FF]/15">
        {results.map((place) => (
          <div
            key={place.slug}
            className="flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5"
          >
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-[#C2E2FF]"
              checked={selected.has(place.slug)}
              onChange={() => toggle(place)}
              aria-label={t("Admin.bulkSelectOne", { name: place.name })}
            />

            <Link
              href={`/lieux/${place.slug}`}
              className="min-w-0 flex-1 text-nexus hover:text-white"
            >
              <span className="block truncate text-sm font-semibold">
                {place.name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[t(`types.${place.type}`), placeTrail(place)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </Link>

            <span className="shrink-0 text-xs text-muted-foreground">
              {t("plansCount", { count: place.planCount })}
            </span>

            <div className="flex shrink-0 items-center gap-1">
              <Button asChild variant="ghost" size="icon-sm">
                <Link
                  href={`/admin/lieux/${place.slug}/edit`}
                  aria-label={t("Admin.edit")}
                >
                  <PencilIcon className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="icon-sm">
                <Link
                  href={`/admin/lieux/${place.slug}/plans`}
                  aria-label={t("Admin.editPlans")}
                >
                  <MapIcon className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
        ))}
      </div>

      <BulkImageDialog
        open={isImageDialogOpen}
        onOpenChange={setIsImageDialogOpen}
        places={[...selected.values()]}
        onApplied={(slugs, imageUrl) => {
          setApplied((before) => {
            const next = new Map(before);
            for (const slug of slugs) next.set(slug, imageUrl);
            return next;
          });
          setSelected(new Map());
        }}
      />
    </div>
  );
}
