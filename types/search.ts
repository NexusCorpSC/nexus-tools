/**
 * Every kind of document the generalized search (`GET /api/search`) can return.
 * The order is also the tie-breaker used when two results share a score.
 */
export const SEARCH_TYPES = [
  "blueprint",
  "mission",
  "faction",
  "shopItem",
  "shop",
  "organization",
  "cargoShip",
  "inventoryItem",
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

/** Types only reachable by an authenticated user, on their own data. */
export const PRIVATE_SEARCH_TYPES: readonly SearchType[] = ["inventoryItem"];

export const MIN_SEARCH_QUERY_LENGTH = 2;
export const DEFAULT_SEARCH_LIMIT = 5;
export const MAX_SEARCH_LIMIT = 25;

export function isSearchType(value: string): value is SearchType {
  return (SEARCH_TYPES as readonly string[]).includes(value);
}

export type SearchResult = {
  type: SearchType;
  /** Identifier the app uses for this entity (Mongo id, slug or nanoid). */
  id: string;
  title: string;
  /** Short qualifier: category, faction, shop, location… */
  subtitle?: string;
  description?: string;
  /** Relative link to the page showing this entity. */
  url: string;
  imageUrl?: string;
  /** Type-specific extras (price, stock, quantity, capacity…). */
  meta?: Record<string, string | number | boolean>;
  /** Relevance, highest first. Only comparable within a single response. */
  score: number;
};

export type SearchResponse = {
  query: string;
  /** Types actually searched, after dropping the ones the caller cannot read. */
  types: SearchType[];
  /** Maximum number of results per type. */
  limit: number;
  total: number;
  results: SearchResult[];
  /** Number of returned results per searched type. */
  countsByType: Record<string, number>;
  /** Types with more matches than the ones returned. */
  hasMore: SearchType[];
};
