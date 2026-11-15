import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "bson";
import { z } from "zod";
import {
  actOnOffer,
  changeRequest,
  createOffer,
  createRequest,
  getRequestDetail,
  listBoard,
  listMyOffers,
  listMyOrgs,
  listMyRequests,
  postOfferMessage,
  requestUnitFor,
  RequestError,
  type Actor,
  type RequestChange,
} from "@/lib/player-requests";
import {
  MAX_OFFER_MESSAGE,
  MAX_REQUEST_NAME,
  MAX_REQUEST_NOTE,
  OFFER_ACTIONS,
  quantityLabel,
  REQUEST_KIND_FILTERS,
  requestPath,
  type PlayerRequest,
  type RequestOffer,
} from "@/types/requests";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";
import { locate } from "./inventory";

/**
 * Le tableau des demandes (`lib/player-requests.ts`) : les mêmes règles que
 * la page `/demandes` et l'app. Lire le tableau, publier une demande, faire
 * une offre (« J'en ai ») et négocier dans son fil.
 */

const BOARD_PATH = "/demandes";

const searchChallenge = personalTool("search_requests", "requests:read");
const getChallenge = personalTool("get_request", "requests:read");
const mineChallenge = personalTool("my_requests", "requests:read");
const createChallenge = personalTool("create_request", "requests:write");
const updateChallenge = personalTool("update_request", "requests:write");
const offerChallenge = personalTool("offer_request", "requests:write");
const messageChallenge = personalTool("offer_message", "requests:write");
const actionChallenge = personalTool("offer_action", "requests:write");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const requestSchema = z.object({
  id: z.string(),
  userName: z.string(),
  name: z.string(),
  itemSlug: z.string().optional(),
  kind: z.string(),
  quantity: z.number(),
  unit: z.string().optional(),
  minQuality: z.number().optional(),
  location: z.object({ id: z.string(), name: z.string(), system: z.string().optional() }).optional(),
  unitPrice: z.number().optional(),
  note: z.string().optional(),
  audience: z.object({
    friends: z.boolean(),
    orgs: z.array(z.object({ id: z.string(), name: z.string() })),
    public: z.boolean(),
  }),
  status: z.string(),
  received: z.number(),
  remaining: z.number(),
  activeOffers: z.number(),
  expiresAt: z.string(),
  createdAt: z.string(),
  mine: z.boolean(),
  myOffer: z.object({ id: z.string(), status: z.string() }).optional(),
  supply: z
    .object({
      quantity: z.number(),
      quality: z.number().optional(),
      locationName: z.string().optional(),
    })
    .optional(),
  url: z.string(),
});

const offerSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  userName: z.string(),
  quantity: z.number(),
  quality: z.number().optional(),
  unitPrice: z.number().optional(),
  locationName: z.string().optional(),
  status: z.string(),
  receivedQuantity: z.number().optional(),
  timeline: z.array(
    z.object({
      at: z.string(),
      role: z.string(),
      authorName: z.string(),
      kind: z.string(),
      body: z.string().optional(),
      unitPrice: z.number().optional(),
      status: z.string().optional(),
      quantity: z.number().optional(),
    }),
  ),
});

function shownRequest(request: PlayerRequest): z.infer<typeof requestSchema> {
  return {
    id: request.id,
    userName: request.userName,
    name: request.name,
    itemSlug: request.itemSlug,
    kind: request.kind,
    quantity: request.quantity,
    unit: request.unit,
    minQuality: request.minQuality,
    location: request.location,
    unitPrice: request.unitPrice,
    note: request.note,
    audience: request.audience,
    status: request.status,
    received: request.received,
    remaining: request.remaining,
    activeOffers: request.activeOffers,
    expiresAt: request.expiresAt,
    createdAt: request.createdAt,
    mine: request.mine,
    myOffer: request.myOffer,
    supply: request.supply,
    url: siteUrl(requestPath(request.id)),
  };
}

function shownOffer(offer: RequestOffer): z.infer<typeof offerSchema> {
  return {
    id: offer.id,
    requestId: offer.requestId,
    userName: offer.userName,
    quantity: offer.quantity,
    quality: offer.quality,
    unitPrice: offer.unitPrice,
    locationName: offer.locationName,
    status: offer.status,
    receivedQuantity: offer.receivedQuantity,
    timeline: offer.timeline.map((entry) => ({
      at: entry.at,
      role: entry.role,
      authorName: entry.authorName,
      kind: entry.kind,
      body: entry.body,
      unitPrice: entry.unitPrice,
      status: entry.status,
      quantity: entry.quantity,
    })),
  };
}

