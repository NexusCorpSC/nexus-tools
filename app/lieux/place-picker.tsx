"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { usePlaceSearch } from "@/app/lieux/use-place-search";
import { placeTrail } from "@/lib/place-icons";
import type { PlaceSummary } from "@/types/places";

/**
 * Choisit un lieu par son nom, et rend la fiche entière. Rendre le seul slug
 * obligerait l'appelant à deviner le reste — et le type d'un lieu décide de
 * l'allure de sa pastille sur un plan.
 */
export function PlacePicker({
  value,
  valueLabel,
  onChange,
  exclude,
  placeholder,
}: {
  value?: string;
  valueLabel?: string;
  onChange: (place: PlaceSummary | undefined) => void;
  exclude?: string;
  placeholder?: string;
}) {
  const t = useTranslations("Places");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { results, isLoading } = usePlaceSearch({
    query,
    enabled: open,
    exclude,
  });

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm">
          {valueLabel ?? value}
        </span>
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={t("Admin.cancel")}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-white/10 hover:text-nexus"
        >
          <XMarkIcon className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={query}
        placeholder={placeholder ?? t("Admin.searchPlaceholder")}
        autoComplete="off"
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-[#9ED0FF]/20 bg-nexus-bg py-1 shadow-md">
          {isLoading && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("Admin.searching")}
            </p>
          )}
          {!isLoading && results.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              {t("Admin.noResults")}
            </p>
          )}
          {results.map((place) => (
            <button
              key={place.slug}
              type="button"
              onClick={() => {
                onChange(place);
                setQuery("");
                setOpen(false);
              }}
              className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-white/10"
            >
              <span className="text-sm font-medium">{place.name}</span>
              <span className="text-xs text-muted-foreground">
                {[t(`types.${place.type}`), placeTrail(place)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
