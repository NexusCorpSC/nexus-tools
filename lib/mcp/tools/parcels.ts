import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getInventoryLot } from "@/lib/inventory";
import {
  acceptParcel,
  cancelParcel,
  createParcel,
  listParcels,
  normalizeParcelCode,
  ParcelError,
  previewParcel,
  reservedQuantities,
  type ParcelView,
  type ParcelViewItem,
} from "@/lib/parcels";
import { roundQty } from "@/lib/utils";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";
import { locate } from "./inventory";

/**
 * Les colis entre joueurs : les mêmes fonctions que la page
 * `/inventory/parcels` et l'app (`lib/parcels.ts`). L'expéditeur scelle des
 * lots et reçoit un code ; le destinataire le saisit, voit le contenu et
 * choisit où le ranger. Rien ne bouge avant l'acceptation : les quantités sont
 * seulement réservées.
 */

const PARCELS_PATH = "/inventory/parcels";

/** Le lien que le site donne à partager avec le destinataire. */
const receivePath = (code: string) => `/inventory?parcel=${code}`;

const createChallenge = personalTool("create_parcel", "inventory:write");
const listChallenge = personalTool("list_parcels", "inventory:read");
const acceptChallenge = personalTool("accept_parcel", "inventory:write");
const cancelChallenge = personalTool("cancel_parcel", "inventory:write");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const codeInput = z
  .string()
  .min(1)
  .max(20)
  .describe('Parcel code, 8 letters or digits; "K7QM-2X9A" or lower case work');

const parcelItemSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string().optional(),
  quality: z.number().optional(),
  location: z
    .string()
    .optional()
    .describe("Where the sender keeps it until delivery"),
  lotId: z
    .string()
    .optional()
    .describe("The sender's lot (only on parcels the user sent)"),
});

const parcelSchema = z.object({
  code: z.string(),
  status: z.enum(["pending", "delivered", "cancelled", "expired"]),
  direction: z.enum(["sent", "received"]),
  items: z.array(parcelItemSchema),
  createdAt: z.string(),
  expiresAt: z.string(),
  senderName: z.string().optional(),
  recipientName: z.string().optional(),
  deliveredAt: z.string().optional(),
  deliveredLocation: z.string().optional(),
});

type ParcelOut = z.infer<typeof parcelSchema>;

