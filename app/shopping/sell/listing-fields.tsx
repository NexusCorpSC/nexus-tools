"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useItemSearch } from "@/app/items/use-item-search";
import { LocationCombobox } from "@/app/inventory/components";
import type { ItemSummary } from "@/types/items";
import type { Location } from "@/types/inventory";

/**
 * Le nom de l'annonce et, au choix, l'objet du catalogue qu'elle vend :
 * choisir un objet reprend son nom (modifiable) et, côté serveur, son image,
 * sa catégorie, son fabricant et sa taille.
 */
export function CatalogueFields() {
  const t = useTranslations("ShoppingNewItem");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<ItemSummary | null>(null);
  const [search, setSearch] = useState("");
  const { results, isLoading } = useItemSearch({
    query: search,
    enabled: !picked && search.trim().length >= 2,
    limit: 8,
  });

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="catalogue" className="block text-sm/6 font-medium">
          {t("catalogueItem")}
        </label>
        <input type="hidden" name="itemSlug" value={picked?.slug ?? ""} />
        {picked ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/50 px-3 py-2">
            <div className="min-w-0">
              <p className="font-semibold text-[#CCE7FF]">{picked.name}</p>
              <p className="text-xs text-[#9ED0FF]/70">
                {[picked.category, picked.manufacturer]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPicked(null)}
            >
              <XMarkIcon aria-hidden="true" className="size-4" />
              {t("catalogueClear")}
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Input
              id="catalogue"
              type="search"
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("catalogueSearchPlaceholder")}
            />
            {search.trim().length >= 2 && (
              <ul className="max-h-64 overflow-y-auto rounded-md border border-[#9ED0FF]/25 bg-[#092F49]">
                {results.map((item) => (
                  <li key={item.slug}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-[#0B3A5A]"
                      onClick={() => {
                        setPicked(item);
                        setSearch("");
                        if (!name.trim()) setName(item.name);
                      }}
                    >
                      <span className="text-[#CCE7FF]">{item.name}</span>
                      <span className="text-xs text-[#9ED0FF]/70">
                        {[item.category, item.manufacturer]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  </li>
                ))}
                {!isLoading && results.length === 0 && (
                  <li className="px-3 py-2 text-sm text-[#9ED0FF]/70">
                    {t("catalogueNone")}
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
        <p className="text-sm/6 text-[#9ED0FF]/70">{t("catalogueHelp")}</p>
      </div>

      <div>
        <label htmlFor="name" className="block text-sm/6 font-medium">
          {t("itemName")}
        </label>
        <div className="mt-2">
          <Input
            id="name"
            name="name"
            type="text"
            placeholder={t("itemNamePlaceholder")}
            required
            maxLength={500}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}

/** Le lieu où l'objet sera remis, parmi les lieux de l'inventaire. */
export function PickupField({ initial }: { initial?: Location } = {}) {
  const t = useTranslations("ShoppingNewItem");
  const [location, setLocation] = useState<Location | null>(initial ?? null);

  return (
    <div className="space-y-2">
      <span className="block text-sm/6 font-medium">{t("pickup")}</span>
      <input type="hidden" name="locationId" value={location?.id ?? ""} />
      <LocationCombobox
        value={location}
        onChange={setLocation}
        placeholder={t("pickupPlaceholder")}
        aria-label={t("pickup")}
      />
      <p className="text-sm/6 text-[#9ED0FF]/70">{t("pickupHelp")}</p>
    </div>
  );
}
