import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  createMarkerCollection,
  deleteMarkerCollection,
  listMarkers,
  MarkerError,
  updateMarkerCollection,
} from "@/lib/markers";
import {
  MARKER_COLORS,
  MAX_MARKER_COLLECTIONS,
  MAX_MARKER_COLLECTION_NAME_LENGTH,
  type MarkerCollection,
  type MarkerCollectionInput,
  type MarkerColor,
  type MarkerOrg,
} from "@/types/markers";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";

/**
 * Les collections de marqueurs du joueur : les mêmes fonctions que la page
 * `/marqueurs` (`lib/markers.ts`), les mêmes contrôles. Une collection se
 * partage avec une de ses organisations ; supprimer une collection garde ses
 * marqueurs, sans collection, et retire ses invités (`forgetTarget`, appelé
 * par `deleteMarkerCollection` comme pour le site).
 */

const MARKERS_PATH = "/marqueurs";

const listChallenge = personalTool("list_marker_collections", "markers:read");
const createChallenge = personalTool(
  "create_marker_collection",
  "markers:write",
);
const updateChallenge = personalTool(
  "update_marker_collection",
  "markers:write",
);
const deleteChallenge = personalTool(
  "delete_marker_collection",
  "markers:write",
);

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

/** Les couleurs du site, par un nom lisible ; même ordre que `MARKER_COLORS`. */
const COLOR_NAMES = [
  "mint",
  "orange",
  "pink",
  "blue",
  "lime",
  "sand",
  "coral",
  "violet",
] as const;

const colorInput = z
  .enum([...COLOR_NAMES, ...MARKER_COLORS])
  .describe(
    "One of the site's colors, by name (mint, orange, pink, blue, lime, sand, coral, violet) or hex. Mint is also the color of markers without a collection.",
  );

/** Comme la fenêtre « Nouvelle collection » du site. */
const DEFAULT_NEW_COLOR: MarkerColor = MARKER_COLORS[1];

function toColor(value: z.infer<typeof colorInput>): MarkerColor {
  const index = (COLOR_NAMES as readonly string[]).indexOf(value);
  return index >= 0 ? MARKER_COLORS[index] : (value as MarkerColor);
}

function colorName(color: MarkerColor): string {
  return COLOR_NAMES[MARKER_COLORS.indexOf(color)] ?? color;
}

const orgInput = z
  .string()
  .nullable()
  .optional()
  .describe(
    "One of the player's organizations (id, name or tag, see list_marker_collections) whose members will see the collection and its markers; null to keep it to the player alone",
  );

const collectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  colorName: z.string(),
  markerCount: z.number(),
  isOwner: z.boolean(),
  owner: z.string().optional(),
  sharedWithOrg: z.string().optional(),
  sharedWithMe: z.boolean().optional(),
  guestCount: z.number().optional(),
  url: z.string(),
});

const orgSchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string().optional(),
});

function collectionPath(id: string): string {
  return `${MARKERS_PATH}?collection=${encodeURIComponent(id)}`;
}

function toEntry(
  collection: MarkerCollection,
): z.infer<typeof collectionSchema> {
  return {
    id: collection.id,
    name: collection.name,
    color: collection.color,
    colorName: colorName(collection.color),
    markerCount: collection.count,
    isOwner: collection.isOwner,
    owner: collection.isOwner ? undefined : collection.ownerName,
    sharedWithOrg: collection.org?.name,
    sharedWithMe: collection.sharedWithMe,
    guestCount: collection.guestCount,
    url: siteUrl(collectionPath(collection.id)),
  };
}

function entryLine(entry: z.infer<typeof collectionSchema>): string {
  const details = [
    `${entry.markerCount} markers`,
    entry.colorName,
    entry.owner ? `by ${entry.owner}` : undefined,
    entry.sharedWithOrg ? `shared with ${entry.sharedWithOrg}` : undefined,
    entry.sharedWithMe ? "shared with you" : undefined,
    entry.guestCount ? `${entry.guestCount} players invited` : undefined,
  ].filter(Boolean);
  return `- ${mdLink(entry.name, collectionPath(entry.id))} (collection: ${entry.id}) — ${details.join(", ")}`;
}

function orgLabel(org: MarkerOrg): string {
  return org.tag ? `${org.name} [${org.tag}]` : org.name;
}

/** Une organisation par son id, son nom ou son tag (sans casse). */
function findOrg(orgs: MarkerOrg[], wanted: string): MarkerOrg | undefined {
  const lower = wanted.trim().toLowerCase();
  return (
    orgs.find((org) => org.id === wanted) ??
    orgs.find((org) => org.name.toLowerCase() === lower) ??
    orgs.find((org) => org.tag?.toLowerCase() === lower)
  );
}

