"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Les clés de l'adresse que lisent les filtres de la marketplace. */
const FILTER_KEYS = [
  "q",
  "type",
  "category",
  "system",
  "min",
  "max",
  "size",
  "stock",
  "sort",
] as const;

const SELECT =
  "h-9 rounded-md border border-[#9ED0FF]/30 bg-[#092F49]/60 px-2 text-sm text-[#C9E4FF]";
const CHIP =
  "inline-flex h-8 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors";
const CHIP_ON = "border-[#CCE7FF] bg-[#CCE7FF] font-semibold text-[#062338]";
const CHIP_OFF = "border-[#9ED0FF]/20 text-[#C9E4FF] hover:border-[#9ED0FF]/50";
const EYEBROW =
  "text-xs font-semibold tracking-wider text-[#9ED0FF]/70 uppercase";

/**
 * Les filtres vivent dans l'adresse : la page serveur les relit, et un
 * retour depuis une fiche retrouve la liste telle qu'elle était.
 */
function useFilterUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function apply(values: Record<string, string>) {
    // L'adresse du moment, pas celle du rendu : une recherche en attente ne
    // doit pas effacer un filtre choisi entre-temps.
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    // Un filtre qui change ramène à la première page.
    params.delete("page");
    const search = params.toString();
    startTransition(() => {
      router.replace(search ? `${pathname}?${search}` : pathname, {
        scroll: false,
      });
    });
  }

  return { searchParams, apply, isPending };
}

/** La recherche et le tri, au-dessus de la liste. */
export function ListingSearchBar() {
  const t = useTranslations("Shopping");
  const { searchParams, apply, isPending } = useFilterUrl();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  // La recherche part après une courte pause dans la frappe.
  useEffect(() => {
    if ((searchParams.get("q") ?? "") === query.trim()) return;
    const timer = setTimeout(() => apply({ q: query.trim() }), 300);
    return () => clearTimeout(timer);
    // `apply` change à chaque rendu ; seule la frappe doit relancer l'attente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        isPending && "opacity-70",
      )}
    >
      <div className="relative min-w-[220px] flex-[1_1_280px]">
        <MagnifyingGlassIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#9ED0FF]/60"
        />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          className="pl-8"
        />
      </div>
      <select
        aria-label={t("sortLabel")}
        className={SELECT}
        value={searchParams.get("sort") ?? ""}
        onChange={(event) => apply({ sort: event.target.value })}
      >
        <option value="">{t("sorts.recent")}</option>
        <option value="priceAsc">{t("sorts.priceAsc")}</option>
        <option value="priceDesc">{t("sorts.priceDesc")}</option>
      </select>
    </div>
  );
}

/** Une puce par catégorie du catalogue, plus les services. */
export function CategoryChips({ categories }: { categories: string[] }) {
  const t = useTranslations("Shopping");
  const { searchParams, apply } = useFilterUrl();
  const category = searchParams.get("category") ?? "";
  const services = searchParams.get("type") === "SERVICE";

  const chips = [
    {
      key: "all",
      label: t("allCategories"),
      on: !category && !services,
      values: { category: "", type: "" },
    },
    ...categories.map((entry) => ({
      key: entry,
      label: entry,
      on: category === entry,
      values: { category: entry, type: "" },
    })),
    {
      key: "services",
      label: t("types.SERVICE"),
      on: services,
      values: { category: "", type: "SERVICE" },
    },
  ];

  return (
    <div className="flex flex-wrap gap-2" aria-label={t("filterCategory")}>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-pressed={chip.on}
          className={cn(CHIP, chip.on ? CHIP_ON : CHIP_OFF)}
          onClick={() => apply(chip.values)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

/** La colonne de filtres : disponibilité, lieu de remise, prix, taille. */
export function FacetSidebar({
  systems,
  sizes,
}: {
  systems: string[];
  sizes: number[];
}) {
  const t = useTranslations("Shopping");
  const { searchParams, apply, isPending } = useFilterUrl();
  const [min, setMin] = useState(searchParams.get("min") ?? "");
  const [max, setMax] = useState(searchParams.get("max") ?? "");

  const inStockOnly = searchParams.get("stock") !== "all";
  const directOnly = searchParams.get("type") === "OBJECT";
  const chosenSystems = (searchParams.get("system") ?? "")
    .split(",")
    .filter(Boolean);
  const size = searchParams.get("size") ?? "";
  const filtered = FILTER_KEYS.some(
    (key) => key !== "sort" && key !== "q" && searchParams.get(key),
  );

  function toggleSystem(system: string) {
    const next = chosenSystems.includes(system)
      ? chosenSystems.filter((entry) => entry !== system)
      : [...chosenSystems, system];
    apply({ system: next.join(",") });
  }

  return (
    <div
      className={cn(
        "space-y-5 text-sm transition-opacity",
        isPending && "opacity-70",
      )}
    >
      <fieldset className="space-y-2">
        <legend className={cn(EYEBROW, "mb-2")}>
          {t("facetAvailability")}
        </legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={() => apply({ stock: inStockOnly ? "all" : "" })}
          />
          {t("inStockOnly")}
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={directOnly}
            onChange={() => apply({ type: directOnly ? "" : "OBJECT" })}
          />
          {t("directOnly")}
        </label>
      </fieldset>

      {systems.length > 0 && (
        <fieldset className="space-y-2">
          <legend className={cn(EYEBROW, "mb-2")}>{t("facetPickup")}</legend>
          {systems.map((system) => (
            <label key={system} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={chosenSystems.includes(system)}
                onChange={() => toggleSystem(system)}
              />
              {system}
            </label>
          ))}
        </fieldset>
      )}

      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply({ min: min.trim(), max: max.trim() });
        }}
      >
        <p className={EYEBROW}>{t("facetPrice")}</p>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={min}
            onChange={(event) => setMin(event.target.value)}
            onBlur={() => apply({ min: min.trim() })}
            placeholder={t("priceMin")}
            aria-label={t("priceMin")}
            className="h-9"
          />
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={max}
            onChange={(event) => setMax(event.target.value)}
            onBlur={() => apply({ max: max.trim() })}
            placeholder={t("priceMax")}
            aria-label={t("priceMax")}
            className="h-9"
          />
        </div>
      </form>

      {sizes.length > 0 && (
        <div className="space-y-2">
          <p className={EYEBROW}>{t("facetSize")}</p>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((entry) => {
              const on = size === String(entry);
              return (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={on}
                  className={cn(
                    CHIP,
                    "h-7 px-2.5 font-mono",
                    on ? CHIP_ON : CHIP_OFF,
                  )}
                  onClick={() => apply({ size: on ? "" : String(entry) })}
                >
                  S{entry}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {filtered && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setMin("");
            setMax("");
            apply(
              Object.fromEntries(
                FILTER_KEYS.filter((key) => key !== "sort" && key !== "q").map(
                  (key) => [key, ""],
                ),
              ),
            );
          }}
        >
          {t("resetFilters")}
        </Button>
      )}
    </div>
  );
}
