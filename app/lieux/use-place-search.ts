"use client";

import { useEffect, useState } from "react";
import type { PlaceListResponse, PlaceSummary } from "@/types/places";

/**
 * Cherche un lieu à mesure qu'on tape. Le chargement se déduit de « ce qui est
 * affiché ne correspond pas à ce qui est demandé » plutôt que d'un drapeau :
 * deux frappes rapprochées ne laissent alors jamais un résultat périmé avec
 * l'air d'être à jour.
 */
export function usePlaceSearch({
  query,
  enabled = true,
  limit = 12,
  exclude,
}: {
  query: string;
  enabled?: boolean;
  limit?: number;
  /** Le lieu en cours d'édition : il ne peut pas se contenir lui-même. */
  exclude?: string;
}) {
  const [results, setResults] = useState<PlaceSummary[]>([]);
  const [served, setServed] = useState<string | null>(null);
  const wanted = enabled ? query.trim() : null;

  useEffect(() => {
    if (!enabled) return;

    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (query.trim()) params.set("query", query.trim());

      try {
        const response = await fetch(`/api/lieux?${params.toString()}`);
        const data: PlaceListResponse = await response.json();
        setResults(
          data.places.filter((place) => !exclude || place.slug !== exclude),
        );
      } catch {
        setResults([]);
      } finally {
        setServed(query.trim());
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, enabled, limit, exclude]);

  return { results, isLoading: enabled && served !== wanted };
}
