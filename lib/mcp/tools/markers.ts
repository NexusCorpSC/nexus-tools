import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  createMarker,
  deleteMarker,
  getMarker,
  listMarkers,
  MarkerError,
  updateMarker,
} from "@/lib/markers";
import {
  bodyAt,
  geoOf,
  parseShowLocation,
  positionOf,
} from "@/lib/nps-geometry";
import { getNpsBodies } from "@/lib/places";
import {
  MARKER_KINDS,
  MAX_MARKER_NAME_LENGTH,
  MAX_MARKER_NOTE_LENGTH,
  type Marker,
  type MarkerCollection,
  type MarkerInput,
} from "@/types/markers";
import type { NpsBody } from "@/types/places";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";

/**
 * Les marqueurs du joueur : les mêmes fonctions que la page `/marqueurs` et
 * l'app (`lib/markers.ts`). Un marqueur se pose à partir d'une ligne
 * `/showlocation`, comme `nps_locate` la lit : « marque ma position » à la
 * voix, dans Nexus Chat, colle ce que le jeu a copié.
 */

const MARKERS_PATH = "/marqueurs";

const listChallenge = personalTool("list_markers", "markers:read");
const addChallenge = personalTool("add_marker", "markers:write");
const updateChallenge = personalTool("update_marker", "markers:write");
const deleteChallenge = personalTool("delete_marker", "markers:write");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const markerSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(MARKER_KINDS),
  note: z.string().optional(),
  collectionId: z.string().optional(),
  collection: z.string().optional(),
  system: z.string(),
  body: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  altitude: z.number().optional(),
  position: z.object({
    body: z.string().optional(),
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  sharedWith: z.string().optional(),
  owner: z.string().optional(),
  isOwner: z.boolean(),
  createdAt: z.string(),
});

const locationInput = z
  .string()
  .describe(
    "The /showlocation line the game copied, e.g. Coordinates: x:-18930539540.392 y:-2610440830.140 z:0.000",
  );

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toEntry(
  marker: Marker,
  bodies: NpsBody[],
): z.infer<typeof markerSchema> {
  const body = marker.bodySlug
    ? bodies.find((one) => one.slug === marker.bodySlug)
    : undefined;
  const geo = body ? geoOf(marker.position, body) : null;
  return {
    id: marker.id,
    name: marker.name,
    kind: marker.kind,
    note: marker.note,
    collectionId: marker.collectionId,
    collection: marker.collectionName,
    system: marker.systemName ?? marker.systemSlug,
    body: marker.bodyName,
    latitude: geo ? round(geo.latitude, 3) : undefined,
    longitude: geo ? round(geo.longitude, 3) : undefined,
    altitude: geo ? Math.round(geo.altitude) : undefined,
    position: marker.position,
    sharedWith: marker.org?.name,
    owner: marker.isOwner ? undefined : marker.ownerName,
    isOwner: marker.isOwner,
    createdAt: marker.createdAt,
  };
}

function entryLine(entry: z.infer<typeof markerSchema>): string {
  const where =
    entry.body && entry.latitude !== undefined
      ? `${entry.body}, ${entry.latitude}° / ${entry.longitude}°, ${entry.altitude} m`
      : `${entry.system} space`;
  const details = [
    entry.kind,
    entry.collection ?? "no collection",
    entry.sharedWith ? `shared with ${entry.sharedWith}` : undefined,
    entry.owner ? `by ${entry.owner}` : undefined,
  ].filter(Boolean);
  return (
    `- ${entry.name} (marker: ${entry.id}) — ${where} — ${details.join(", ")}` +
    (entry.note ? ` — “${entry.note}”` : "")
  );
}

/** Une collection à lui par son id ou son nom exact (sans casse). */
function findCollection(
  collections: MarkerCollection[],
  wanted: string,
): MarkerCollection | undefined {
  const own = collections.filter((collection) => collection.isOwner);
  return (
    own.find((collection) => collection.id === wanted) ??
    own.find(
      (collection) => collection.name.toLowerCase() === wanted.toLowerCase(),
    )
  );
}

/** Une ligne `/showlocation`, en position de marqueur ; ou une erreur. */
function readLocation(
  location: string,
  bodies: NpsBody[],
  system: string | undefined,
):
  | { position: MarkerInput["position"]; systemSlug?: string; where: string }
  | { error: ReturnType<typeof toolError> } {
  const coordinates = parseShowLocation(location);
  if (!coordinates) {
    return {
      error: toolError(
        'Could not read coordinates. Expected the /showlocation line: "Coordinates: x:… y:… z:…".',
      ),
    };
  }
  const fix = { ...coordinates, at: Date.now() };
  const body = bodyAt(fix, bodies);
  const position = positionOf(fix, bodies);
  if (body) return { position, where: body.name };
  if (!system) {
    return {
      error: toolError(
        "This reading is in space, away from any planet or moon: pass system (stanton, pyro, nyx…) to say which star system it is in.",
      ),
    };
  }
  return { position, systemSlug: system, where: `${system} space` };
}

