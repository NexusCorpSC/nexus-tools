"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Blueprint } from "@/types/crafting";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

export function BlueprintNameInput() {
  const [value, setValue] = useState("");
  const [suggestions, setSuggestions] = useState<Blueprint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/blueprints?query=${encodeURIComponent(value)}&fuzzy=true`,
        );
        const data: Blueprint[] = await res.json();
        setSuggestions(data);
      } catch {
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  return (
    <div className="space-y-3">
      <Input
        id="name"
        name="name"
        required
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
      />
      {isLoading && (
        <p className="text-xs text-gray-400">Recherche en cours…</p>
      )}
      {!isLoading && suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-amber-600">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <p className="text-xs font-medium">
              Ces blueprints semblent correspondre à ce nom. Évitez les
              doublons.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((bp) => (
              <Link
                key={bp.id}
                href={`/crafting/blueprints/${bp.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 hover:border-amber-400 hover:bg-amber-50 transition-colors group"
              >
                <p className="text-sm font-semibold text-gray-900 group-hover:text-amber-700 leading-tight">
                  {bp.name}
                </p>
                {bp.category && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {bp.subcategory
                      ? `${bp.category} › ${bp.subcategory}`
                      : bp.category}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
