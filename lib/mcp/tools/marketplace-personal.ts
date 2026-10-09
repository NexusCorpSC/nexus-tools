import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "bson";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import db from "@/lib/db";
import { getCartGroups, removeFromCart, setCartQuantity } from "@/lib/cart";
import { getSellerShops, sellLot, type SellLotError } from "@/lib/lot-sales";
import {
  addListingToCart,
  type CartError,
  checkoutCart,
  type CheckoutError,
  MAX_ORDER_MESSAGE,
  orderListingNow,
} from "@/lib/marketplace-purchase";
import {
  BO_LISTING_STATES,
  getBoListings,
  getShop,
  getShopNames,
  isUserSellerOfShop,
  type ShopItemDbModel,
} from "@/lib/shop-items";
import {
  addOrderMessage,
  availableActions,
  type DirectOrderError,
  getClosedOrdersForShop,
  getOpenOrdersForShop,
  getOrderById,
  getOrdersForUser,
  getOrdersOfCheckout,
  getShopOrderCounts,
  ORDER_ACTIONS,
  type OrderAction,
  type OrderRole,
  placeOrder,
  type ShopOrder,
  transitionOrder,
  type TransitionError,
} from "@/lib/shop-orders";
import {
  changeManualStock,
  setLotLimit,
  type StockError,
  syncLinkedListings,
} from "@/lib/shop-stock";
import { currentUser, type McpUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import {
  mdLink,
  PAGE_SIZE,
  READ_ONLY,
  siteUrl,
  toolError,
  toolResult,
} from "../format";
import { listingPath } from "./marketplace";

/**
 * La marketplace au nom du joueur connecté : panier, achats et commandes côté
 * acheteur ; magasins, commandes reçues, mise en vente et stock côté vendeur.
 * Mêmes règles que le site (`lib/marketplace-purchase.ts`, `lib/shop-orders.ts`,
 * `lib/shop-stock.ts`) ; chaque écriture est confirmée par le joueur.
 */

const CART_PATH = "/shopping/cart";
const MY_ORDERS_PATH = "/shopping/my-orders";
const buyerOrderPath = (id: string) => `${MY_ORDERS_PATH}/${id}`;
const sellerOrderPath = (shopId: string, id: string) =>
  `/shops/${shopId}/bo/orders/${id}`;
const boListingPath = (shopId: string, id: string) =>
  `/shops/${shopId}/bo/listings/${id}`;

const READ = "marketplace:read" as const;
const WRITE_SCOPE = "marketplace:write" as const;

const challenges = {
  cart_view: personalTool("cart_view", READ),
  my_orders: personalTool("my_orders", READ),
  get_order: personalTool("get_order", READ),
  my_shops: personalTool("my_shops", READ),
  shop_orders: personalTool("shop_orders", READ),
  shop_listings: personalTool("shop_listings", READ),
  cart_add: personalTool("cart_add", WRITE_SCOPE),
  cart_update: personalTool("cart_update", WRITE_SCOPE),
  cart_checkout: personalTool("cart_checkout", WRITE_SCOPE),
  order_now: personalTool("order_now", WRITE_SCOPE),
  request_custom_order: personalTool("request_custom_order", WRITE_SCOPE),
  order_action: personalTool("order_action", WRITE_SCOPE),
  order_message: personalTool("order_message", WRITE_SCOPE),
  sell_lot: personalTool("sell_lot", WRITE_SCOPE),
  update_listing: personalTool("update_listing", WRITE_SCOPE),
};

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const ERRORS: Record<
  | CartError
  | CheckoutError
  | DirectOrderError
  | TransitionError
  | SellLotError
  | StockError
  | "PICKUP_REQUIRED",
  string
> = {
  LISTING_NOT_FOUND: "This listing does not exist anymore.",
  NOT_FOR_SALE: "This listing is not for sale right now.",
  OWN_SHOP: "You sell in this shop: you cannot buy from it.",
  INVALID_QUANTITY: "The quantity must be a whole number of at least 1.",
  NOT_ENOUGH_STOCK: "Not enough stock is available for that quantity.",
  CART_FULL: "The cart is full: check it out or remove lines first.",
  EMPTY_CART: "The cart is empty.",
  CART_CHANGED:
    "The cart changed (a shop was left out, or a line cannot be ordered anymore): read it again with cart_view.",
  PICKUP_REQUIRED:
    "This seller set no handover place: propose one with proposedPickup.",
  NOT_ALLOWED:
    "That action is not available on this order now (its state changed, or it is not yours to take).",
  INVALID_QUOTE: "A quote needs a price of 0 aUEC or more.",
  SHOP_NOT_FOUND: "You do not sell in this shop.",
  LOT_NOT_FOUND: "No such lot in your inventory.",
  LOT_EMPTY: "This lot has nothing left to sell (parcels reserve it all).",
  ALREADY_ON_SALE: "This lot is already on sale in this shop.",
  NAME_REQUIRED: "The listing needs a name.",
  INVALID_PRICE: "The price must be a whole number of aUEC, 0 or more.",
  INVALID_LIMIT: "The cap must be a whole number of at least 1.",
  INVALID_CHANGE: "The stock change must be a non-zero whole number.",
  LINKED:
    "This listing follows an inventory lot: change the lot, or its cap with lotLimit.",
  NOT_AN_OBJECT: "Only item listings can follow a lot.",
  NOT_LINKED: "This listing does not follow an inventory lot.",
};

const fail = (code: keyof typeof ERRORS) => toolError(ERRORS[code] ?? code);

/** Le site relit ses pages après une écriture faite ici. */
function refresh(...paths: string[]) {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch {
      // Hors d'une requête Next (tests) : rien à rafraîchir.
    }
  }
}

