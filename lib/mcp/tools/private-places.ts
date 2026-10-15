import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import en from "@/messages/en.json";
import { ContributionError } from "@/lib/contribution-store";
import { getStanding } from "@/lib/contributions";
import { getNpsData, getPlaceBySlug } from "@/lib/places";
import { parseShowLocation, positionOf } from "@/lib/nps-geometry";
import {
  countOwnedPrivatePlaces,
  createPrivatePlace,
  deletePrivatePlace,
  getPrivatePlace,
  myOrgOptions,
  PrivatePlaceError,
  updatePrivatePlace,
} from "@/lib/private-places";
import { proposePrivatePlace } from "@/lib/private-place-proposal";
import { DIRECT_EDIT_LEVEL } from "@/types/contributions";
import type { Place, PlacePosition } from "@/types/places";
import { MAX_PLACE_NAME_LENGTH } from "@/types/places";
import {
  MAX_PRIVATE_PLACE_DESCRIPTION_LENGTH,
  MAX_PRIVATE_PLACES,
  PRIVATE_PLACE_TYPES,
  type PrivatePlace,
  type PrivatePlaceInput,
} from "@/types/private-places";
import { currentUser, personalTool, type McpUser } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, siteUrl, toolError, toolResult } from "../format";
import { contributionErrorText } from "./contributions";
import { placePath } from "./places";

/**
 * Les lieux privés du joueur : créer, modifier, supprimer, proposer au
 * public. Les mêmes fonctions que les routes `/api/lieux/prives/**`
 * (`lib/private-places.ts`, `lib/private-place-proposal.ts`), donc les mêmes
 * règles : un parent public, une organisation au plus, son créateur seul le
 * modifie, 200 par compte. La lecture passe par `search_places` et `get_place`.
 *
 * L'image ne se téléverse pas d'ici : celle qu'il a garde sa place.
 */

/** La liste de ses lieux privés sur le site. */
const PRIVATE_PATH = "/lieux?visibilite=prives";

const createChallenge = personalTool("create_private_place", "inventory:write");
const updateChallenge = personalTool("update_private_place", "inventory:write");
const deleteChallenge = personalTool("delete_private_place", "inventory:write");
// Proposer au public, c'est contribuer : la portée des contributions.
const proposeChallenge = personalTool(
  "propose_private_place",
  "contributions:write",
);

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const ERRORS = en.PrivatePlaces.errors as Record<string, string>;

const privatePlaceSchema = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  parentSlug: z.string(),
  parentName: z.string().optional(),
  systemName: z.string().optional(),
  bodyName: z.string().optional(),
  description: z.string().optional(),
  position: z
    .object({
      body: z.string().optional(),
      x: z.number(),
      y: z.number(),
      z: z.number(),
    })
    .optional(),
  sharedWith: z
    .string()
    .optional()
    .describe("Organization that sees it; absent when only its creator does"),
  locationId: z
    .string()
    .describe("Inventory location id where lots can be stored in this place"),
  proposalStatus: z.string().optional(),
  url: z.string(),
});

function toOut(place: PrivatePlace): z.infer<typeof privatePlaceSchema> {
  return {
    slug: place.slug,
    name: place.name,
    type: place.type,
    parentSlug: place.parentSlug,
    parentName: place.parentName,
    systemName: place.systemName,
    bodyName: place.bodyName,
    description: place.description,
    position: place.position
      ? {
          body: place.position.body,
          x: place.position.x,
          y: place.position.y,
          z: place.position.z,
        }
      : undefined,
    sharedWith: place.org?.name,
    locationId: place.locationId,
    proposalStatus: place.proposal?.status,
    url: siteUrl(placePath(place.slug)),
  };
}

function privateError(error: unknown, what: string) {
  if (error instanceof PrivatePlaceError) {
    const message = ERRORS[error.code] ?? error.code;
    const detail =
      error.message && error.message !== error.code
        ? ` (${error.message})`
        : "";
    return toolError(`${what}: ${message}${detail}`);
  }
  if (error instanceof ContributionError) {
    return toolError(`${what}: ${contributionErrorText(error)}`);
  }
  throw error;
}

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

/** Le parent : un lieu public qui n'est pas un magasin, comme l'exige le site. */
async function publicParent(
  slug: string,
): Promise<{ place: Place } | { error: ReturnType<typeof toolError> }> {
  const place = await getPlaceBySlug(slug);
  if (!place || place.type === "shop") {
    return {
      error: toolError(
        `${ERRORS.parentNotFound} (${slug}): pass the slug of a public place that is not a shop (search_places).`,
      ),
    };
  }
  return { place };
}

