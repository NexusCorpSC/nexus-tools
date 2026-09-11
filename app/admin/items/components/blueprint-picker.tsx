"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type BlueprintOption = { slug: string; name: string };

/**
 * Links an item to the blueprints crafting it. Blueprints are referenced by
 * slug — the identifier their own pages are served under.
 */
export function BlueprintPicker({
  value,
  onChange,
}: {
  value: BlueprintOption[];
  onChange: (blueprints: BlueprintOption[]) => void;
}) {
  const t = useTranslations("Items.Admin");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<BlueprintOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/blueprints?query=${encodeURIComponent(query.trim())}&limit=8`,
        );
        const data: { blueprints: BlueprintOption[] } = await response.json();
        setSuggestions(data.blueprints ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const add = (blueprint: BlueprintOption) => {
    if (!value.some((entry) => entry.slug === blueprint.slug)) {
      onChange([...value, blueprint]);
    }
    setQuery("");
    setSuggestions([]);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="blueprint-search">{t("fieldBlueprints")}</Label>
      <p className="text-xs text-nexus">{t("fieldBlueprintsHint")}</p>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((blueprint) => (
            <span
              key={blueprint.slug}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
            >
              {blueprint.name}
              <button
                type="button"
                aria-label={t("removeBlueprint")}
                onClick={() =>
                  onChange(
                    value.filter((entry) => entry.slug !== blueprint.slug),
                  )
                }
                className="hover:text-primary/60 transition-colors"
              >
                <XMarkIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <Input
          id="blueprint-search"
          value={query}
          autoComplete="off"
          placeholder={t("blueprintSearchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
        {suggestions.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-md overflow-auto max-h-48">
            {suggestions.map((blueprint) => (
              <button
                key={blueprint.slug}
                type="button"
                onClick={() => add(blueprint)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                {blueprint.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {blueprint.slug}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {isSearching && <p className="text-xs text-nexus">{t("searching")}</p>}
    </div>
  );
}