function money(amount: number) {
  return `${amount.toLocaleString("en-US")} aUEC`;
}

const ORDER_ACTION_NAMES = Object.keys(ORDER_ACTIONS) as [
  OrderAction,
  ...OrderAction[],
];

const orderSchema = z.object({
  id: z.string(),
  shop: z.object({ id: z.string(), name: z.string() }),
  buyer: z.string(),
  role: z.enum(["buyer", "seller"]).describe("Your side of this order"),
  kind: z
    .enum(["DIRECT", "CUSTOM"])
    .describe("DIRECT: listings at their price; CUSTOM: a request to quote"),
  status: z.enum([
    "PENDING",
    "QUOTED",
    "CONFIRMED",
    "ACCEPTED",
    "READY",
    "DELIVERED",
    "REFUSED",
    "CANCELLED",
  ]),
  summary: z.string(),
  lines: z.array(
    z.object({
      listingId: z.string(),
      name: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
    }),
  ),
  pickup: z
    .object({ name: z.string(), system: z.string().optional() })
    .optional(),
  total: z.number().optional(),
  actions: z
    .array(z.enum(ORDER_ACTION_NAMES))
    .describe("What you can do now, with order_action"),
  createdAt: z.string(),
  updatedAt: z.string(),
  url: z.string(),
});

const timelineSchema = z.array(
  z.object({
    at: z.string(),
    by: z.enum(["buyer", "seller"]),
    author: z.string(),
    kind: z.enum(["message", "quote", "status"]),
    body: z.string().optional(),
    quote: z.number().optional(),
    status: z.string().optional(),
  }),
);

type OrderOutput = z.infer<typeof orderSchema>;

function toOrder(
  order: ShopOrder,
  role: OrderRole,
  shopName: string,
): OrderOutput {
  return {
    id: order.id,
    shop: { id: order.shopId, name: shopName },
    buyer: order.userName,
    role,
    kind: order.kind,
    status: order.status,
    summary: order.message.slice(0, 300),
    lines: order.lines,
    pickup: order.pickup && {
      name: order.pickup.name,
      system: order.pickup.system,
    },
    total: order.total,
    actions: availableActions(order, role),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    url: siteUrl(
      role === "buyer"
        ? buyerOrderPath(order.id)
        : sellerOrderPath(order.shopId, order.id),
    ),
  };
}

async function toOrders(orders: ShopOrder[], role: OrderRole) {
  const names = await getShopNames(orders.map((order) => order.shopId));
  return orders.map((order) =>
    toOrder(order, role, names.get(order.shopId) ?? "?"),
  );
}

function orderLine(order: OrderOutput): string {
  return (
    `- ${order.status} — ${order.summary}` +
    (order.total !== undefined ? ` — ${money(order.total)}` : "") +
    ` — ${order.role === "buyer" ? `shop ${order.shop.name}` : `from ${order.buyer}`}` +
    (order.pickup ? `, handover at ${order.pickup.name}` : "") +
    ` (order: ${order.id}, [open](${order.url}))` +
    (order.actions.length ? ` — can: ${order.actions.join(", ")}` : "")
  );
}

/** Le rôle du joueur sur la commande, ou rien s'il n'y a pas accès. */
async function roleOn(
  order: ShopOrder,
  user: McpUser,
  wanted?: OrderRole,
): Promise<OrderRole | null> {
  if (wanted !== "seller" && order.userId === user.id) return "buyer";
  if (
    wanted !== "buyer" &&
    (await isUserSellerOfShop(order.shopId, new ObjectId(user.id)))
  ) {
    return "seller";
  }
  return null;
}

function refreshOrder(order: ShopOrder) {
  refresh(
    buyerOrderPath(order.id),
    MY_ORDERS_PATH,
    sellerOrderPath(order.shopId, order.id),
    `/shops/${order.shopId}/bo/orders`,
    ...order.lines.map((line) => listingPath(line.listingId)),
  );
}

async function sellerListing(user: McpUser, listingId: string) {
  const listing = await db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .findOne({ id: listingId });
  if (
    !listing ||
    !(await isUserSellerOfShop(listing.shopId, new ObjectId(user.id)))
  ) {
    return null;
  }
  return listing;
}

function refreshListing(listing: ShopItemDbModel) {
  refresh(
    `/shops/${listing.shopId}/bo/listings`,
    boListingPath(listing.shopId, listing.id),
    listingPath(listing.id),
    `/shops/${listing.shopId}`,
    "/shopping",
  );
}

