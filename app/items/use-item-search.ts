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
  const params = new URLSearchParams({ kind, limit: String(limit) });
  const trimmed = query.trim();
  if (trimmed) params.set("query", trimmed);
  else if (category) params.set("category", category);
  const search = params.toString();

  // La recherche affichée est celle qui a été servie : l'attente se déduit de
  // l'écart entre les deux, plutôt que d'un drapeau qu'un sélecteur refermé
  // en pleine requête laisserait allumé pour toujours.
  const [served, setServed] = useState<{
    search: string | null;
    items: ItemSummary[];
  }>({ search: null, items: [] });

  useEffect(() => {
    if (!enabled) return;

    // Une réponse lente ne doit jamais écraser le résultat d'une frappe plus
    // récente : le nettoyage de l'effet la rend caduque.
    let current = true;

    const timer = setTimeout(() => {
      fetch(`/api/items?${search}`)
        .then((response) => response.json())
        .then((data: ItemListResponse) => {
          if (current) setServed({ search, items: data.items ?? [] });
        })
        .catch(() => {
          if (current) setServed({ search, items: [] });
        });
    }, 250);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [search, enabled]);

  return {
    results: served.items,
    isLoading: enabled && served.search !== search,
  };
}
