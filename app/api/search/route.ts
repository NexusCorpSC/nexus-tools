import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { searchEverything } from "@/lib/search";
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  MIN_SEARCH_QUERY_LENGTH,
  SEARCH_TYPES,
  isSearchType,
  type SearchResponse,
  type SearchType,
} from "@/types/search";

/** Parses a positive integer query param, falling back when absent or invalid. */
function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * GET /api/search
 * Generalized search across every data source of the app: blueprints,
 * missions, factions, items on sale, shops, organizations, cargo ships and —
 * for an authenticated caller — their own inventory.
 *
 * Results are returned as a single list ranked by relevance, each one carrying
 * its `type` and the `url` of the page showing it, so a caller can render them
 * as-is in a command palette.
 *
 * Query params:
 * - `query`: search term, at least 2 characters (required)
 * - `types`: comma-separated subset of the searchable types (default: all)
 * - `limit`: maximum results per type, 1-25 (default: 5)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const query = (sp.get("query") ?? "").trim();

  if (query.length < MIN_SEARCH_QUERY_LENGTH) {
    return NextResponse.json(
      {
        error: `\`query\` must be at least ${MIN_SEARCH_QUERY_LENGTH} characters`,
      },
      { status: 400 },
    );
  }

  const typesParam = sp.get("types");
  let types: SearchType[] = [...SEARCH_TYPES];

  if (typesParam !== null) {
    const requested = typesParam
      .split(",")
      .map((type) => type.trim())
      .filter(Boolean);
    const unknown = requested.filter((type) => !isSearchType(type));

    if (unknown.length > 0) {
      return NextResponse.json(
        {
          error: `Unknown type(s): ${unknown.join(", ")}`,
          validTypes: SEARCH_TYPES,
        },
        { status: 400 },
      );
    }
    if (requested.length === 0) {
      return NextResponse.json(
        {
          error: "`types` must list at least one type",
          validTypes: SEARCH_TYPES,
        },
        { status: 400 },
      );
    }

    // Duplicates would run the same query twice.
    types = [...new Set(requested.filter(isSearchType))];
  }

  const limit = Math.min(
    MAX_SEARCH_LIMIT,
    parsePositiveInt(sp.get("limit"), DEFAULT_SEARCH_LIMIT),
  );

  const session = await auth.api.getSession({ headers: await headers() });

  const {
    types: searched,
    results,
    countsByType,
    hasMore,
  } = await searchEverything({
    query,
    types,
    limit,
    userId: session?.user?.id,
  });

  const response: SearchResponse = {
    query,
    types: searched,
    limit,
    total: results.length,
    results,
    countsByType,
    hasMore,
  };

  return NextResponse.json(response);
}