const cartSchema = z.object({
  shops: z.array(
    z.object({
      shopId: z.string(),
      shopName: z.string(),
      handover: z
        .string()
        .optional()
        .describe(
          "The handover place shared by the shop's lines; without it, checkout needs proposedPickup",
        ),
      subtotal: z.number(),
      lines: z.array(
        z.object({
          listingId: z.string(),
          name: z.string(),
          quantity: z.number(),
          unitPrice: z.number(),
          available: z.number(),
          problem: z
            .enum(["NOT_FOR_SALE", "OWN_SHOP", "NOT_ENOUGH_STOCK"])
            .optional(),
        }),
      ),
    }),
  ),
  total: z.number(),
  url: z.string(),
});

async function readCart(userId: ObjectId) {
  const groups = await getCartGroups(userId);
  const shops = groups.map((group) => ({
    shopId: group.shopId,
    shopName: group.shopName,
    handover: group.location?.name,
    subtotal: group.subtotal,
    lines: group.lines.map((line) => ({
      listingId: line.listingId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      available: line.available,
      problem: line.problem,
    })),
  }));
  const total = shops.reduce((sum, shop) => sum + shop.subtotal, 0);
  const text = shops.length
    ? shops
        .map(
          (shop) =>
            `**${shop.shopName}** (shop: ${shop.shopId}) — ${money(shop.subtotal)}` +
            (shop.handover
              ? `, handover at ${shop.handover}`
              : ", no handover place: propose one at checkout") +
            "\n" +
            shop.lines
              .map(
                (line) =>
                  `- ${line.quantity} × ${line.name} at ${money(line.unitPrice)} (listing: ${line.listingId})` +
                  (line.problem ? ` — cannot be ordered: ${line.problem}` : ""),
              )
              .join("\n"),
        )
        .join("\n\n") + `\n\nTotal: ${money(total)}`
    : "The cart is empty.";
  return { cart: { shops, total, url: siteUrl(CART_PATH) }, text };
}

