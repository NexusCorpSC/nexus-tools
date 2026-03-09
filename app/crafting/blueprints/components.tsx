"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { Blueprint } from "@/types/crafting";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Image from "next/image";

export function BlueprintSearch() {
  const t = useTranslations("Crafting.Blueprints");
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Blueprint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const search = useCallback(async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/blueprints?query=${encodeURIComponent(value)}`,
      );
      const data: Blueprint[] = await res.json();
      setResults(data);
      setIsOpen(true);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    search(value);
  };

  const handleSelect = (blueprint: Blueprint) => {
    setIsOpen(false);
    setQuery("");
    router.push(`/crafting/blueprints/${blueprint.slug}`);
  };

  return (
    <div className="relative w-full max-w-lg">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
        <Input
          type="search"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          placeholder={t("searchPlaceholder")}
          className="pl-9"
        />
      </div>

      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {isLoading && (
            <li className="px-4 py-3 text-sm text-gray-500">
              {t("searchLoading")}
            </li>
          )}
          {!isLoading && results.length === 0 && (
            <li className="px-4 py-3 text-sm text-gray-500">
              {t("searchNoResults")}
            </li>
          )}
          {!isLoading &&
            results.map((blueprint) => (
              <li
                key={blueprint.id}
                onMouseDown={() => handleSelect(blueprint)}
                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="shrink-0 w-10 h-10 rounded-md overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center">
                  {blueprint.imageUrl ? (
                    <Image
                      src={blueprint.imageUrl}
                      alt={blueprint.name}
                      width={40}
                      height={40}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-300 text-lg font-bold select-none">
                      {blueprint.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {blueprint.name}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {blueprint.category}
                  </p>
                  {blueprint.owned && (
                    <span className="inline-block mt-0.5 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                      {t("owned")}
                    </span>
                  )}
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
