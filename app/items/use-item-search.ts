"use client";

import { useEffect, useState } from "react";
import type { ItemListResponse, ItemSummary } from "@/types/items";

/**
 * Recherche debouncée dans le catalogue, bornée à un type d'objet : ce qu'un
 * comparateur peut mettre dans la colonne suivante. Sans texte saisi, la
 * catégorie de départ sert de proposition — c'est presque toujours là que se
 * trouve l'objet cherché ; dès qu'on tape, tout le type redevient accessible.
 */
export function useItemSearch({
  kind,
  category,
  query,
  enabled = true,
  limit = 12,
}: {
  kind: string;
  category?: string;
  query: string;
  enabled?: boolean;
  limit?: number;
}): { results: ItemSummary[]; isLoading: boolean } {
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return;

    const params = new URLSearchParams({ kind, limit: String(limit) });
    const trimmed = query.trim();
    if (trimmed) params.set("query", trimmed);
    else if (category) params.set("category", category);

    // Une réponse lente ne doit jamais écraser le résultat d'une frappe plus
    // récente : le nettoyage de l'effet la rend caduque.
    let current = true;

    const timer = setTimeout(() => {
      setIsLoading(true);
      fetch(`/api/items?${params.toString()}`)
        .then((response) => response.json())
        .then((data: ItemListResponse) => {
          if (current) setResults(data.items ?? []);
        })
        .catch(() => {
          if (current) setResults([]);
        })
        .finally(() => {
          if (current) setIsLoading(false);
        });
    }, 250);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [kind, category, query, enabled, limit]);

  return { results, isLoading };
}