/** L'organisation désignée par id, nom ou tag, parmi les siennes. */
async function resolveOrg(user: McpUser, reference: string) {
  const orgs = await myOrgOptions(user.id);
  const text = reference.trim().toLowerCase();
  const found = orgs.filter(
    (org) =>
      org.id === reference.trim() ||
      org.name.toLowerCase() === text ||
      org.tag?.toLowerCase() === text,
  );
  if (found.length === 1) return { org: found[0] };
  return {
    error: toolError(
      orgs.length
        ? `No single organization of yours matches "${reference}". Yours: ${orgs.map((org) => `${org.name}${org.tag ? ` [${org.tag}]` : ""} (id: ${org.id})`).join(", ")}.`
        : "You are not a member of any organization: the place can only be private to you.",
    ),
  };
}

/** Une lecture /showlocation, ramenée au repère du corps où elle a été prise. */
async function readPosition(
  line: string,
): Promise<
  | { position: PlacePosition; bodyName?: string }
  | { error: ReturnType<typeof toolError> }
> {
  const coordinates = parseShowLocation(line);
  if (!coordinates) {
    return {
      error: toolError(
        'Could not read coordinates. Expected the /showlocation line: "Coordinates: x:… y:… z:…".',
      ),
    };
  }
  const { bodies } = await getNpsData();
  const position = positionOf({ ...coordinates, at: Date.now() }, bodies);
  const body = position.body
    ? bodies.find((one) => one.slug === position.body)
    : undefined;
  return { position, bodyName: body?.name };
}

function positionText(position: PlacePosition, bodyName?: string) {
  return position.body
    ? `on ${bodyName ?? position.body} (${position.x}, ${position.y}, ${position.z} m)`
    : `in space (${position.x}, ${position.y}, ${position.z} m)`;
}

const nameInput = z.string().min(1).max(MAX_PLACE_NAME_LENGTH);
const descriptionInput = z.string().max(MAX_PRIVATE_PLACE_DESCRIPTION_LENGTH);
const showLocationInput = z
  .string()
  .describe(
    "The /showlocation line taken at the place in game (Coordinates: x:… y:… z:…), for the NPS",
  );
const orgInput = z
  .string()
  .describe(
    "One of the user's organizations (id, name or tag) whose members also see the place and can store lots there",
  );

