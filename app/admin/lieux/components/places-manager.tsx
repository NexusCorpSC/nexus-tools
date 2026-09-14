"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  MagnifyingGlassIcon,
  PencilIcon,
  MapIcon,
} from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePlaceSearch } from "@/app/lieux/use-place-search";
import { placeTrail } from "@/lib/place-icons";

/** La liste d'administration : chercher un lieu, puis l'ouvrir pour l'éditer. */
export function PlacesManager() {
  const t = useTranslations("Places");
  const [query, setQuery] = useState("");
  const { results, isLoading } = usePlaceSearch({ query, limit: 40 });

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

      {isLoading && (
        <p className="text-sm text-muted-foreground">{t("Admin.searching")}</p>
      )}

      {!isLoading && results.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("Admin.noResults")}</p>
      )}

      <div className="divide-y divide-[#9ED0FF]/10 overflow-hidden rounded-xl border border-[#9ED0FF]/15">
        {results.map((place) => (
          <div
            key={place.slug}
            className="flex flex-wrap items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/5"
          >
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
    </div>
  );
}
