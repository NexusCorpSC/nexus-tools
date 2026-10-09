import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  countShopItems,
  getListingFacets,
  getShop,
  getShopItem,
  getShopItemsOfShop,
  isListingOnSale,
  LISTING_SORTS,
  searchListings,
  type ShopItem,
} from "@/lib/shop-items";
import { countDeliveredOrdersForShop } from "@/lib/shop-orders";
import {
  syncAllLinkedListingsThrottled,
  syncLinkedListings,
} from "@/lib/shop-stock";
import {
  jsonBlock,
  mdLink,
  PAGE_SIZE,
  READ_ONLY,
  siteUrl,
  toolError,
  toolResult,
} from "../format";

export const listingPath = (id: string) => `/shopping/i/${id}`;
export const shopPath = (id: string) => `/shops/${id}`;

export const listingSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["OBJECT", "SERVICE"]),
  price: z.number().describe("aUEC, per unit"),
  available: z.number().describe("Stock minus quantities reserved by orders"),
  itemSlug: z.string().optional(),
  category: z.string().optional(),
  size: z.number().optional(),
  location: z
    .object({ id: z.string(), name: z.string(), system: z.string().optional() })
    .optional()
    .describe("Where the seller hands the item over"),
  shop: z.object({ id: z.string(), name: z.string() }),
  imageUrl: z.string().optional(),
  url: z.string(),
});

export type ListingOutput = z.infer<typeof listingSchema>;

export function toListing(item: ShopItem): ListingOutput {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    price: Number(item.price) || 0,
    available: Math.max(0, item.available ?? item.stock - (item.reserved ?? 0)),
    itemSlug: item.itemSlug,
    category: item.category,
    size: item.size,
    location: item.location,
    shop: { id: item.shop.id, name: item.shop.name },
    imageUrl: item.image || undefined,
    url: siteUrl(listingPath(item.id)),
  };
}

export function listingLine(listing: ListingOutput): string {
  return (
    `- ${mdLink(listing.name, listingPath(listing.id))} (id: ${listing.id}) — ` +
    `${listing.price.toLocaleString("en-US")} aUEC, ${listing.available} available` +
    (listing.location ? `, handed over at ${listing.location.name}` : "") +
    ` — shop ${listing.shop.name}`
  );
}

export function registerMarketplaceReadTools(server: McpServer) {
  server.registerTool(
    "search_listings",
    {
      title: "Search the marketplace",
      description:
        "Search the player marketplace of Nexus: listings of player shops with price (aUEC), available stock, hand-over place and shop. Only listings in stock unless includeSoldOut. Call list_listing_facets for exact categories and systems.",
      inputSchema: z.object({
        query: z.string().optional().describe("Words in the listing name"),
        type: z.enum(["OBJECT", "SERVICE"]).optional(),
        category: z.string().optional(),
        systems: z.array(z.string()).optional().describe("Hand-over systems"),
        minPrice: z.number().min(0).optional(),
        maxPrice: z.number().min(0).optional(),
        size: z.number().int().optional(),
        includeSoldOut: z.boolean().optional(),
        sort: z.enum(LISTING_SORTS).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        page: z.number(),
        listings: z.array(listingSchema),
      }),
      annotations: READ_ONLY,
    },
    async ({ page = 1, limit = PAGE_SIZE.default, ...filters }) => {
      await syncAllLinkedListingsThrottled();
      const { items, total } = await searchListings(filters, {
        offset: (page - 1) * limit,
        limit,
      });
      const listings = items.map(toListing);
      return toolResult(
        { total, page, listings },
        `${total} listings match (page ${page}):\n` +
          listings.map(listingLine).join("\n"),
      );
    },
  );

  server.registerTool(
    "list_listing_facets",
    {
      title: "List marketplace categories and systems",
      description:
        "List the categories, hand-over systems and sizes of the marketplace listings in stock, to build filters for search_listings.",
      inputSchema: z.object({}),
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async () => {
      const facets = await getListingFacets();
      return toolResult(facets, jsonBlock(facets));
    },
  );

  server.registerTool(
    "get_listing",
    {
      title: "Get a marketplace listing",
      description:
        "One marketplace listing by id: description, price, available stock, hand-over place, catalog item and shop.",
      inputSchema: z.object({ id: z.string().min(1) }),
      outputSchema: listingSchema.extend({
        description: z.string().optional(),
      }),
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      await syncLinkedListings({ id });
      const item = await getShopItem(id);
      if (!item || !isListingOnSale(item, item.shop)) {
        return toolError(`No listing on sale with id: ${id}`);
      }
      const listing = {
        ...toListing(item),
        description: item.description || undefined,
      };
      return toolResult(
        listing,
        `${listingLine(listing)}\n\n${listing.description ?? ""}`,
      );
    },
  );

  server.registerTool(
    "get_shop",
    {
      title: "Get a player shop",
      description:
        "A player shop by id: description, owner, number of delivered orders, and its listings on sale (paginated).",
      inputSchema: z.object({
        id: z.string().min(1),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.looseObject({
        id: z.string(),
        name: z.string(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ id, page = 1, limit = PAGE_SIZE.default }) => {
      const shop = await getShop(id);
      if (!shop || shop.reportHidden)
        return toolError(`No shop with id: ${id}`);
      await syncLinkedListings({ shopId: id });
      const [items, count, delivered] = await Promise.all([
        getShopItemsOfShop(id, { offset: (page - 1) * limit, limit }),
        countShopItems(id),
        countDeliveredOrdersForShop(id),
      ]);
      const listings = items.map((item) =>
        toListing({
          ...item,
          shop: { id: shop.id, name: shop.name },
        } as unknown as ShopItem),
      );
      const data = {
        id: shop.id,
        name: shop.name,
        description: shop.description,
        owner: shop.owner?.name,
        deliveredOrders: delivered,
        listingCount: count,
        page,
        listings,
        url: siteUrl(shopPath(shop.id)),
      };
      return toolResult(
        data,
        `${mdLink(shop.name, shopPath(shop.id))} — ${shop.description}\n` +
          `Owner: ${data.owner ?? "?"}, ${delivered} delivered orders, ${count} listings.\n` +
          listings.map(listingLine).join("\n"),
      );
    },
  );
}
