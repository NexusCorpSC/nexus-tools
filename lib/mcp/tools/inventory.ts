import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  deleteInventoryLot,
  getInventoryLot,
  listInventory,
  resolveInventoryLocation,
  searchInventoryLocations,
  updateInventoryLot,
  type InventoryLocation,
  type InventoryLot,
  type LotChanges,
} from "@/lib/inventory";
import { addInventoryRows } from "@/lib/inventory-quick-add";
import { roundQty } from "@/lib/utils";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import {
  mdLink,
  PAGE_SIZE,
  READ_ONLY,
  siteUrl,
  toolError,
  toolResult,
} from "../format";

const INVENTORY_PATH = "/inventory";

const listChallenge = personalTool("list_inventory", "inventory:read");
const locationsChallenge = personalTool(
  "search_inventory_locations",
  "inventory:read",
);
const addChallenge = personalTool("add_inventory", "inventory:write");
const moveChallenge = personalTool("move_inventory_lot", "inventory:write");
const updateChallenge = personalTool("update_inventory_lot", "inventory:write");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  system: z.string().optional(),
  placeSlug: z.string().optional(),
  personal: z.boolean(),
});

const lotSchema = z.object({
  id: z.string(),
  name: z.string(),
  quantity: z.number(),
  unit: z.string().optional(),
  quality: z.number().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  locationId: z.string(),
  reserved: z.number().optional(),
  onSale: z
    .array(z.object({ shopName: z.string(), price: z.number() }))
    .optional(),
  sharedWithOrg: z.boolean(),
});

function toLocation(location: InventoryLocation) {
  return {
    id: location.id,
    name: location.name,
    system: location.system,
    placeSlug: location.placeSlug,
    personal: !!location.userId,
  };
}

function toLot(lot: InventoryLot): z.infer<typeof lotSchema> {
  const sales = lot.sales?.filter((sale) => sale.onSale);
  return {
    id: lot.id,
    name: lot.name,
    quantity: lot.quantity,
    unit: lot.unit || undefined,
    quality: lot.quality ?? undefined,
    description: lot.description || undefined,
    location: lot.location?.name,
    locationId: lot.locationId,
    reserved: lot.reserved || undefined,
    onSale: sales?.length
      ? sales.map((sale) => ({ shopName: sale.shopName, price: sale.price }))
      : undefined,
    sharedWithOrg: lot.orgVisible,
  };
}

function quantityText(quantity: number, unit?: string | null) {
  return unit ? `${quantity} ${unit}` : `×${quantity}`;
}

function lotLine(lot: z.infer<typeof lotSchema>): string {
  const details = [
    quantityText(lot.quantity, lot.unit),
    lot.quality !== undefined ? `quality ${lot.quality}` : undefined,
    lot.location ? `at ${lot.location}` : undefined,
    lot.reserved ? `${lot.reserved} reserved for parcels` : undefined,
    lot.onSale
      ? `on sale at ${lot.onSale.map((s) => s.shopName).join(", ")}`
      : undefined,
  ].filter(Boolean);
  return `- ${lot.name} (lot: ${lot.id}) — ${details.join(", ")}${lot.description ? ` — “${lot.description}”` : ""}`;
}

/** Le lieu désigné, ou la réponse d'erreur qui liste les lieux possibles. */
async function locate(userId: string, reference: string) {
  const found = await resolveInventoryLocation(userId, reference);
  if (found.location) return { location: found.location };
  const options = found.candidates.map(
    (candidate) => `- ${candidate.name} (id: ${candidate.id})`,
  );
  return {
    error: toolError(
      `No single inventory location matches "${reference}".` +
        (options.length
          ? ` Pass one of these ids as location:\n${options.join("\n")}`
          : " Search with search_inventory_locations, or create the location on the site first."),
    ),
  };
}