function audienceText(request: PlayerRequest): string {
  return [
    request.audience.friends ? "friends" : null,
    ...request.audience.orgs.map((org) => org.name),
    request.audience.public ? "public" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function requestLine(request: PlayerRequest): string {
  const details = [
    quantityLabel(request.quantity, request.unit),
    request.minQuality !== undefined ? `quality ≥ ${request.minQuality}` : null,
    request.unitPrice !== undefined ? `${request.unitPrice} aUEC each` : "price negotiable",
    request.location ? `pickup ${request.location.name}` : null,
    `${quantityLabel(request.remaining, request.unit)} still missing`,
    request.status !== "OPEN" ? request.status.toLowerCase() : `expires ${request.expiresAt}`,
  ].filter(Boolean);
  return (
    `- ${mdLink(request.name, requestPath(request.id))} by ${request.userName} (request: ${request.id}) — ${details.join(", ")}` +
    ` — for ${audienceText(request)}` +
    (request.supply
      ? ` — you hold ${quantityLabel(request.supply.quantity, request.unit)}${request.supply.locationName ? ` at ${request.supply.locationName}` : ""}`
      : "") +
    (request.myOffer ? ` — your offer ${request.myOffer.id} is ${request.myOffer.status.toLowerCase()}` : "")
  );
}

function offerLine(offer: RequestOffer, unit?: string): string {
  const last = offer.timeline.filter((entry) => entry.kind !== "status").at(-1);
  return (
    `- Offer ${offer.id} from ${offer.userName}: ${quantityLabel(offer.quantity, unit)}` +
    (offer.quality !== undefined ? `, quality ${offer.quality}` : "") +
    (offer.unitPrice !== undefined ? `, ${offer.unitPrice} aUEC each` : "") +
    ` — ${offer.status.toLowerCase()}` +
    (last
      ? ` — last: ${last.authorName}: ${last.kind === "price" ? `price ${last.unitPrice} aUEC` : `“${last.body}”`}`
      : "")
  );
}

function requestError(error: unknown, what: string) {
  if (error instanceof RequestError) {
    return toolError(`${what}: ${error.detail ?? error.code}.`);
  }
  throw error;
}

function actorOf(user: { id: string; name: string }): Actor {
  return { id: new ObjectId(user.id), name: user.name || "?" };
}

/** Des orgas désignées par leur id ou leur nom, parmi celles du joueur. */
async function resolveOrgs(
  userId: ObjectId,
  references: string[] | undefined,
): Promise<{ ids: string[] } | { error: ReturnType<typeof toolError> }> {
  if (!references?.length) return { ids: [] };
  const mine = await listMyOrgs(userId);
  const ids: string[] = [];
  for (const reference of references) {
    const wanted = reference.trim().toLowerCase();
    const org = mine.find((entry) => entry.id === reference || entry.name.toLowerCase() === wanted);
    if (!org) {
      return {
        error: toolError(
          `“${reference}” is not one of your organizations. Yours: ${mine.map((entry) => `${entry.name} (id: ${entry.id})`).join(", ") || "none"}.`,
        ),
      };
    }
    ids.push(org.id);
  }
  return { ids };
}

const audienceInput = z
  .object({
    friends: z.boolean().optional().describe("Shown to the player's friends"),
    orgs: z
      .array(z.string())
      .max(10)
      .optional()
      .describe("Organizations the player belongs to (ids or names) whose members see it"),
    public: z.boolean().optional().describe("Shown to every signed-in player"),
  })
  .describe("Who sees the request; friends and all the player's organizations by default");

export function registerRequestTools(server: McpServer) {
  server.registerTool(
    "search_requests",
    {
      title: "Browse the request board",
      description:
        "Browse the open requests on the Nexus request board that the signed-in player can see (from friends, their organizations, or public): what someone needs, how much, minimum quality, price, pickup place, what is still missing. `canSupply` keeps only what the player's inventory covers. Request ids are what get_request and offer_request take.",
      inputSchema: z.object({
        query: z.string().optional().describe("Part of the item or material name"),
        audience: z.enum(["friends", "orgs", "public"]).optional(),
        kind: z.enum(REQUEST_KIND_FILTERS).optional().describe("resource = materials, item = items and weapons, vehicle = ships"),
        system: z.string().optional().describe("Star system of the pickup place, e.g. Stanton"),
        canSupply: z.boolean().optional().describe("Only requests the player's inventory can cover"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        requests: z.array(requestSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: searchChallenge,
    },
    async ({ query, audience, kind, system, canSupply, limit }, ctx) => {
      const user = await currentUser(ctx);
      const { requests, total } = await listBoard(new ObjectId(user.id), {
        q: query,
        audience,
        kind,
        system,
        supply: canSupply,
        limit: limit ?? 20,
      });
      return toolResult(
        { total, requests: requests.map(shownRequest), url: siteUrl(BOARD_PATH) },
        requests.length
          ? `${total} open requests on ${mdLink("the request board", BOARD_PATH)}${requests.length < total ? ` (first ${requests.length})` : ""}:\n` +
              requests.map(requestLine).join("\n")
          : `No open request matches on ${mdLink("the request board", BOARD_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "get_request",
    {
      title: "Read a request",
      description:
        "Read one request of the board with the offers the player can see: all of them with their conversation for the author, their own offer for a supplier. Also lists the player's inventory lots of that name, for offer_request.",
      inputSchema: z.object({
        requestId: z.string().describe("Request id, from search_requests or my_requests"),
      }),
      outputSchema: z.object({
        request: requestSchema,
        offers: z.array(offerSchema),
        lots: z.array(
          z.object({
            id: z.string(),
            quality: z.number().optional(),
            inRequestUnit: z.number(),
            locationName: z.string().optional(),
            belowMinimum: z.boolean(),
          }),
        ),
      }),
      annotations: READ_ONLY,
      scopeChallenge: getChallenge,
    },
    async ({ requestId }, ctx) => {
      const user = await currentUser(ctx);
      const detail = await getRequestDetail(requestId, new ObjectId(user.id));
      if (!detail) return toolError(`No request ${requestId} visible to you.`);
      const { request, offers, lots } = detail;
      return toolResult(
        {
          request: shownRequest(request),
          offers: offers.map(shownOffer),
          lots: lots.map((lot) => ({
            id: lot.id,
            quality: lot.quality,
            inRequestUnit: lot.inRequestUnit,
            locationName: lot.locationName,
            belowMinimum: lot.belowMinimum,
          })),
        },
        `${requestLine(request)}` +
          (request.note ? `\nNote: “${request.note}”` : "") +
          (offers.length
            ? `\n\nOffers:\n${offers.map((offer) => offerLine(offer, request.unit)).join("\n")}`
            : request.mine
              ? "\n\nNo offer yet."
              : "") +
          (lots.length
            ? `\n\nYour lots of ${request.name}:\n${lots
                .map(
                  (lot) =>
                    `- lot ${lot.id}: ${quantityLabel(lot.inRequestUnit, request.unit)}${lot.quality !== undefined ? `, quality ${lot.quality}` : ""}${lot.locationName ? ` at ${lot.locationName}` : ""}${lot.belowMinimum ? " (below the minimum quality)" : ""}`,
                )
                .join("\n")}`
            : ""),
      );
    },
  );

  server.registerTool(
    "my_requests",
    {
      title: "List my requests and offers",
      description:
        "List the signed-in player's own requests (open first, then recently closed) and the offers they made on other players' requests.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        requests: z.array(requestSchema),
        offers: z.array(offerSchema.extend({ request: requestSchema })),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: mineChallenge,
    },
    async (_args, ctx) => {
      const user = await currentUser(ctx);
      const userId = new ObjectId(user.id);
      const [requests, offers] = await Promise.all([listMyRequests(userId), listMyOffers(userId)]);
      return toolResult(
        {
          requests: requests.map(shownRequest),
          offers: offers.map((offer) => ({ ...shownOffer(offer), request: shownRequest(offer.request) })),
          url: siteUrl(`${BOARD_PATH}?view=mine`),
        },
        (requests.length
          ? `Your requests:\n${requests.map(requestLine).join("\n")}`
          : "You have no recent request.") +
          "\n\n" +
          (offers.length
            ? `Your offers:\n${offers
                .map((offer) => `${offerLine(offer, offer.request.unit)} — on ${offer.request.name} by ${offer.request.userName} (request: ${offer.request.id})`)
                .join("\n")}`
            : "You have no recent offer."),
      );
    },
  );

  server.registerTool(
    "create_request",
    {
      title: "Post a request",
      description:
        "Post a request on the Nexus request board (“I need…”): an item or material from the catalogue or free text, quantity (SCU or cSCU for a material, a count otherwise), minimum quality out of 1000, pickup place, price per unit (omit to negotiate), note, who sees it and how long it stays open. Friends and organization members are told. Asks the user to confirm first.",
      inputSchema: z.object({
        name: z.string().min(1).max(MAX_REQUEST_NAME).describe("What is needed: catalogue name (e.g. Riccite) or free text"),
        quantity: z.number().positive(),
        unit: z.enum(["SCU", "cSCU"]).optional().describe("For a material; SCU by default for a catalogue resource; omit for a count of objects"),
        minQuality: z.number().int().min(0).max(1000).optional(),
        location: z.string().optional().describe("Pickup place: inventory location id, place slug or exact name"),
        unitPrice: z.number().int().min(0).optional().describe("aUEC per unit; omit for “negotiable”"),
        note: z.string().max(MAX_REQUEST_NOTE).optional(),
        audience: audienceInput.optional(),
        expiresInDays: z
          .union([z.literal(1), z.literal(3), z.literal(7), z.literal(14), z.literal(30)])
          .optional()
          .describe("1, 3, 7 (default), 14 or 30"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ request: requestSchema }),
      annotations: WRITE,
      scopeChallenge: createChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const actor = actorOf(user);
      let locationId: string | undefined;
      let locationName: string | undefined;
      if (args.location) {
        const found = await locate(user.id, args.location);
        if (found.error) return found.error;
        locationId = found.location.id;
        locationName = found.location.name;
      }
      const mine = await listMyOrgs(actor.id);
      let orgIds = mine.map((org) => org.id);
      if (args.audience?.orgs !== undefined) {
        const resolved = await resolveOrgs(actor.id, args.audience.orgs);
        if ("error" in resolved) return resolved.error;
        orgIds = resolved.ids;
      }
      const audience = {
        friends: args.audience?.friends ?? true,
        orgIds,
        public: args.audience?.public ?? false,
      };
      const orgNames = mine.filter((org) => orgIds.includes(org.id)).map((org) => org.name);
      const summary =
        `Post a request for ${quantityLabel(args.quantity, await requestUnitFor(args.name, args.unit))} of ${args.name}` +
        (args.minQuality !== undefined ? `, quality ≥ ${args.minQuality}` : "") +
        (args.unitPrice !== undefined ? `, ${args.unitPrice} aUEC each` : ", price negotiable") +
        (locationName ? `, pickup at ${locationName}` : "") +
        `, open ${args.expiresInDays ?? 7} days, for ${[audience.friends ? "your friends" : null, ...orgNames, audience.public ? "everyone" : null].filter(Boolean).join(", ") || "nobody"}` +
        (args.note ? `. Note: “${args.note}”` : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        const request = await createRequest(actor, {
          name: args.name,
          quantity: args.quantity,
          unit: args.unit ?? null,
          minQuality: args.minQuality ?? null,
          locationId: locationId ?? null,
          unitPrice: args.unitPrice ?? null,
          note: args.note ?? null,
          audience,
          expiresInDays: args.expiresInDays,
        });
        return toolResult(
          { status: "done", summary, request: shownRequest(request) },
          `Done: ${mdLink(`your request for ${request.name}`, requestPath(request.id))} is on the board (request: ${request.id}).`,
        );
      } catch (error) {
        return requestError(error, "Nothing was posted");
      }
    },
  );

  server.registerTool(
    "update_request",
    {
      title: "Change, extend or close my request",
      description:
        "Change one of the player's own requests (quantity, minimum quality, pickup place, price, note, audience), extend how long it stays open, or close it. What is requested cannot change: close and post another. Asks the user to confirm first.",
      inputSchema: z.object({
        requestId: z.string(),
        action: z.enum(["update", "extend", "close"]),
        quantity: z.number().positive().optional(),
        minQuality: z.number().int().min(0).max(1000).nullable().optional(),
        location: z.string().nullable().optional().describe("Pickup place; null removes it"),
        unitPrice: z.number().int().min(0).nullable().optional().describe("null: negotiable"),
        note: z.string().max(MAX_REQUEST_NOTE).nullable().optional(),
        audience: audienceInput.optional(),
        days: z.number().int().optional().describe("For extend: 1, 3, 7, 14 or 30 more days"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ request: requestSchema }),
      annotations: WRITE,
      scopeChallenge: updateChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const actor = actorOf(user);
      const detail = await getRequestDetail(args.requestId, actor.id);
      if (!detail || !detail.request.mine) return toolError(`No request ${args.requestId} of yours.`);
      const current = detail.request;

      let change: RequestChange;
      let summary: string;
      if (args.action === "close") {
        change = { action: "close" };
        summary = `Close your request for ${current.name}.`;
      } else if (args.action === "extend") {
        if (!args.days) return toolError("Pass days to extend the request.");
        change = { action: "extend", days: args.days };
        summary = `Keep your request for ${current.name} open ${args.days} more days.`;
      } else {
        const parts: string[] = [];
        const update: Extract<RequestChange, { action: "update" }> = { action: "update" };
        if (args.quantity !== undefined) {
          update.quantity = args.quantity;
          parts.push(`quantity → ${quantityLabel(args.quantity, current.unit)}`);
        }
        if (args.minQuality !== undefined) {
          update.minQuality = args.minQuality;
          parts.push(`minimum quality → ${args.minQuality ?? "none"}`);
        }
        if (args.location !== undefined) {
          if (args.location === null) {
            update.locationId = null;
            parts.push("no pickup place");
          } else {
            const found = await locate(user.id, args.location);
            if (found.error) return found.error;
            update.locationId = found.location.id;
            parts.push(`pickup → ${found.location.name}`);
          }
        }
        if (args.unitPrice !== undefined) {
          update.unitPrice = args.unitPrice;
          parts.push(`price → ${args.unitPrice === null ? "negotiable" : `${args.unitPrice} aUEC`}`);
        }
        if (args.note !== undefined) {
          update.note = args.note;
          parts.push(`note → ${args.note ? `“${args.note}”` : "none"}`);
        }
        if (args.audience !== undefined) {
          let orgIds = current.audience.orgs.map((org) => org.id);
          if (args.audience.orgs !== undefined) {
            const resolved = await resolveOrgs(actor.id, args.audience.orgs);
            if ("error" in resolved) return resolved.error;
            orgIds = resolved.ids;
          }
          update.audience = {
            friends: args.audience.friends ?? current.audience.friends,
            orgIds,
            public: args.audience.public ?? current.audience.public,
          };
          parts.push("audience changed");
        }
        if (parts.length === 0) return toolError("Nothing to change.");
        change = update;
        summary = `Change your request for ${current.name}: ${parts.join("; ")}.`;
      }
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        const request = await changeRequest(actor, current.id, change);
        return toolResult(
          { status: "done", summary, request: shownRequest(request) },
          `Done: ${summary} See ${mdLink("the request", requestPath(request.id))}.`,
        );
      } catch (error) {
        return requestError(error, "Nothing was changed");
      }
    },
  );

  server.registerTool(
    "offer_request",
    {
      title: "Answer a request (I have it)",
      description:
        "Answer another player's request with an offer: quantity, quality, price per unit (the request's by default) and a message, optionally from one of the player's inventory lots (get_request lists them; the lot fills quantity and quality). Opens a private conversation with the requester. Asks the user to confirm first.",
      inputSchema: z.object({
        requestId: z.string(),
        lotId: z.string().optional().describe("Inventory lot id the offer comes from"),
        quantity: z.number().positive().optional().describe("In the request's unit; the lot or what is missing by default"),
        quality: z.number().int().min(0).max(1000).optional(),
        unitPrice: z.number().int().min(0).optional(),
        message: z.string().max(MAX_OFFER_MESSAGE).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ offer: offerSchema, url: z.string() }),
      annotations: WRITE,
      scopeChallenge: offerChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const actor = actorOf(user);
      const detail = await getRequestDetail(args.requestId, actor.id);
      if (!detail) return toolError(`No request ${args.requestId} visible to you.`);
      const { request } = detail;
      const lot = args.lotId ? detail.lots.find((entry) => entry.id === args.lotId) : undefined;
      if (args.lotId && !lot) return toolError(`Lot ${args.lotId} is not one of your lots of ${request.name}.`);
      if (!lot && args.quantity === undefined) return toolError("Pass quantity, or lotId to offer from a lot.");
      const quantity =
        args.quantity ??
        (request.remaining > 0 ? Math.min(lot!.inRequestUnit, request.remaining) : lot!.inRequestUnit);
      const quality = args.quality ?? lot?.quality;
      const unitPrice = args.unitPrice ?? request.unitPrice;
      const summary =
        `Offer ${request.userName} ${quantityLabel(quantity, request.unit)} of ${request.name}` +
        (quality !== undefined ? `, quality ${quality}` : "") +
        (unitPrice !== undefined ? `, ${unitPrice} aUEC each` : ", price to negotiate") +
        (lot?.locationName ? `, from your lot at ${lot.locationName}` : "") +
        (args.message ? `, with the message “${args.message}”` : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        const offer = await createOffer(actor, request.id, {
          quantity,
          quality: quality ?? null,
          unitPrice: unitPrice ?? null,
          inventoryItemId: lot?.id ?? null,
          message: args.message ?? null,
        });
        const path = requestPath(request.id, offer.id);
        return toolResult(
          { status: "done", summary, offer: shownOffer(offer), url: siteUrl(path) },
          `Done: offer ${offer.id} sent. Follow the conversation on ${mdLink("the request", path)}.`,
        );
      } catch (error) {
        return requestError(error, "No offer was sent");
      }
    },
  );

  server.registerTool(
    "offer_message",
    {
      title: "Write in an offer's conversation",
      description:
        "Send a message in the private conversation of an offer, as the requester or as the supplier. Asks the user to confirm first.",
      inputSchema: z.object({
        offerId: z.string().describe("Offer id, from get_request or my_requests"),
        message: z.string().min(1).max(MAX_OFFER_MESSAGE),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ offer: offerSchema }),
      annotations: WRITE,
      scopeChallenge: messageChallenge,
    },
    async ({ offerId, message, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const summary = `Send “${message}” in the conversation of offer ${offerId}.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        const offer = await postOfferMessage(actorOf(user), offerId, message);
        return toolResult(
          { status: "done", summary, offer: shownOffer(offer) },
          `Done: message sent. See ${mdLink("the request", requestPath(offer.requestId, offer.id))}.`,
        );
      } catch (error) {
        return requestError(error, "Nothing was sent");
      }
    },
  );

  server.registerTool(
    "offer_action",
    {
      title: "Act on an offer",
      description:
        "Act on an offer of the request board. The requester can keep it, decline it, or mark it received (quantity, and storeAt to add what was received to the inventory); the supplier can withdraw it; either can propose a price per unit. Asks the user to confirm first.",
      inputSchema: z.object({
        offerId: z.string(),
        action: z.enum(OFFER_ACTIONS),
        unitPrice: z.number().int().min(0).optional().describe("For price: aUEC per unit"),
        quantity: z.number().positive().optional().describe("For receive: what was received; the whole offer by default, never more than the offer"),
        storeAt: z
          .string()
          .optional()
          .describe("For receive: inventory location (id, place slug or exact name) to add what was received"),
        message: z.string().max(MAX_OFFER_MESSAGE).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ offer: offerSchema, request: requestSchema }),
      annotations: WRITE,
      scopeChallenge: actionChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      if (args.action === "price" && args.unitPrice === undefined) {
        return toolError("Pass unitPrice to propose a price.");
      }
      let storeAt: { id: string; name: string } | undefined;
      if (args.storeAt) {
        if (args.action !== "receive") return toolError("storeAt only goes with receive.");
        const found = await locate(user.id, args.storeAt);
        if (found.error) return found.error;
        storeAt = found.location;
      }
      const verbs: Record<(typeof OFFER_ACTIONS)[number], string> = {
        keep: "Keep",
        decline: "Decline",
        receive: "Mark as received",
        withdraw: "Withdraw",
        price: `Propose ${args.unitPrice} aUEC per unit on`,
      };
      const summary =
        `${verbs[args.action]} offer ${args.offerId}` +
        (args.action === "receive" && args.quantity !== undefined ? ` (${args.quantity} received)` : "") +
        (storeAt ? `, adding it to your inventory at ${storeAt.name}` : "") +
        (args.message ? `, with the message “${args.message}”` : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        const result = await actOnOffer(actorOf(user), args.offerId, args.action, {
          unitPrice: args.unitPrice,
          quantity: args.quantity,
          message: args.message ?? null,
          addToInventory: storeAt ? { locationId: storeAt.id } : null,
        });
        return toolResult(
          {
            status: "done",
            summary,
            offer: shownOffer(result.offer),
            request: shownRequest(result.request),
          },
          `Done: offer ${result.offer.id} is ${result.offer.status.toLowerCase()}; ${quantityLabel(result.request.remaining, result.request.unit)} still missing on ${mdLink(result.request.name, requestPath(result.request.id, result.offer.id))}.` +
            (result.inventory && !result.inventory.added
              ? ` It could not be added to the inventory (${result.inventory.error}): add it by hand.`
              : result.inventory?.added
                ? " Added to the inventory."
                : ""),
        );
      } catch (error) {
        return requestError(error, "Nothing was changed");
      }
    },
  );
}
