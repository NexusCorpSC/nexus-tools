"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { useItemSearch } from "./use-item-search";

export type PickedItem = { slug: string; name: string };

/**
 * Choisit plusieurs objets du catalogue par leur nom : ce que vend un magasin.
 * Les objets choisis s'affichent en pastilles, retirables une à une.
 */
export function ItemMultiPicker({
  value,
  onChange,
  max,
  placeholder,
}: {
  value: PickedItem[];
  onChange: (items: PickedItem[]) => void;
  max?: number;
  placeholder?: string;
}) {
  const t = useTranslations("Places");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { results, isLoading } = useItemSearch({
    query,
    enabled: open && query.trim().length > 0,
  });
  const chosen = new Set(value.map((item) => item.slug));
  const full = max !== undefined && value.length >= max;

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li
              key={item.slug}
              className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/25 bg-white/5 py-0.5 pl-2.5 pr-1 text-xs"
            >
              {item.name}
              <button
                type="button"
                onClick={() =>
                  onChange(value.filter((entry) => entry.slug !== item.slug))
                }
                aria-label={t("Admin.cancel")}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-nexus"
              >
                <XMarkIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <div ref={containerRef} className="relative">
          <Input
            value={query}
            placeholder={placeholder}
            autoComplete="off"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />

          {open && query.trim() && (
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
              {results
                .filter((item) => !chosen.has(item.slug))
                .map((item) => (
                  <button
                    key={item.slug}
                    type="button"
                    onClick={() => {
                      onChange([
                        ...value,
                        { slug: item.slug, name: item.name },
                      ]);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex w-full flex-col items-start px-3 py-2 text-left transition-colors hover:bg-white/10"
                  >
                    <span className="text-sm font-medium">{item.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[item.category, item.subcategory]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