export function registerPrivatePlaceTools(server: McpServer) {
  server.registerTool(
    "create_private_place",
    {
      title: "Create a private place",
      description:
        "Create a private place (a base, hangar, hideout… missing from the public catalog) inside a public place, visible only to the signed-in player or also to one of their organizations. It becomes an inventory location where lots can be stored. At most 200 per account. Asks the user to confirm first.",
      inputSchema: z.object({
        name: nameInput,
        type: z.enum(PRIVATE_PLACE_TYPES),
        parent: z
          .string()
          .describe(
            "Slug of the public place that contains it (search_places); not a shop",
          ),
        description: descriptionInput.optional(),
        showLocation: showLocationInput.optional(),
        org: orgInput.optional(),
        fromLocationId: z
          .string()
          .optional()
          .describe(
            "Turn one of the user's own named inventory locations (personal: true in search_inventory_locations) into this place; its lots stay there",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ place: privatePlaceSchema, url: z.string() }),
      annotations: WRITE,
      scopeChallenge: createChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      if ((await countOwnedPrivatePlaces(user.id)) >= MAX_PRIVATE_PLACES) {
        return toolError(`Nothing was created: ${ERRORS.tooMany}`);
      }
      const parent = await publicParent(args.parent);
      if ("error" in parent) return parent.error;

      let orgName: string | undefined;
      let orgId: string | undefined;
      if (args.org !== undefined) {
        const found = await resolveOrg(user, args.org);
        if (found.error) return found.error;
        orgId = found.org.id;
        orgName = found.org.name;
      }
      let position: PlacePosition | undefined;
      let bodyName: string | undefined;
      if (args.showLocation !== undefined) {
        const read = await readPosition(args.showLocation);
        if ("error" in read) return read.error;
        position = read.position;
        bodyName = read.bodyName;
      }
      if (
        args.fromLocationId !== undefined &&
        !ObjectId.isValid(args.fromLocationId)
      ) {
        return toolError(`Nothing was created: ${ERRORS.notFound}`);
      }

      const input: PrivatePlaceInput = {
        name: args.name,
        type: args.type,
        parentSlug: parent.place.slug,
        description: args.description ?? null,
        position: position ?? null,
        orgId: orgId ?? null,
      };
      const summary =
        `Create the private place “${args.name.trim()}” (${args.type}) inside ${parent.place.name}, visible to ${orgName ? `${user.name} and the members of ${orgName}` : `${user.name} only`}` +
        (position ? `, position ${positionText(position, bodyName)}` : "") +
        (args.description
          ? `, description: “${args.description.trim()}”`
          : "") +
        (args.fromLocationId
          ? `. The inventory location ${args.fromLocationId} becomes this place, its lots stay there.`
          : ". It becomes an inventory location.");
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let slug: string;
      try {
        slug = await createPrivatePlace(user.id, input, args.fromLocationId);
      } catch (error) {
        return privateError(error, "Nothing was created");
      }
      refresh("/lieux");
      const place = await getPrivatePlace(user.id, slug);
      return toolResult(
        {
          status: "done",
          summary,
          place: place ? toOut(place) : undefined,
          url: siteUrl(placePath(slug)),
        },
        `Done: ${mdLink(args.name.trim(), placePath(slug))} (slug ${slug}) is created. See ${mdLink("your private places", PRIVATE_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "update_private_place",
    {
      title: "Change a private place",
      description:
        "Change a private place the signed-in player created (slug starting with prive-, from search_places): name, type, parent, description, NPS position or the organization that sees it. Only the given fields change; null clears description, position or organization. Only its creator can change it. Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().describe("Slug of the private place (prive-…)"),
        name: nameInput.optional(),
        type: z.enum(PRIVATE_PLACE_TYPES).optional(),
        parent: z
          .string()
          .optional()
          .describe("Slug of the new public parent place; not a shop"),
        description: descriptionInput.nullable().optional(),
        showLocation: showLocationInput.nullable().optional(),
        org: orgInput
          .nullable()
          .optional()
          .describe(
            "One of the user's organizations (id, name or tag); null: only the user sees it",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ place: privatePlaceSchema }),
      annotations: WRITE,
      scopeChallenge: updateChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const place = await getPrivatePlace(user.id, args.slug);
      if (!place) return toolError(`Nothing was changed: ${ERRORS.notFound}`);
      if (!place.isOwner) {
        return toolError(`Nothing was changed: ${ERRORS.forbidden}`);
      }

      const changes: string[] = [];
      let parentSlug = place.parentSlug;
      if (args.parent !== undefined && args.parent !== place.parentSlug) {
        const parent = await publicParent(args.parent);
        if ("error" in parent) return parent.error;
        parentSlug = parent.place.slug;
        changes.push(
          `parent ${place.parentName ?? place.parentSlug} → ${parent.place.name}`,
        );
      }
      const name = args.name?.trim() ?? place.name;
      if (name !== place.name) changes.push(`name “${place.name}” → “${name}”`);
      const type = args.type ?? place.type;
      if (type !== place.type) changes.push(`type ${place.type} → ${type}`);

      let description = place.description;
      if (args.description !== undefined) {
        const next = args.description?.trim() || undefined;
        if (next !== description) {
          changes.push(
            next ? `description → “${next}”` : "description removed",
          );
        }
        description = next;
      }
      let position = place.position;
      if (args.showLocation === null) {
        if (position) changes.push("position removed");
        position = undefined;
      } else if (args.showLocation !== undefined) {
        const read = await readPosition(args.showLocation);
        if ("error" in read) return read.error;
        position = read.position;
        changes.push(`position → ${positionText(position, read.bodyName)}`);
      }
      let orgId = place.org?.id;
      if (args.org === null) {
        if (place.org) changes.push(`no longer shared with ${place.org.name}`);
        orgId = undefined;
      } else if (args.org !== undefined) {
        const found = await resolveOrg(user, args.org);
        if (found.error) return found.error;
        if (found.org.id !== orgId) {
          changes.push(`shared with ${found.org.name}`);
        }
        orgId = found.org.id;
      }
      if (changes.length === 0) return toolError("Nothing to change.");

      // Le site renvoie tout le formulaire : ce qui n'est pas donné reste,
      // l'image comprise.
      const input: PrivatePlaceInput = {
        name,
        type,
        parentSlug,
        description: description ?? null,
        image: place.image ?? null,
        position: position ?? null,
        orgId: orgId ?? null,
      };
      const summary = `Change the private place “${place.name}” (${place.slug}): ${changes.join("; ")}.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      try {
        await updatePrivatePlace(user.id, place.slug, input);
      } catch (error) {
        return privateError(error, "Nothing was changed");
      }
      refresh("/lieux", placePath(place.slug));
      const updated = await getPrivatePlace(user.id, place.slug);
      return toolResult(
        {
          status: "done",
          summary,
          place: updated ? toOut(updated) : undefined,
        },
        `Done: ${summary} See ${mdLink(name, placePath(place.slug))}.`,
      );
    },
  );

  server.registerTool(
    "delete_private_place",
    {
      title: "Delete a private place",
      description:
        "Delete a private place the signed-in player created. Nothing stored there is lost: its inventory location becomes a personal location of the same name, and lots other players stored there move to a personal location of theirs. Only its creator can delete it. Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().describe("Slug of the private place (prive-…)"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ removed: z.boolean() }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: deleteChallenge,
    },
    async ({ slug, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const place = await getPrivatePlace(user.id, slug);
      if (!place) return toolError(`Nothing was removed: ${ERRORS.notFound}`);
      if (!place.isOwner) {
        return toolError(`Nothing was removed: ${ERRORS.forbidden}`);
      }

      const summary =
        `Delete the private place “${place.name}” (${place.slug}) inside ${place.parentName ?? place.parentSlug}` +
        (place.org ? `, shared with ${place.org.name}` : "") +
        `. The lots stored there stay in a personal inventory location named “${place.name}”` +
        (place.org || place.guestCount
          ? "; other players' lots move to a personal location of theirs."
          : ".");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      try {
        await deletePrivatePlace(user.id, place.slug);
      } catch (error) {
        return privateError(error, "Nothing was removed");
      }
      refresh("/lieux");
      return toolResult(
        { status: "done", summary, removed: true },
        `Done: “${place.name}” is deleted. See ${mdLink("your private places", PRIVATE_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "propose_private_place",
    {
      title: "Propose a private place to the public catalog",
      description:
        "Propose a private place the signed-in player created to the public catalog, as the site's Propose button does: a new-place contribution, reviewed by the community (published at once for contributor level 3 or more). The place stays private during review; once published it becomes the public place and the lots stored there stay. The description is left out unless withDescription is set (it often holds organization notes). Asks the user to confirm first.",
      inputSchema: z.object({
        slug: z.string().describe("Slug of the private place (prive-…)"),
        withPosition: z
          .boolean()
          .optional()
          .describe("Send its NPS position (default true)"),
        withImage: z
          .boolean()
          .optional()
          .describe("Send its image (default true)"),
        withDescription: z
          .boolean()
          .optional()
          .describe("Send its description (default false)"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        contributionId: z.string(),
        contributionStatus: z.string(),
        points: z.number(),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: proposeChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const place = await getPrivatePlace(user.id, args.slug);
      if (!place) return toolError(`Not sent: ${ERRORS.notFound}`);
      if (!place.isOwner) return toolError(`Not sent: ${ERRORS.forbidden}`);

      const author = { id: new ObjectId(user.id), name: user.name };
      const standing = await getStanding(author.id);
      if (standing.suspendedUntil) {
        return toolError(
          `Not sent: ${contributionErrorText(new ContributionError("suspended", 403))}`,
        );
      }
      const options = {
        withDescription: args.withDescription === true,
        withImage: args.withImage !== false,
        withPosition: args.withPosition !== false,
      };
      const sent = [
        `name “${place.name}”`,
        `type ${place.type}`,
        `parent ${place.parentName ?? place.parentSlug}`,
        options.withPosition && place.position ? "its position" : undefined,
        options.withImage && place.image ? "its image" : undefined,
        options.withDescription && place.description
          ? `its description (“${place.description}”)`
          : undefined,
      ].filter(Boolean);
      const open =
        place.proposal &&
        ["pending", "changesRequested"].includes(place.proposal.status);
      const summary =
        `Propose, as ${user.name}, the private place “${place.name}” to the public catalog with ${sent.join(", ")}.` +
        (open ? " This updates the proposal already awaiting review." : "") +
        (standing.level >= DIRECT_EDIT_LEVEL
          ? " It will be published right away (contributor level 3 or more): the private place then becomes the public place, and the lots stored there stay."
          : " It will be reviewed by the community; the place stays private until it is published.");
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let result: Awaited<ReturnType<typeof proposePrivatePlace>>;
      try {
        result = await proposePrivatePlace(author, place.slug, options);
      } catch (error) {
        return privateError(error, "Not sent");
      }
      const { contribution } = result;
      const published = contribution.status === "published";
      refresh("/contributions", "/admin/contributions", "/lieux");
      if (published) refresh(placePath(contribution.target.slug));
      return toolResult(
        {
          status: "done",
          summary,
          contributionId: contribution.id,
          contributionStatus: contribution.status,
          points: contribution.points,
          url: siteUrl(
            published ? placePath(contribution.target.slug) : "/contributions",
          ),
        },
        published
          ? `Published: ${mdLink(place.name, placePath(contribution.target.slug))} is now a public place (${contribution.points} contribution points).`
          : `Sent for review (contribution ${contribution.id}); it earns ${contribution.points} points once published. See ${mdLink("your contributions", "/contributions")}.`,
      );
    },
  );
}