function markerError(error: unknown, what: string) {
  if (error instanceof MarkerError) {
    const reason =
      error.code === "notFound"
        ? "this marker no longer exists"
        : error.code === "forbidden"
          ? "only its creator can change it"
          : error.code === "tooMany"
            ? "the account reached its limit of 1,000 markers"
            : error.message;
    return toolError(`${what}: ${reason}.`);
  }
  throw error;
}

export function registerMarkerTools(server: McpServer) {
  server.registerTool(
    "list_markers",
    {
      title: "List my position markers",
      description:
        "List the signed-in player's position markers (spots saved in game to come back to: ore rocks, wrecks, caves…), newest first, with their collection, body, latitude/longitude and note, including markers of collections their organizations share. Marker ids are what the other marker tools take.",
      inputSchema: z.object({
        collection: z
          .string()
          .optional()
          .describe(
            "Collection id or exact name; none for markers without one",
          ),
        kind: z.enum(MARKER_KINDS).optional(),
        query: z.string().optional().describe("Text in the name or note"),
      }),
      outputSchema: z.object({
        total: z.number(),
        markers: z.array(markerSchema),
        collections: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            count: z.number(),
            sharedWith: z.string().optional(),
            isOwner: z.boolean(),
          }),
        ),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async ({ collection, kind, query }, ctx) => {
      const user = await currentUser(ctx);
      const all = await listMarkers(user.id);
      let collectionFilter: string | undefined;
      if (collection) {
        if (collection === "none") collectionFilter = "none";
        else {
          const found =
            all.collections.find((one) => one.id === collection) ??
            all.collections.find(
              (one) => one.name.toLowerCase() === collection.toLowerCase(),
            );
          if (!found) return toolError(`No marker collection “${collection}”.`);
          collectionFilter = found.id;
        }
      }
      const [{ markers }, bodies] = await Promise.all([
        collectionFilter || kind || query
          ? listMarkers(user.id, { collection: collectionFilter, kind, query })
          : Promise.resolve(all),
        getNpsBodies(),
      ]);
      const entries = markers.map((marker) => toEntry(marker, bodies));
      return toolResult(
        {
          total: entries.length,
          markers: entries,
          collections: all.collections.map((one) => ({
            id: one.id,
            name: one.name,
            count: one.count,
            sharedWith: one.org?.name,
            isOwner: one.isOwner,
          })),
          url: siteUrl(MARKERS_PATH),
        },
        entries.length
          ? `${entries.length} markers in ${mdLink("your markers", MARKERS_PATH)}:\n` +
              entries.map(entryLine).join("\n")
          : `No marker found in ${mdLink("your markers", MARKERS_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "add_marker",
    {
      title: "Mark a position",
      description:
        "Save a position marker from a /showlocation reading, to come back to it later (the Nexus App NPS can guide there): for example ore rocks found without a mining laser. On a planet or moon the marker follows its rotation. Asks the user to confirm first.",
      inputSchema: z.object({
        location: locationInput,
        system: z
          .string()
          .optional()
          .describe(
            "System slug (stanton, pyro, nyx…), only when the reading is in space away from any body",
          ),
        name: z
          .string()
          .max(MAX_MARKER_NAME_LENGTH)
          .optional()
          .describe("Defaults to the body's name and the time"),
        kind: z
          .enum(MARKER_KINDS)
          .optional()
          .describe("ore, wreck, cave, poi (point of interest), danger, other"),
        note: z.string().max(MAX_MARKER_NOTE_LENGTH).optional(),
        collection: z
          .string()
          .optional()
          .describe("One of the player's collections: id or exact name"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ marker: markerSchema, url: z.string() }),
      annotations: WRITE,
      scopeChallenge: addChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const [bodies, { collections }] = await Promise.all([
        getNpsBodies(),
        listMarkers(user.id),
      ]);
      const read = readLocation(args.location, bodies, args.system);
      if ("error" in read) return read.error;
      const collection = args.collection
        ? findCollection(collections, args.collection)
        : undefined;
      if (args.collection && !collection) {
        return toolError(
          `No collection “${args.collection}” of yours. Existing: ${
            collections
              .filter((one) => one.isOwner)
              .map((one) => one.name)
              .join(", ") || "none"
          }.`,
        );
      }
      const name =
        args.name?.trim() ||
        `${read.where} ${new Date().toISOString().slice(11, 16)} UTC`;
      const kind = args.kind ?? "other";

      const summary =
        `Add the marker “${name}” (${kind}) at ${read.where}` +
        (collection ? ` in the collection ${collection.name}` : "") +
        (args.note ? `, note: “${args.note}”` : "") +
        ".";
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let marker: Marker | null;
      try {
        const id = await createMarker(user.id, {
          name,
          kind,
          note: args.note,
          collectionId: collection?.id ?? null,
          position: read.position,
          systemSlug: read.systemSlug,
          source: "showlocation",
        });
        marker = await getMarker(user.id, id);
      } catch (error) {
        return markerError(error, "Nothing was saved");
      }
      return toolResult(
        {
          status: "done",
          summary,
          marker: marker ? toEntry(marker, bodies) : undefined,
          url: siteUrl(MARKERS_PATH),
        },
        `Done: “${name}” is in ${mdLink("your markers", MARKERS_PATH)}; the NPS of Nexus App can guide there.`,
      );
    },
  );

  server.registerTool(
    "update_marker",
    {
      title: "Change a position marker",
      description:
        "Change one of the signed-in player's markers: name, category, note, collection, or its position from a new /showlocation reading. Only the given fields change; null removes the note or the collection. Asks the user to confirm first.",
      inputSchema: z.object({
        markerId: z.string().describe("Marker id, from list_markers"),
        name: z.string().min(1).max(MAX_MARKER_NAME_LENGTH).optional(),
        kind: z.enum(MARKER_KINDS).optional(),
        note: z.string().max(MAX_MARKER_NOTE_LENGTH).nullable().optional(),
        collection: z
          .string()
          .nullable()
          .optional()
          .describe("Collection id or exact name; null for none"),
        location: locationInput.optional(),
        system: z.string().optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ marker: markerSchema }),
      annotations: WRITE,
      scopeChallenge: updateChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const [marker, bodies, { collections }] = await Promise.all([
        getMarker(user.id, args.markerId),
        getNpsBodies(),
        listMarkers(user.id),
      ]);
      if (!marker) return toolError(`No marker ${args.markerId}.`);
      if (!marker.isOwner) {
        return toolError(
          `“${marker.name}” belongs to ${marker.ownerName ?? "another player"}: only its creator can change it.`,
        );
      }

      const input: MarkerInput = {};
      const changes: string[] = [];
      if (args.name !== undefined && args.name !== marker.name) {
        input.name = args.name;
        changes.push(`name → “${args.name}”`);
      }
      if (args.kind !== undefined && args.kind !== marker.kind) {
        input.kind = args.kind;
        changes.push(`category ${marker.kind} → ${args.kind}`);
      }
      if (
        args.note !== undefined &&
        (args.note ?? "") !== (marker.note ?? "")
      ) {
        input.note = args.note ?? "";
        changes.push(`note → ${args.note ? `“${args.note}”` : "none"}`);
      }
      if (args.collection !== undefined) {
        const collection = args.collection
          ? findCollection(collections, args.collection)
          : undefined;
        if (args.collection && !collection) {
          return toolError(`No collection “${args.collection}” of yours.`);
        }
        if ((collection?.id ?? undefined) !== marker.collectionId) {
          input.collectionId = collection?.id ?? null;
          changes.push(
            `collection ${marker.collectionName ?? "none"} → ${collection?.name ?? "none"}`,
          );
        }
      }
      if (args.location !== undefined) {
        const read = readLocation(
          args.location,
          bodies,
          args.system ?? marker.systemSlug,
        );
        if ("error" in read) return read.error;
        input.position = read.position;
        input.systemSlug = read.systemSlug;
        input.source = "showlocation";
        changes.push(`position → ${read.where}`);
      }
      if (changes.length === 0) return toolError("Nothing to change.");

      const summary = `Change the marker “${marker.name}”: ${changes.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let updated: Marker | null;
      try {
        await updateMarker(user.id, marker.id, input);
        updated = await getMarker(user.id, marker.id);
      } catch (error) {
        return markerError(error, "Nothing was changed");
      }
      return toolResult(
        {
          status: "done",
          summary,
          marker: updated ? toEntry(updated, bodies) : undefined,
        },
        `Done: ${summary}`,
      );
    },
  );

  server.registerTool(
    "delete_marker",
    {
      title: "Delete a position marker",
      description:
        "Delete one of the signed-in player's markers, for example once the ore is mined. Asks the user to confirm first.",
      inputSchema: z.object({
        markerId: z.string().describe("Marker id, from list_markers"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ removed: z.boolean() }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: deleteChallenge,
    },
    async ({ markerId, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const marker = await getMarker(user.id, markerId);
      if (!marker) return toolError(`No marker ${markerId}.`);
      if (!marker.isOwner) {
        return toolError(
          `“${marker.name}” belongs to ${marker.ownerName ?? "another player"}: only its creator can delete it.`,
        );
      }
      const summary = `Delete the marker “${marker.name}” (${marker.bodyName ?? marker.systemName ?? marker.systemSlug}).`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        await deleteMarker(user.id, marker.id);
      } catch (error) {
        return markerError(error, "Nothing was removed");
      }
      return toolResult(
        { status: "done", summary, removed: true },
        `Done: the marker “${marker.name}” is deleted.`,
      );
    },
  );
}