export function registerInventoryTools(server: McpServer) {
  server.registerTool(
    "list_inventory",
    {
      title: "List my inventory",
      description:
        "List the signed-in player's inventory lots (item, quantity, quality, location, what parcels reserve and which shops sell it), most recently changed first. Lot ids are what the other inventory tools take.",
      inputSchema: z.object({
        query: z.string().optional().describe("Part of the item name"),
        location: z
          .string()
          .optional()
          .describe("Only this location: its id, place slug or exact name"),
        minQuality: z.number().int().min(0).optional(),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        page: z.number(),
        lots: z.array(lotSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async ({ query, location, minQuality, page = 1, pageSize }, ctx) => {
      const user = await currentUser(ctx);
      let locationId: string | undefined;
      if (location) {
        const found = await locate(user.id, location);
        if (found.error) return found.error;
        locationId = found.location.id;
      }
      const all = (
        await listInventory(user.id, {
          query,
          locationId,
          minQuality,
        })
      ).map(toLot);
      const size = pageSize ?? PAGE_SIZE.max;
      const lots = all.slice((page - 1) * size, page * size);
      return toolResult(
        { total: all.length, page, lots, url: siteUrl(INVENTORY_PATH) },
        `${all.length} lots in ${mdLink("your inventory", INVENTORY_PATH)}` +
          (all.length > lots.length ? ` (page ${page})` : "") +
          ":\n" +
          lots.map(lotLine).join("\n"),
      );
    },
  );

  server.registerTool(
    "search_inventory_locations",
    {
      title: "Find an inventory location",
      description:
        "Find where lots can be stored: the game's places (stations, cities, outposts) and the locations the player named themselves. Returns ids for add_inventory and move_inventory_lot.",
      inputSchema: z.object({
        query: z.string().optional().describe("Part of the location name"),
      }),
      outputSchema: z.object({ locations: z.array(locationSchema) }),
      annotations: READ_ONLY,
      scopeChallenge: locationsChallenge,
    },
    async ({ query }, ctx) => {
      const user = await currentUser(ctx);
      const locations = (
        await searchInventoryLocations(user.id, query ?? "", 20)
      ).map(toLocation);
      return toolResult(
        { locations },
        locations.length
          ? locations
              .map(
                (l) =>
                  `- ${l.name} (id: ${l.id})${l.system ? ` — ${l.system}` : ""}${l.personal ? " — personal" : ""}`,
              )
              .join("\n")
          : "No location matches.",
      );
    },
  );

  server.registerTool(
    "add_inventory",
    {
      title: "Add to my inventory",
      description:
        "Add lots to the signed-in player's inventory at one location. A lot matching one already held there (same name, quality, unit and note) tops it up instead of creating a second one. Asks the user to confirm first.",
      inputSchema: z.object({
        location: z
          .string()
          .describe(
            "Where the lots are: location id (search_inventory_locations), place slug or exact name",
          ),
        lots: z
          .array(
            z.object({
              name: z
                .string()
                .min(1)
                .describe("Item name, ideally as in the catalog"),
              quantity: z.number().positive(),
              unit: z
                .string()
                .optional()
                .describe("e.g. SCU, cSCU; omit for units"),
              quality: z.number().int().min(0).max(1000).optional(),
              description: z.string().max(500).optional().describe("A note"),
            }),
          )
          .min(1)
          .max(100),
        shareWithOrg: z
          .boolean()
          .optional()
          .describe("Let the player's organizations see these lots"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        created: z.number(),
        merged: z.number(),
        location: z.string(),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: addChallenge,
    },
    async ({ location, lots, shareWithOrg, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const found = await locate(user.id, location);
      if (found.error) return found.error;
      const place = found.location;

      const summary =
        `Add to ${user.name}'s inventory at ${place.name}:\n` +
        lots
          .map(
            (lot) =>
              `- ${lot.name}: ${quantityText(lot.quantity, lot.unit)}${lot.quality !== undefined ? `, quality ${lot.quality}` : ""}${lot.description ? ` (“${lot.description}”)` : ""}`,
          )
          .join("\n");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const result = await addInventoryRows(
        user.id,
        lots.map((lot) => ({
          ...lot,
          locationId: place.id,
          orgVisible: shareWithOrg === true,
        })),
      );
      if (!result.ok) return toolError(`Nothing was added: ${result.error}.`);
      return toolResult(
        {
          status: "done",
          summary,
          created: result.created,
          merged: result.merged,
          location: place.name,
          url: siteUrl(INVENTORY_PATH),
        },
        `Done: ${result.created} new lots, ${result.merged} added to lots already at ${place.name}. See ${mdLink("the inventory", INVENTORY_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "move_inventory_lot",
    {
      title: "Move a lot",
      description:
        "Move one of the signed-in player's lots to another location, whole or in part (moving part of it splits the lot). Asks the user to confirm first.",
      inputSchema: z.object({
        lotId: z.string().describe("Lot id, from list_inventory"),
        location: z
          .string()
          .describe("Destination: location id, place slug or exact name"),
        quantity: z
          .number()
          .positive()
          .optional()
          .describe("How much to move; the whole lot when omitted"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ lotId: z.string(), location: z.string() }),
      annotations: WRITE,
      scopeChallenge: moveChallenge,
    },
    async ({ lotId, location, quantity, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const lot = await getInventoryLot(user.id, lotId);
      if (!lot) return toolError(`No lot ${lotId} in your inventory.`);
      const found = await locate(user.id, location);
      if (found.error) return found.error;
      const place = found.location;
      if (place.id === lot.locationId) {
        return toolError(`${lot.name} is already at ${place.name}.`);
      }
      const total = lot.quantity as number;
      const part =
        quantity !== undefined && quantity < total ? quantity : undefined;
      if (quantity !== undefined && quantity > total) {
        return toolError(
          `The lot only holds ${quantityText(total, lot.unit as string)}.`,
        );
      }

      const summary = `Move ${part !== undefined ? quantityText(part, lot.unit as string) + " of " : ""}${lot.name} (${quantityText(total, lot.unit as string)}) to ${place.name}.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      if (part === undefined) {
        await updateInventoryLot(user.id, lotId, { locationId: place.id });
        return toolResult(
          { status: "done", summary, lotId, location: place.name },
          `Done: ${lot.name} is now at ${place.name}.`,
        );
      }
      // Une partie : le lot d'origine garde le reste, la part rejoint (ou crée)
      // le lot identique du lieu d'arrivée.
      const added = await addInventoryRows(user.id, [
        {
          name: lot.name as string,
          quantity: part,
          unit: (lot.unit as string) || undefined,
          quality: (lot.quality as number) ?? undefined,
          description: (lot.description as string) || undefined,
          locationId: place.id,
          orgVisible: lot.orgVisible === true,
        },
      ]);
      if (!added.ok) return toolError(`Nothing was moved: ${added.error}.`);
      await updateInventoryLot(user.id, lotId, {
        quantity: roundQty(total - part),
      });
      return toolResult(
        { status: "done", summary, lotId, location: place.name },
        `Done: ${quantityText(part, lot.unit as string)} of ${lot.name} moved to ${place.name}; ${quantityText(roundQty(total - part), lot.unit as string)} stay behind.`,
      );
    },
  );

  server.registerTool(
    "update_inventory_lot",
    {
      title: "Change or remove a lot",
      description:
        "Change one of the signed-in player's lots: set or adjust its quantity, its quality, unit, name or note, its sharing with the organization, or remove it. Asks the user to confirm first.",
      inputSchema: z.object({
        lotId: z.string().describe("Lot id, from list_inventory"),
        quantity: z.number().min(0).optional().describe("New quantity"),
        adjust: z
          .number()
          .optional()
          .describe("Add (positive) or take away (negative) from the quantity"),
        quality: z.number().int().min(0).max(1000).nullable().optional(),
        name: z.string().min(1).optional(),
        unit: z.string().nullable().optional(),
        description: z.string().max(500).nullable().optional(),
        shareWithOrg: z.boolean().optional(),
        remove: z
          .boolean()
          .optional()
          .describe("Remove the lot from the inventory"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        lot: lotSchema.partial(),
        removed: z.boolean(),
      }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: updateChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const lot = await getInventoryLot(user.id, args.lotId);
      if (!lot) return toolError(`No lot ${args.lotId} in your inventory.`);
      const unit = (lot.unit as string) || undefined;
      const current = lot.quantity as number;

      if (args.remove) {
        const summary = `Remove ${lot.name} (${quantityText(current, unit)}) from the inventory.`;
        const confirmation = confirmWrite(ctx, summary, args.confirm);
        if (!confirmation.confirmed) return confirmation.result;
        await deleteInventoryLot(user.id, args.lotId);
        return toolResult(
          { status: "done", summary, removed: true },
          `Done: ${lot.name} removed.`,
        );
      }

      const changes: LotChanges = {};
      const lines: string[] = [];
      if (args.quantity !== undefined && args.adjust !== undefined) {
        return toolError("Give either quantity or adjust, not both.");
      }
      if (args.quantity !== undefined || args.adjust !== undefined) {
        const next = roundQty(args.quantity ?? current + (args.adjust ?? 0));
        if (next < 0) {
          return toolError(
            `The lot only holds ${quantityText(current, unit)}.`,
          );
        }
        changes.quantity = next;
        lines.push(
          `quantity ${quantityText(current, unit)} → ${quantityText(next, args.unit ?? unit)}`,
        );
      }
      if (args.quality !== undefined) {
        changes.quality = args.quality;
        lines.push(
          `quality ${lot.quality ?? "none"} → ${args.quality ?? "none"}`,
        );
      }
      if (args.name !== undefined) {
        changes.name = args.name;
        lines.push(`name “${lot.name}” → “${args.name}”`);
      }
      if (args.unit !== undefined) {
        changes.unit = args.unit;
        lines.push(`unit ${unit ?? "none"} → ${args.unit || "none"}`);
      }
      if (args.description !== undefined) {
        changes.description = args.description;
        lines.push(
          `note → ${args.description ? `“${args.description}”` : "none"}`,
        );
      }
      if (args.shareWithOrg !== undefined) {
        changes.orgVisible = args.shareWithOrg;
        lines.push(
          args.shareWithOrg
            ? "shared with the organization"
            : "no longer shared with the organization",
        );
      }
      if (lines.length === 0) return toolError("Nothing to change.");

      const summary = `Change ${lot.name} (lot ${args.lotId}): ${lines.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let updated;
      try {
        updated = await updateInventoryLot(user.id, args.lotId, changes);
      } catch (error) {
        return toolError(`Nothing was changed: ${(error as Error).message}.`);
      }
      if (!updated) return toolError(`No lot ${args.lotId} in your inventory.`);
      return toolResult(
        {
          status: "done",
          summary,
          removed: false,
          lot: {
            id: args.lotId,
            name: updated.name,
            quantity: updated.quantity,
            unit: updated.unit || undefined,
            quality: updated.quality ?? undefined,
            description: updated.description || undefined,
            locationId: updated.locationId,
            sharedWithOrg: updated.orgVisible === true,
          },
        },
        `Done: ${summary}`,
      );
    },
  );
}
