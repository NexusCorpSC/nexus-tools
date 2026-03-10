"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Blueprint } from "@/types/crafting";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { InputGroupAddon, InputGroupText } from "@/components/ui/input-group";

export function BlueprintSearch() {
  const t = useTranslations("Crafting.Blueprints");
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Blueprint[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const search = useCallback(async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/blueprints?query=${encodeURIComponent(value)}`,
      );
      const data: Blueprint[] = await res.json();
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <div className="w-full max-w-lg">
      <Combobox
        value={null}
        onValueChange={(slug) => {
          if (slug) {
            setQuery("");
            setResults([]);
            router.push(`/crafting/blueprints/${slug}`);
          }
        }}
      >
        <ComboboxInput
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          showTrigger={false}
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            search(v);
          }}
        >
          <InputGroupAddon align="inline-start">
            <InputGroupText>
              <MagnifyingGlassIcon className="size-4" />
            </InputGroupText>
          </InputGroupAddon>
        </ComboboxInput>

        {query.trim() && (
          <ComboboxContent>
            <ComboboxList>
              <ComboboxEmpty>
                {isLoading
                  ? t("searchLoading")
                  : results.length > 0
                    ? null
                    : t("searchNoResults")}
              </ComboboxEmpty>
              {!isLoading &&
                results.map((blueprint) => (
                  <ComboboxItem key={blueprint.id} value={blueprint.slug}>
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 w-10 h-10 rounded-md overflow-hidden border border-border bg-muted flex items-center justify-center">
                        {blueprint.imageUrl ? (
                          <Image
                            src={blueprint.imageUrl}
                            alt={blueprint.name}
                            width={40}
                            height={40}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-muted-foreground text-lg font-bold select-none">
                            {blueprint.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {blueprint.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {blueprint.category}
                        </p>
                        {blueprint.owned && (
                          <span className="inline-block mt-0.5 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                            {t("owned")}
                          </span>
                        )}
                      </div>
                    </div>
                  </ComboboxItem>
                ))}
            </ComboboxList>
          </ComboboxContent>
        )}
      </Combobox>
    </div>
  );
}