/** Une de ses collections par son id ou son nom exact (sans casse). */
function findOwn(
  collections: MarkerCollection[],
  wanted: string,
): MarkerCollection | undefined {
  const own = collections.filter((collection) => collection.isOwner);
  return (
    own.find((collection) => collection.id === wanted) ??
    own.find(
      (collection) =>
        collection.name.toLowerCase() === wanted.trim().toLowerCase(),
    )
  );
}

function collectionError(error: unknown, what: string) {
  if (error instanceof MarkerError) {
    const reason =
      error.code === "notFound"
        ? "this collection no longer exists"
        : error.code === "forbidden"
          ? "only its creator can change it"
          : error.code === "notMember"
            ? "the player is not a member of that organization"
            : error.code === "tooMany"
              ? `the account reached its limit of ${MAX_MARKER_COLLECTIONS} collections`
              : error.message;
    return toolError(`${what}: ${reason}.`);
  }
  throw error;
}

export function registerMarkerCollectionTools(server: McpServer) {
  server.registerTool(
    "list_marker_collections",
    {
      title: "List my marker collections",
      description:
        "List the marker collections the signed-in player sees: their own, those an organization of theirs shares, and those another player invited them to, each with its number of markers, color and who it is shared with. Also lists the player's organizations, to share a collection with. Collection ids are what the other collection tools, list_markers and the sharing tools (kind markerCollection) take.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        total: z.number(),
        collections: z.array(collectionSchema),
        orgs: z.array(orgSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async (_args, ctx) => {
      const user = await currentUser(ctx);
      const { collections, orgs } = await listMarkers(user.id);
      const entries = collections.map(toEntry);
      return toolResult(
        {
          total: entries.length,
          collections: entries,
          orgs: orgs.map((org) => ({
            id: org.id,
            name: org.name,
            tag: org.tag,
          })),
          url: siteUrl(MARKERS_PATH),
        },
        (entries.length
          ? `${entries.length} collections in ${mdLink("your markers", MARKERS_PATH)}:\n` +
            entries.map(entryLine).join("\n")
          : `No marker collection yet in ${mdLink("your markers", MARKERS_PATH)}.`) +
          (orgs.length
            ? `\n\nOrganizations to share with: ${orgs.map((org) => `${orgLabel(org)} (org: ${org.id})`).join(", ")}.`
            : ""),
      );
    },
  );

  server.registerTool(
    "create_marker_collection",
    {
      title: "Create a marker collection",
      description:
        "Create a marker collection (a folder of position markers, with its color on the map), kept to the player or shared with one of their organizations, whose members then see its markers. Markers go into it with add_marker or update_marker. Asks the user to confirm first.",
      inputSchema: z.object({
        name: z.string().min(1).max(MAX_MARKER_COLLECTION_NAME_LENGTH),
        color: colorInput.optional().describe("Defaults to orange"),
        sharedWith: orgInput,
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        collection: collectionSchema,
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: createChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const { collections, orgs } = await listMarkers(user.id);
      const name = args.name.trim();
      if (!name) return toolError("The collection needs a name.");
      if (
        collections.filter((one) => one.isOwner).length >=
        MAX_MARKER_COLLECTIONS
      ) {
        return toolError(
          `The account already has ${MAX_MARKER_COLLECTIONS} collections, the limit: delete one first.`,
        );
      }
      const org = args.sharedWith ? findOrg(orgs, args.sharedWith) : undefined;
      if (args.sharedWith && !org) {
        return toolError(
          `“${args.sharedWith}” is not one of the player's organizations. Theirs: ${
            orgs.map(orgLabel).join(", ") || "none"
          }.`,
        );
      }
      const color = args.color ? toColor(args.color) : DEFAULT_NEW_COLOR;

      const summary =
        `Create the marker collection “${name}” (${colorName(color)}), ` +
        (org
          ? `shared with the members of ${orgLabel(org)}.`
          : "visible to you alone.");
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const input: MarkerCollectionInput = {
        name,
        color,
        orgId: org?.id ?? null,
      };
      let id: string;
      try {
        id = await createMarkerCollection(user.id, input);
      } catch (error) {
        return collectionError(error, "Nothing was created");
      }
      const created = (await listMarkers(user.id)).collections.find(
        (one) => one.id === id,
      );
      return toolResult(
        {
          status: "done",
          summary,
          collection: created ? toEntry(created) : undefined,
          url: siteUrl(collectionPath(id)),
        },
        `Done: ${mdLink(name, collectionPath(id))} (collection: ${id}) is in your markers.`,
      );
    },
  );

  server.registerTool(
    "update_marker_collection",
    {
      title: "Change a marker collection",
      description:
        "Rename one of the signed-in player's marker collections, change its color, or who sees it (one of their organizations, or null for the player alone). Only the given fields change. Players invited one by one keep their access (see unshare). Asks the user to confirm first.",
      inputSchema: z.object({
        collection: z
          .string()
          .describe(
            "Collection id (from list_marker_collections) or exact name",
          ),
        name: z
          .string()
          .min(1)
          .max(MAX_MARKER_COLLECTION_NAME_LENGTH)
          .optional(),
        color: colorInput.optional(),
        sharedWith: orgInput,
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ collection: collectionSchema }),
      annotations: WRITE,
      scopeChallenge: updateChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const { collections, orgs } = await listMarkers(user.id);
      const collection = findOwn(collections, args.collection);
      if (!collection) {
        const shared = collections.find((one) => one.id === args.collection);
        return toolError(
          shared
            ? `“${shared.name}” belongs to ${shared.ownerName ?? "another player"}: only its creator can change it.`
            : `No collection “${args.collection}” of yours.`,
        );
      }

      const input: MarkerCollectionInput = {};
      const changes: string[] = [];
      const name = args.name?.trim();
      if (args.name !== undefined && !name) {
        return toolError("The collection needs a name.");
      }
      if (name && name !== collection.name) {
        input.name = name;
        changes.push(`name → “${name}”`);
      }
      if (args.color !== undefined) {
        const color = toColor(args.color);
        if (color !== collection.color) {
          input.color = color;
          changes.push(
            `color ${colorName(collection.color)} → ${colorName(color)}`,
          );
        }
      }
      if (args.sharedWith !== undefined) {
        // L'organisation qu'il a quittée reste acceptée si elle ne change pas.
        const choices = collection.org
          ? [
              ...orgs.filter((org) => org.id !== collection.org!.id),
              collection.org,
            ]
          : orgs;
        const org = args.sharedWith
          ? findOrg(choices, args.sharedWith)
          : undefined;
        if (args.sharedWith && !org) {
          return toolError(
            `“${args.sharedWith}” is not one of the player's organizations. Theirs: ${
              orgs.map(orgLabel).join(", ") || "none"
            }.`,
          );
        }
        if ((org?.id ?? undefined) !== collection.org?.id) {
          input.orgId = org?.id ?? null;
          changes.push(
            org
              ? `shared with the members of ${orgLabel(org)}` +
                  (collection.org
                    ? ` instead of ${orgLabel(collection.org)}`
                    : "")
              : `no longer shared with ${orgLabel(collection.org!)}`,
          );
        }
      }
      if (changes.length === 0) return toolError("Nothing to change.");

      const summary = `Change the marker collection “${collection.name}”: ${changes.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      try {
        await updateMarkerCollection(user.id, collection.id, input);
      } catch (error) {
        return collectionError(error, "Nothing was changed");
      }
      const updated = (await listMarkers(user.id)).collections.find(
        (one) => one.id === collection.id,
      );
      return toolResult(
        {
          status: "done",
          summary,
          collection: updated ? toEntry(updated) : undefined,
        },
        `Done: ${summary}`,
      );
    },
  );

  server.registerTool(
    "delete_marker_collection",
    {
      title: "Delete a marker collection",
      description:
        "Delete one of the signed-in player's marker collections. Its markers are kept, without a collection; the organization and the players it was shared with no longer see them. Asks the user to confirm first.",
      inputSchema: z.object({
        collection: z
          .string()
          .describe(
            "Collection id (from list_marker_collections) or exact name",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ removed: z.boolean() }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: deleteChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const { collections } = await listMarkers(user.id);
      const collection = findOwn(collections, args.collection);
      if (!collection) {
        const shared = collections.find((one) => one.id === args.collection);
        return toolError(
          shared
            ? `“${shared.name}” belongs to ${shared.ownerName ?? "another player"}: only its creator can delete it (leave_share takes it out of your list).`
            : `No collection “${args.collection}” of yours.`,
        );
      }
      const lost = [
        collection.org ? `the members of ${orgLabel(collection.org)}` : "",
        collection.guestCount
          ? `the ${collection.guestCount} invited players`
          : "",
      ].filter(Boolean);
      const summary =
        `Delete the marker collection “${collection.name}”: its ${collection.count} markers are kept, without a collection` +
        (lost.length ? `, and ${lost.join(" and ")} no longer see them.` : ".");
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;
      try {
        await deleteMarkerCollection(user.id, collection.id);
      } catch (error) {
        return collectionError(error, "Nothing was removed");
      }
      return toolResult(
        { status: "done", summary, removed: true },
        `Done: the collection “${collection.name}” is deleted; its markers are in ${mdLink("your markers", MARKERS_PATH)}, without a collection.`,
      );
    },
  );
}