/** "K7QM-2X9A" : le code comme le site l'affiche. */
function displayCode(code: string) {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

function toItem(item: ParcelViewItem): z.infer<typeof parcelItemSchema> {
  return {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit || undefined,
    quality: item.quality ?? undefined,
    location: item.locationName,
    lotId: item.itemId,
  };
}

function toParcel(parcel: ParcelView): ParcelOut {
  return {
    code: parcel.code,
    status: parcel.status,
    direction: parcel.direction,
    items: parcel.items.map(toItem),
    createdAt: parcel.createdAt,
    expiresAt: parcel.expiresAt,
    senderName: parcel.senderName,
    recipientName: parcel.recipientName,
    deliveredAt: parcel.deliveredAt,
    deliveredLocation: parcel.deliveredLocationName,
  };
}

function quantityText(quantity: number, unit?: string | null) {
  return unit ? `${quantity} ${unit}` : `×${quantity}`;
}

function itemLine(item: z.infer<typeof parcelItemSchema>) {
  return (
    `  - ${item.name}: ${quantityText(item.quantity, item.unit)}` +
    (item.quality !== undefined ? `, quality ${item.quality}` : "") +
    (item.location ? ` (from ${item.location})` : "")
  );
}

function parcelLine(parcel: ParcelOut) {
  const who =
    parcel.direction === "sent"
      ? `sent${parcel.recipientName ? ` to ${parcel.recipientName}` : ""}`
      : `received from ${parcel.senderName ?? "another player"}`;
  const state =
    parcel.status === "pending"
      ? `waiting, code valid until ${parcel.expiresAt}`
      : parcel.status === "delivered"
        ? `delivered ${parcel.deliveredAt ?? ""}${parcel.deliveredLocation ? ` at ${parcel.deliveredLocation}` : ""}`.trim()
        : parcel.status;
  return (
    `- ${displayCode(parcel.code)} — ${who} — ${state}\n` +
    parcel.items.map(itemLine).join("\n")
  );
}

const ERRORS: Record<string, string> = {
  invalid_code: "that is not a parcel code (8 letters or digits)",
  invalid_items: "a lot is no longer in the inventory",
  invalid_location: "pick a storage location of the inventory",
  not_found: "no parcel has this code",
  too_many_attempts: "too many wrong codes lately, try again in a few minutes",
  own_parcel:
    "this is the user's own parcel: the code is for another player to accept",
  delivered: "this parcel was already received",
  cancelled: "the sender cancelled this parcel",
  expired: "this code has expired",
};

function parcelError(error: unknown, what: string) {
  if (error instanceof ParcelError) {
    const reason =
      error.code === "unavailable"
        ? `${error.item ?? "a lot"}: the quantity is no longer available`
        : (ERRORS[error.code] ?? error.code);
    return toolError(`${what}: ${reason}.`);
  }
  throw error;
}

export function registerParcelTools(server: McpServer) {
  server.registerTool(
    "create_parcel",
    {
      title: "Send a parcel to a player",
      description:
        "Seal a parcel from the signed-in player's inventory lots (ids from list_inventory) and get the 8-character code to give to the recipient, who accepts it with accept_parcel or on the site. The quantities stay in the inventory, reserved, until the parcel is accepted (they then leave it), cancelled, or the code expires after 24 hours. Asks the user to confirm first.",
      inputSchema: z.object({
        items: z
          .array(
            z.object({
              lotId: z.string().describe("Lot id, from list_inventory"),
              quantity: z
                .number()
                .positive()
                .optional()
                .describe(
                  "How much of the lot, in its own unit; all that is not already reserved when omitted",
                ),
            }),
          )
          .min(1)
          .max(100),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        parcel: parcelSchema,
        code: z.string(),
        shareUrl: z
          .string()
          .describe("Link the recipient can open to accept the parcel"),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: createChallenge,
    },
    async ({ items, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const reserved = await reservedQuantities(user.id);

      // Le même lot deux fois compte pour la somme, comme dans `createParcel`.
      const wanted = new Map<string, number | undefined>();
      for (const item of items) {
        if (wanted.has(item.lotId)) {
          const before = wanted.get(item.lotId);
          wanted.set(
            item.lotId,
            before === undefined || item.quantity === undefined
              ? undefined
              : roundQty(before + item.quantity),
          );
        } else {
          wanted.set(item.lotId, item.quantity);
        }
      }

      const entries: { itemId: string; quantity: number }[] = [];
      const lines: string[] = [];
      for (const [lotId, asked] of wanted) {
        const lot = await getInventoryLot(user.id, lotId);
        if (!lot) return toolError(`No lot ${lotId} in your inventory.`);
        const unit = (lot.unit as string) || undefined;
        const held = reserved.get(lotId) ?? 0;
        const available = roundQty((lot.quantity as number) - held);
        if (available <= 0) {
          return toolError(
            `${lot.name}: all of it is already reserved by parcels waiting to be accepted.`,
          );
        }
        const quantity = asked ?? available;
        if (quantity > available + 1e-9) {
          return toolError(
            `${lot.name}: only ${quantityText(available, unit)} available` +
              (held
                ? ` (${quantityText(held, unit)} already reserved by other parcels).`
                : "."),
          );
        }
        entries.push({ itemId: lotId, quantity });
        lines.push(
          `- ${lot.name}: ${quantityText(quantity, unit)}` +
            (typeof lot.quality === "number" ? `, quality ${lot.quality}` : ""),
        );
      }

      const summary =
        `Seal a parcel from ${user.name}'s inventory:\n${lines.join("\n")}\n` +
        "These quantities stay in the inventory, reserved, until another player accepts the code (valid 24 hours); they then leave the inventory.";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let parcel: ParcelView;
      try {
        parcel = await createParcel(user, entries);
      } catch (error) {
        return parcelError(error, "No parcel was sealed");
      }
      const shown = toParcel(parcel);
      return toolResult(
        {
          status: "done",
          summary,
          parcel: shown,
          code: parcel.code,
          shareUrl: siteUrl(receivePath(parcel.code)),
          url: siteUrl(PARCELS_PATH),
        },
        `Done: the parcel code is **${displayCode(parcel.code)}**, valid until ${parcel.expiresAt}. Give it to the recipient, or this link: ${siteUrl(receivePath(parcel.code))}. See ${mdLink("your parcels", PARCELS_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "list_parcels",
    {
      title: "List my parcels",
      description:
        "List the parcels the signed-in player sent or received over the last 30 days, newest first: code, state (pending, delivered, cancelled, expired), contents, the other player and where it was stored. Codes are what cancel_parcel takes.",
      inputSchema: z.object({
        direction: z.enum(["sent", "received"]).optional(),
        status: z
          .enum(["pending", "delivered", "cancelled", "expired"])
          .optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        parcels: z.array(parcelSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async ({ direction, status }, ctx) => {
      const user = await currentUser(ctx);
      const parcels = (await listParcels(user.id))
        .filter((parcel) => !direction || parcel.direction === direction)
        .filter((parcel) => !status || parcel.status === status)
        .map(toParcel);
      return toolResult(
        { total: parcels.length, parcels, url: siteUrl(PARCELS_PATH) },
        parcels.length
          ? `${parcels.length} parcels in ${mdLink("your parcels", PARCELS_PATH)}:\n` +
              parcels.map(parcelLine).join("\n")
          : `No parcel in ${mdLink("your parcels", PARCELS_PATH)} over the last 30 days.`,
      );
    },
  );

  server.registerTool(
    "accept_parcel",
    {
      title: "Accept a parcel",
      description:
        "Accept a parcel another player sent, by its code: shows what it holds and who sent it, then moves its lots from the sender's inventory into the signed-in player's, at the location given (a matching lot there is topped up). Wrong codes count against the player (ten in ten minutes, then a wait). Asks the user to confirm first; declining leaves the parcel waiting.",
      inputSchema: z.object({
        code: codeInput,
        location: z
          .string()
          .describe(
            "Where to store the lots: inventory location id (search_inventory_locations), place slug or exact name",
          ),
        shareWithOrg: z
          .boolean()
          .optional()
          .describe("Let the player's organizations see these lots"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        parcel: parcelSchema,
        created: z.number(),
        merged: z.number(),
        location: z.string(),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: acceptChallenge,
    },
    async ({ code, location, shareWithOrg, confirm }, ctx) => {
      const user = await currentUser(ctx);
      let preview: ParcelOut;
      try {
        preview = toParcel(await previewParcel(user.id, code));
      } catch (error) {
        return parcelError(error, "Nothing was received");
      }
      const found = await locate(user.id, location);
      if (found.error) return found.error;
      const place = found.location;

      const summary =
        `Accept parcel ${displayCode(preview.code)} from ${preview.senderName ?? "another player"} into ${user.name}'s inventory at ${place.name}` +
        (shareWithOrg ? " (shared with the organization)" : "") +
        `:\n${preview.items.map((item) => itemLine({ ...item, location: undefined })).join("\n")}\n` +
        "The lots leave the sender's inventory.";
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let result: Awaited<ReturnType<typeof acceptParcel>>;
      try {
        result = await acceptParcel(user, code, {
          locationId: place.id,
          orgVisible: shareWithOrg === true,
        });
      } catch (error) {
        return parcelError(error, "Nothing was received");
      }
      return toolResult(
        {
          status: "done",
          summary,
          parcel: toParcel(result.parcel),
          created: result.created,
          merged: result.merged,
          location: place.name,
          url: siteUrl("/inventory"),
        },
        `Done: ${result.created} new lots, ${result.merged} added to lots already at ${place.name}. See ${mdLink("the inventory", "/inventory")}.`,
      );
    },
  );

  server.registerTool(
    "cancel_parcel",
    {
      title: "Cancel a parcel",
      description:
        "Take back a parcel the signed-in player sent that is still waiting (code from list_parcels): its code stops working and the reserved quantities are free again. Nothing had left the inventory. Asks the user to confirm first.",
      inputSchema: z.object({
        code: codeInput,
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ parcel: parcelSchema }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: cancelChallenge,
    },
    async ({ code, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const normalized = normalizeParcelCode(code);
      if (!normalized) {
        return toolError(`Nothing was cancelled: ${ERRORS.invalid_code}.`);
      }
      const parcel = (await listParcels(user.id))
        .map(toParcel)
        .find((one) => one.code === normalized && one.direction === "sent");
      if (!parcel) {
        return toolError(
          `Nothing was cancelled: no parcel ${displayCode(normalized)} among those you sent (list_parcels).`,
        );
      }
      if (parcel.status !== "pending") {
        return toolError(
          `Nothing was cancelled: parcel ${displayCode(normalized)} is ${parcel.status}.`,
        );
      }

      const summary =
        `Cancel parcel ${displayCode(parcel.code)}: its code stops working and these quantities are no longer reserved:\n` +
        parcel.items.map(itemLine).join("\n");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let cancelled: ParcelView;
      try {
        cancelled = await cancelParcel(user.id, normalized);
      } catch (error) {
        return parcelError(error, "Nothing was cancelled");
      }
      return toolResult(
        { status: "done", summary, parcel: toParcel(cancelled) },
        `Done: parcel ${displayCode(parcel.code)} is cancelled. See ${mdLink("your parcels", PARCELS_PATH)}.`,
      );
    },
  );
}
