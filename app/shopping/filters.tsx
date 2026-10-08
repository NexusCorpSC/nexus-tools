"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SELECT =
  "h-9 rounded-md border border-[#9ED0FF]/30 bg-[#092F49]/60 px-2 text-sm text-[#C9E4FF]";

/**
 * Les filtres de la marketplace. Ils vivent dans l'adresse : la page serveur
 * relit `q`, `type`, `category`, `system` et `sort`, et un retour depuis une
 * fiche retrouve la liste telle qu'elle était.
 */
export function ListingFilters({
  categories,
  systems,
}: {
  categories: string[];
  systems: string[];
}) {
  const t = useTranslations("Shopping");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

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

  // La recherche part après une courte pause dans la frappe.
  useEffect(() => {
    if ((searchParams.get("q") ?? "") === query.trim()) return;
    const timer = setTimeout(() => apply({ q: query.trim() }), 300);
    return () => clearTimeout(timer);
    // `apply` change à chaque rendu ; seule la frappe doit relancer l'attente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const type = searchParams.get("type") ?? "";
  const category = searchParams.get("category") ?? "";
  const system = searchParams.get("system") ?? "";
  const sort = searchParams.get("sort") ?? "";
  const filtered = !!(searchParams.get("q") || type || category || system);

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
        aria-label={t("filterType")}
        className={SELECT}
        value={type}
        onChange={(event) => apply({ type: event.target.value })}
      >
        <option value="">{t("allTypes")}</option>
        <option value="OBJECT">{t("types.OBJECT")}</option>
        <option value="SERVICE">{t("types.SERVICE")}</option>
      </select>

      {categories.length > 0 && (
        <select
          aria-label={t("filterCategory")}
          className={SELECT}
          value={category}
          onChange={(event) => apply({ category: event.target.value })}
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      )}

      {systems.length > 0 && (
        <select
          aria-label={t("filterSystem")}
          className={SELECT}
          value={system}
          onChange={(event) => apply({ system: event.target.value })}
        >
          <option value="">{t("allSystems")}</option>
          {systems.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      )}

      <select
        aria-label={t("sortLabel")}
        className={SELECT}
        value={sort}
        onChange={(event) => apply({ sort: event.target.value })}
      >
        <option value="">{t("sorts.recent")}</option>
        <option value="priceAsc">{t("sorts.priceAsc")}</option>
        <option value="priceDesc">{t("sorts.priceDesc")}</option>
      </select>

      {filtered && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setQuery("");
            apply({ q: "", type: "", category: "", system: "" });
          }}
        >
          {t("resetFilters")}
        </Button>
      )}
    </div>
  );
}