export function registerMarketplacePersonalTools(server: McpServer) {
  // ─── Acheteur ──────────────────────────────────────────────────────────────

  server.registerTool(
    "cart_view",
    {
      title: "View my cart",
      description:
        "The signed-in player's marketplace cart, grouped by shop as it would be ordered now (one order per shop), with any line that cannot be ordered anymore.",
      inputSchema: z.object({}),
      outputSchema: cartSchema,
      annotations: READ_ONLY,
      scopeChallenge: challenges.cart_view,
    },
    async (_args, ctx) => {
      const user = await currentUser(ctx);
      const { cart, text } = await readCart(new ObjectId(user.id));
      return toolResult(cart, `${mdLink("Cart", CART_PATH)}\n\n${text}`);
    },
  );

  server.registerTool(
    "cart_add",
    {
      title: "Add to my cart",
      description:
        "Add a quantity of a marketplace listing (id from search_marketplace) to the signed-in player's cart. Nothing is ordered or reserved until cart_checkout. Asks the user to confirm first.",
      inputSchema: z.object({
        listingId: z.string(),
        quantity: z.number().int().min(1).default(1),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ itemsInCart: z.number(), url: z.string() }),
      annotations: WRITE,
      scopeChallenge: challenges.cart_add,
    },
    async ({ listingId, quantity, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const listing = await db
        .db()
        .collection<ShopItemDbModel>("shopItems")
        .findOne({ id: listingId });
      if (!listing) return fail("LISTING_NOT_FOUND");
      const summary = `Add ${quantity} × ${listing.name} (${money(Number(listing.price) || 0)} each) to ${user.name}'s cart.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const result = await addListingToCart(
        new ObjectId(user.id),
        listingId,
        quantity,
      );
      if (result.error) return fail(result.error);
      refresh("/");
      return toolResult(
        {
          status: "done",
          summary,
          itemsInCart: result.count,
          url: siteUrl(CART_PATH),
        },
        `Done: ${result.count} items in ${mdLink("the cart", CART_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "cart_update",
    {
      title: "Change my cart",
      description:
        "Set the quantity of a cart line, or remove it with quantity 0. Asks the user to confirm first.",
      inputSchema: z.object({
        listingId: z.string(),
        quantity: z.number().int().min(0),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ cart: cartSchema }),
      annotations: WRITE,
      scopeChallenge: challenges.cart_update,
    },
    async ({ listingId, quantity, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const userId = new ObjectId(user.id);
      const line = (await getCartGroups(userId))
        .flatMap((group) => group.lines)
        .find((candidate) => candidate.listingId === listingId);
      if (!line) return toolError(`Listing ${listingId} is not in the cart.`);
      const summary =
        quantity === 0
          ? `Remove ${line.name} from the cart.`
          : `Change ${line.name} in the cart: ${line.quantity} → ${quantity}.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      if (quantity === 0) await removeFromCart(userId, [listingId]);
      else await setCartQuantity(userId, listingId, quantity);
      refresh("/");
      const { cart, text } = await readCart(userId);
      return toolResult({ status: "done", summary, cart }, `Done. ${text}`);
    },
  );

  server.registerTool(
    "cart_checkout",
    {
      title: "Check out my cart",
      description:
        "Order the whole cart: one order per shop, all or none, at the prices shown by cart_view. Each shop then confirms (which reserves the stock), prepares and hands over. For a shop without a handover place, or to meet elsewhere, give proposedPickup. Asks the user to confirm first.",
      inputSchema: z.object({
        shops: z
          .array(
            z.object({
              shopId: z.string(),
              proposedPickup: z
                .string()
                .max(200)
                .optional()
                .describe("Another handover place to propose to this shop"),
              note: z.string().max(MAX_ORDER_MESSAGE).optional(),
            }),
          )
          .optional()
          .describe(
            "Choices per shop; shops left out use their handover place and no note",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        orders: z.array(orderSchema),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: challenges.cart_checkout,
    },
    async ({ shops = [], confirm }, ctx) => {
      const user = await currentUser(ctx);
      const userId = new ObjectId(user.id);
      const groups = await getCartGroups(userId);
      if (groups.length === 0) return fail("EMPTY_CART");
      const blocked = groups.flatMap((group) =>
        group.lines.filter((line) => line.problem),
      );
      if (blocked.length) {
        return toolError(
          "These lines cannot be ordered; change or remove them with cart_update first:\n" +
            blocked
              .map(
                (line) =>
                  `- ${line.name} (listing: ${line.listingId}): ${line.problem}`,
              )
              .join("\n"),
        );
      }
      const chosen = new Map(shops.map((shop) => [shop.shopId, shop]));
      const choices = groups.map(
        (group) => chosen.get(group.shopId) ?? { shopId: group.shopId },
      );
      const missing = groups.filter(
        (group) =>
          !group.location && !chosen.get(group.shopId)?.proposedPickup?.trim(),
      );
      if (missing.length) {
        return toolError(
          `${missing.map((group) => `${group.shopName} (shop: ${group.shopId})`).join(", ")} set no handover place: give proposedPickup for ${missing.length > 1 ? "them" : "it"}.`,
        );
      }

      const summary =
        `Place ${groups.length} order${groups.length > 1 ? "s" : ""} for ${user.name}, ${money(groups.reduce((sum, group) => sum + group.subtotal, 0))} in total:\n` +
        groups
          .map((group) => {
            const choice = chosen.get(group.shopId);
            const place =
              choice?.proposedPickup?.trim() || group.location?.name || "";
            return (
              `- ${group.shopName}: ` +
              group.lines
                .map((line) => `${line.quantity} × ${line.name}`)
                .join(", ") +
              ` — ${money(group.subtotal)}, handover at ${place}` +
              (choice?.proposedPickup ? " (proposed)" : "") +
              (choice?.note ? ` — note: “${choice.note}”` : "")
            );
          })
          .join("\n");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const result = await checkoutCart(
        { id: userId, name: user.name },
        choices,
      );
      if (result.error || !result.checkoutId) {
        return fail(result.error ?? "CART_CHANGED");
      }
      refresh("/", MY_ORDERS_PATH);
      for (const group of result.groups ?? []) {
        refresh(`/shops/${group.shopId}/bo/orders`);
      }
      const orders = await toOrders(
        await getOrdersOfCheckout(userId, result.checkoutId),
        "buyer",
      );
      const path = `${CART_PATH}/${result.checkoutId}`;
      return toolResult(
        { status: "done", summary, orders, url: siteUrl(path) },
        `Done: ${mdLink(`${orders.length} orders placed`, path)}. Each shop now confirms them.\n` +
          orders.map(orderLine).join("\n"),
      );
    },
  );

  server.registerTool(
    "order_now",
    {
      title: "Buy a listing now",
      description:
        "Order a quantity of one listing straight away, without the cart. The shop then confirms (which reserves the stock), prepares and hands over. Asks the user to confirm first.",
      inputSchema: z.object({
        listingId: z.string(),
        quantity: z.number().int().min(1).default(1),
        proposedPickup: z
          .string()
          .max(200)
          .optional()
          .describe(
            "Another handover place to propose; required when the listing has none",
          ),
        note: z.string().max(MAX_ORDER_MESSAGE).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ order: orderSchema }),
      annotations: WRITE,
      scopeChallenge: challenges.order_now,
    },
    async ({ listingId, quantity, proposedPickup, note, confirm }, ctx) => {
      const user = await currentUser(ctx);
      await syncLinkedListings({ id: listingId });
      const listing = await db
        .db()
        .collection<ShopItemDbModel>("shopItems")
        .findOne({ id: listingId });
      if (!listing) return fail("LISTING_NOT_FOUND");
      if (quantity > listing.stock - (listing.reserved ?? 0)) {
        return fail("NOT_ENOUGH_STOCK");
      }
      const place = proposedPickup?.trim() || listing.location?.name;
      if (!place) return fail("PICKUP_REQUIRED");
      const shop = await getShop(listing.shopId);
      const price = Number(listing.price) || 0;
      const summary =
        `Order ${quantity} × ${listing.name} from ${shop?.name ?? "?"} for ${money(price * quantity)}, handover at ${place}` +
        (proposedPickup?.trim() ? " (proposed)" : "") +
        (note ? `, note: “${note}”` : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const result = await orderListingNow(
        { id: new ObjectId(user.id), name: user.name },
        { listingId, quantity, proposedPickup, note },
      );
      if (result.error || !result.orderId) {
        return fail(result.error ?? "LISTING_NOT_FOUND");
      }
      const order = (await getOrderById(result.orderId))!;
      refreshOrder(order);
      const output = toOrder(order, "buyer", shop?.name ?? "?");
      return toolResult(
        { status: "done", summary, order: output },
        `Done: ${mdLink("order placed", buyerOrderPath(order.id))}, waiting for the shop to confirm.\n${orderLine(output)}`,
      );
    },
  );

  server.registerTool(
    "request_custom_order",
    {
      title: "Ask a shop for a quote",
      description:
        "Send a shop a free-form request (something it does not list, a service, a large quantity). The shop answers with a quote the player then accepts or declines with order_action. Asks the user to confirm first.",
      inputSchema: z.object({
        shopId: z.string(),
        message: z.string().min(1).max(MAX_ORDER_MESSAGE),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ order: orderSchema }),
      annotations: WRITE,
      scopeChallenge: challenges.request_custom_order,
    },
    async ({ shopId, message, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const shop = await getShop(shopId);
      if (!shop || shop.reportHidden) {
        return toolError("This shop does not take requests right now.");
      }
      if (await isUserSellerOfShop(shopId, new ObjectId(user.id))) {
        return fail("OWN_SHOP");
      }
      const text = message.trim();
      const summary = `Send ${shop.name} this request from ${user.name}: “${text}”`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const orderId = await placeOrder(
        shopId,
        new ObjectId(user.id),
        user.name,
        text,
      );
      const order = (await getOrderById(orderId))!;
      refreshOrder(order);
      const output = toOrder(order, "buyer", shop.name);
      return toolResult(
        { status: "done", summary, order: output },
        `Done: ${mdLink("request sent", buyerOrderPath(orderId))}. The shop will answer with a quote.`,
      );
    },
  );

  server.registerTool(
    "my_orders",
    {
      title: "My orders",
      description:
        "The signed-in player's marketplace orders as a buyer, newest first, with what they can do on each now (order_action).",
      inputSchema: z.object({
        open: z
          .boolean()
          .default(true)
          .describe("Only orders still in progress (default); false: all"),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.object({
        page: z.number(),
        orders: z.array(orderSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: challenges.my_orders,
    },
    async ({ open, page = 1, pageSize = PAGE_SIZE.default }, ctx) => {
      const user = await currentUser(ctx);
      const orders = await toOrders(
        await getOrdersForUser(new ObjectId(user.id), {
          offset: (page - 1) * pageSize,
          limit: pageSize,
          open,
        }),
        "buyer",
      );
      return toolResult(
        { page, orders, url: siteUrl(MY_ORDERS_PATH) },
        orders.length
          ? `${mdLink("My orders", MY_ORDERS_PATH)}${open ? " in progress" : ""}:\n${orders.map(orderLine).join("\n")}`
          : open
            ? "No order in progress."
            : "No order.",
      );
    },
  );

  server.registerTool(
    "get_order",
    {
      title: "Read an order",
      description:
        "One order the player bought or one their shop received: lines, handover, total, its messages and quotes, and the actions open to them now.",
      inputSchema: z.object({
        orderId: z.string(),
        as: z
          .enum(["buyer", "seller"])
          .optional()
          .describe("Your side, when you are both buyer and seller"),
      }),
      outputSchema: orderSchema.extend({ timeline: timelineSchema }),
      annotations: READ_ONLY,
      scopeChallenge: challenges.get_order,
    },
    async ({ orderId, as }, ctx) => {
      const user = await currentUser(ctx);
      const order = await getOrderById(orderId);
      const role = order && (await roleOn(order, user, as));
      if (!order || !role) return toolError(`No order ${orderId} of yours.`);
      const [output] = await toOrders([order], role);
      const timeline = order.timeline.map((entry) => ({
        at: entry.at,
        by: entry.role,
        author: entry.authorName,
        kind: entry.kind,
        body: entry.body,
        quote: entry.quote,
        status: entry.status,
      }));
      return toolResult(
        { ...output, timeline },
        `${orderLine(output)}\n\n` +
          timeline
            .map(
              (entry) =>
                `- ${entry.at.slice(0, 16).replace("T", " ")} ${entry.author || entry.by}: ` +
                (entry.kind === "status"
                  ? `→ ${entry.status}`
                  : entry.kind === "quote"
                    ? `quote ${money(entry.quote ?? 0)}${entry.body ? ` — “${entry.body}”` : ""}`
                    : `“${entry.body}”`),
            )
            .join("\n"),
      );
    },
  );

  server.registerTool(
    "order_action",
    {
      title: "Move an order along",
      description:
        "Act on an order. Buyer: accept or decline a quote, cancel. Seller: confirm a direct order (reserves the stock), quote a price, refuse, mark ready, deliver (the stock and any linked inventory lot go down). get_order and my_orders list what is possible now. Asks the user to confirm first.",
      inputSchema: z.object({
        orderId: z.string(),
        action: z.enum(ORDER_ACTION_NAMES),
        as: z
          .enum(["buyer", "seller"])
          .optional()
          .describe("Your side, when you are both buyer and seller"),
        quote: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("aUEC, for the quote action"),
        message: z.string().max(MAX_ORDER_MESSAGE).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ order: orderSchema }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: challenges.order_action,
    },
    async ({ orderId, action, as, quote, message, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const order = await getOrderById(orderId);
      const role =
        order && (await roleOn(order, user, as ?? ORDER_ACTIONS[action].role));
      if (!order || !role) return toolError(`No order ${orderId} of yours.`);
      if (!availableActions(order, role).includes(action)) {
        const open = availableActions(order, role);
        return toolError(
          `${action} is not possible on this ${order.status} order as ${role}.` +
            (open.length ? ` Possible now: ${open.join(", ")}.` : ""),
        );
      }
      if (action === "quote" && quote === undefined) {
        return fail("INVALID_QUOTE");
      }
      const [before] = await toOrders([order], role);
      const summary =
        `${action === "quote" ? `Quote ${money(quote!)} for` : `${action[0].toUpperCase()}${action.slice(1)}`} ` +
        `${role === "buyer" ? `your order at ${before.shop.name}` : `${order.userName}'s order`}: ${before.summary}` +
        ` (${order.status} → ${ORDER_ACTIONS[action].to})` +
        (message ? `, with the message “${message}”` : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const result = await transitionOrder(orderId, action, {
        role,
        authorName: user.name,
        message: message?.trim() || undefined,
        quote,
      });
      if (result.error) return fail(result.error);
      const updated = (await getOrderById(orderId))!;
      refreshOrder(updated);
      const output = toOrder(updated, role, before.shop.name);
      return toolResult(
        { status: "done", summary, order: output },
        `Done.\n${orderLine(output)}`,
      );
    },
  );

  server.registerTool(
    "order_message",
    {
      title: "Write on an order",
      description:
        "Post a message in an order's thread, to the shop or to the buyer. Asks the user to confirm first.",
      inputSchema: z.object({
        orderId: z.string(),
        message: z.string().min(1).max(MAX_ORDER_MESSAGE),
        as: z.enum(["buyer", "seller"]).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ orderId: z.string(), url: z.string() }),
      annotations: WRITE,
      scopeChallenge: challenges.order_message,
    },
    async ({ orderId, message, as, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const order = await getOrderById(orderId);
      const role = order && (await roleOn(order, user, as));
      if (!order || !role) return toolError(`No order ${orderId} of yours.`);
      const text = message.trim();
      const summary = `Write on ${role === "buyer" ? "your order" : `${order.userName}'s order`} (${order.message.slice(0, 120)}): “${text}”`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      await addOrderMessage(orderId, role, user.name, text);
      refreshOrder(order);
      const path =
        role === "buyer"
          ? buyerOrderPath(orderId)
          : sellerOrderPath(order.shopId, orderId);
      return toolResult(
        { status: "done", summary, orderId, url: siteUrl(path) },
        `Done: message posted on ${mdLink("the order", path)}.`,
      );
    },
  );

  // ─── Vendeur ───────────────────────────────────────────────────────────────

  server.registerTool(
    "my_shops",
    {
      title: "My shops",
      description:
        "The shops the signed-in player sells in (default shop first), with how many orders wait for them.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        shops: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            isDefault: z.boolean(),
            ordersToHandle: z.number(),
            openCustomRequests: z.number(),
            url: z.string(),
          }),
        ),
      }),
      annotations: READ_ONLY,
      scopeChallenge: challenges.my_shops,
    },
    async (_args, ctx) => {
      const user = await currentUser(ctx);
      const shops = await Promise.all(
        (await getSellerShops(user.id)).map(async (shop) => {
          const counts = await getShopOrderCounts(shop.id);
          return {
            id: shop.id,
            name: shop.name,
            isDefault: shop.isDefault,
            ordersToHandle: counts.toHandle,
            openCustomRequests: counts.custom,
            url: siteUrl(`/shops/${shop.id}/bo`),
          };
        }),
      );
      return toolResult(
        { shops },
        shops.length
          ? shops
              .map(
                (shop) =>
                  `- ${mdLink(shop.name, `/shops/${shop.id}/bo`)} (shop: ${shop.id})${shop.isDefault ? " — default" : ""} — ${shop.ordersToHandle} orders to handle`,
              )
              .join("\n")
          : "You sell in no shop. Open one on the site (Marketplace → Open a shop).",
      );
    },
  );

  server.registerTool(
    "shop_orders",
    {
      title: "Orders of my shop",
      description:
        "The orders a shop the player sells in received: in progress (oldest first, default) or closed (newest first).",
      inputSchema: z.object({
        shopId: z.string(),
        closed: z.boolean().default(false),
        kind: z.enum(["DIRECT", "CUSTOM"]).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.object({
        orders: z.array(orderSchema),
        total: z.number().optional(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: challenges.shop_orders,
    },
    async (
      { shopId, closed, kind, page = 1, pageSize = PAGE_SIZE.default },
      ctx,
    ) => {
      const user = await currentUser(ctx);
      if (!(await isUserSellerOfShop(shopId, new ObjectId(user.id)))) {
        return fail("SHOP_NOT_FOUND");
      }
      const path = `/shops/${shopId}/bo/orders`;
      if (closed) {
        const result = await getClosedOrdersForShop(shopId, {
          offset: (page - 1) * pageSize,
          limit: pageSize,
        });
        const orders = await toOrders(result.orders, "seller");
        return toolResult(
          { orders, total: result.total, url: siteUrl(path) },
          orders.length ? orders.map(orderLine).join("\n") : "No closed order.",
        );
      }
      const all = await getOpenOrdersForShop(shopId, { kind });
      const orders = await toOrders(
        all.slice((page - 1) * pageSize, page * pageSize),
        "seller",
      );
      return toolResult(
        { orders, total: all.length, url: siteUrl(path) },
        orders.length
          ? `${all.length} orders in progress at ${mdLink("the shop", path)}:\n${orders.map(orderLine).join("\n")}`
          : "No order in progress.",
      );
    },
  );

  const boListingSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(["OBJECT", "SERVICE"]),
    price: z.number(),
    stock: z.number(),
    reserved: z.number(),
    hidden: z.boolean(),
    lotId: z.string().optional().describe("The inventory lot it follows"),
    lotLimit: z.number().optional(),
    location: z.string().optional(),
    url: z.string(),
  });

  server.registerTool(
    "shop_listings",
    {
      title: "Listings of my shop",
      description:
        "The listings of a shop the player sells in, as the back office shows them: on sale (active), sold out, or withdrawn (hidden).",
      inputSchema: z.object({
        shopId: z.string(),
        state: z.enum(BO_LISTING_STATES).default("active"),
        query: z.string().optional(),
      }),
      outputSchema: z.object({ listings: z.array(boListingSchema) }),
      annotations: READ_ONLY,
      scopeChallenge: challenges.shop_listings,
    },
    async ({ shopId, state, query }, ctx) => {
      const user = await currentUser(ctx);
      if (!(await isUserSellerOfShop(shopId, new ObjectId(user.id)))) {
        return fail("SHOP_NOT_FOUND");
      }
      await syncLinkedListings({ shopId });
      const listings = (await getBoListings(shopId, state, query)).map(
        (listing) => ({
          id: listing.id,
          name: listing.name,
          type: listing.type,
          price: Number(listing.price) || 0,
          stock: listing.stock,
          reserved: listing.reserved ?? 0,
          hidden: !!listing.hidden,
          lotId: listing.inventoryItemId,
          lotLimit: listing.lotLimit,
          location: listing.location?.name,
          url: siteUrl(boListingPath(shopId, listing.id)),
        }),
      );
      return toolResult(
        { listings },
        listings.length
          ? listings
              .map(
                (listing) =>
                  `- ${mdLink(listing.name, boListingPath(shopId, listing.id))} (listing: ${listing.id}) — ${money(listing.price)}, stock ${listing.stock}` +
                  (listing.reserved ? ` (${listing.reserved} reserved)` : "") +
                  (listing.lotId
                    ? `, follows lot ${listing.lotId}${listing.lotLimit !== undefined ? ` capped at ${listing.lotLimit}` : ""}`
                    : "") +
                  (listing.hidden ? ", withdrawn" : ""),
              )
              .join("\n")
          : "No listing.",
      );
    },
  );

  server.registerTool(
    "sell_lot",
    {
      title: "Sell an inventory lot",
      description:
        "Put one of the player's inventory lots (id from list_inventory) on sale in a shop they sell in (my_shops; the default shop when omitted). The listing follows the lot: its stock and handover place come from it, optionally capped with limit. Asks the user to confirm first.",
      inputSchema: z.object({
        lotId: z.string(),
        shopId: z.string().optional(),
        price: z.number().int().min(0).describe("aUEC per unit"),
        name: z
          .string()
          .max(500)
          .optional()
          .describe("Listing name; the lot's name when omitted"),
        limit: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Sell at most this many units of the lot"),
        publish: z
          .boolean()
          .default(true)
          .describe("false: keep it withdrawn, to finish on the site"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ listingId: z.string(), url: z.string() }),
      annotations: WRITE,
      scopeChallenge: challenges.sell_lot,
    },
    async ({ lotId, shopId, price, name, limit, publish, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const shops = await getSellerShops(user.id);
      const shop = shopId
        ? shops.find((candidate) => candidate.id === shopId)
        : (shops.find((candidate) => candidate.isDefault) ?? shops[0]);
      if (!shop) return fail("SHOP_NOT_FOUND");
      const lot = ObjectId.isValid(lotId)
        ? await db
            .db()
            .collection<{ _id: ObjectId; name: string; quantity: number }>(
              "inventoryItems",
            )
            .findOne({ _id: new ObjectId(lotId), userId: user.id })
        : null;
      if (!lot) return fail("LOT_NOT_FOUND");
      const listingName = name?.trim() || lot.name;
      const summary =
        `Sell ${limit !== undefined ? `up to ${limit} of ` : ""}your lot ${lot.name} (×${lot.quantity}) at ${shop.name} as “${listingName}”, ${money(price)} each` +
        (publish ? "" : ", withdrawn until you publish it on the site") +
        ".";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const result = await sellLot(user, {
        lotId,
        shopId: shop.id,
        name: listingName,
        price,
        limit: limit ?? null,
        publish,
      });
      if (result.error || !result.listingId) {
        return fail(result.error ?? "LOT_NOT_FOUND");
      }
      refresh(
        "/shopping",
        `/shops/${shop.id}`,
        `/shops/${shop.id}/bo/listings`,
      );
      const path = listingPath(result.listingId);
      return toolResult(
        {
          status: "done",
          summary,
          listingId: result.listingId,
          url: siteUrl(path),
        },
        `Done: ${mdLink(listingName, path)} is ${publish ? "on sale" : "created, withdrawn"}.`,
      );
    },
  );

  server.registerTool(
    "update_listing",
    {
      title: "Change a listing of my shop",
      description:
        "Change a listing of a shop the player sells in: adjust its stock (listings that do not follow a lot), change the cap of a lot-linked listing, its price, or withdraw it from sale and put it back. Asks the user to confirm first.",
      inputSchema: z.object({
        listingId: z.string(),
        stockChange: z
          .number()
          .int()
          .optional()
          .describe("Add (positive) or take away (negative) from the stock"),
        stockNote: z.string().max(200).optional(),
        lotLimit: z
          .number()
          .int()
          .min(1)
          .nullable()
          .optional()
          .describe(
            "New cap for a lot-linked listing; null sells the whole lot",
          ),
        price: z.number().int().min(0).optional(),
        hidden: z
          .boolean()
          .optional()
          .describe("true: withdraw from sale; false: put back on sale"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ listingId: z.string(), url: z.string() }),
      annotations: WRITE,
      scopeChallenge: challenges.update_listing,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const listing = await sellerListing(user, args.listingId);
      if (!listing)
        return toolError(`No listing ${args.listingId} in your shops.`);

      const changes: string[] = [];
      if (args.stockChange !== undefined) {
        if (listing.inventoryItemId) return fail("LINKED");
        if (args.stockChange === 0) return fail("INVALID_CHANGE");
        changes.push(
          `stock ${listing.stock} → ${listing.stock + args.stockChange}`,
        );
      }
      if (args.lotLimit !== undefined) {
        if (!listing.inventoryItemId) return fail("NOT_LINKED");
        changes.push(
          `cap ${listing.lotLimit ?? "none"} → ${args.lotLimit ?? "none (whole lot)"}`,
        );
      }
      if (
        args.price !== undefined &&
        args.price !== (Number(listing.price) || 0)
      ) {
        changes.push(
          `price ${money(Number(listing.price) || 0)} → ${money(args.price)}`,
        );
      }
      if (args.hidden !== undefined && args.hidden !== !!listing.hidden) {
        changes.push(args.hidden ? "withdrawn from sale" : "back on sale");
      }
      if (changes.length === 0) return toolError("Nothing to change.");

      const summary = `Change the listing ${listing.name}: ${changes.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      if (args.stockChange !== undefined) {
        const result = await changeManualStock(listing, args.stockChange, {
          note: args.stockNote,
          byName: user.name,
        });
        if (result.error) return fail(result.error);
      }
      if (args.lotLimit !== undefined) {
        const result = await setLotLimit(listing, args.lotLimit);
        if (result.error) return fail(result.error);
      }
      const set: Partial<ShopItemDbModel> = {};
      const unset: Record<string, ""> = {};
      // Le prix est un nombre depuis la refonte ; le type a gardé le texte.
      if (args.price !== undefined) set.price = args.price as unknown as string;
      if (args.hidden === true) set.hidden = true;
      if (args.hidden === false) unset.hidden = "";
      if (Object.keys(set).length || Object.keys(unset).length) {
        await db
          .db()
          .collection<ShopItemDbModel>("shopItems")
          .updateOne(
            { id: listing.id },
            {
              ...(Object.keys(set).length && { $set: set }),
              ...(Object.keys(unset).length && { $unset: unset }),
            },
          );
      }
      refreshListing(listing);
      const path = boListingPath(listing.shopId, listing.id);
      return toolResult(
        {
          status: "done",
          summary,
          listingId: listing.id,
          url: siteUrl(path),
        },
        `Done: ${summary} See ${mdLink("the listing", path)}.`,
      );
    },
  );
}
