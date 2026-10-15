import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import type { Organization } from "@/app/orgs/page";
import {
  addBlueprintToUser,
  filterBlueprints,
  getBlueprintBySlug,
  getBlueprintCategories,
  getUsersWithBlueprintInOrganization,
  isUserOwningBlueprint,
  removeBlueprintFromUser,
} from "@/lib/crafting";
import db from "@/lib/db";
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

/**
 * Les blueprints du joueur : les mêmes fonctions que la page
 * `/crafting/blueprints` (filtre « possédés »), les boutons de la fiche et les
 * routes `/api/blueprints/[blueprintId]/ownership` et `/org-owners`. Un
 * blueprint par défaut est possédé par tout le monde : il ne s'ajoute ni ne
 * se retire.
 */

const BLUEPRINTS_PATH = "/crafting/blueprints";
const OWNED_PATH = `${BLUEPRINTS_PATH}?owned=true`;
const blueprintPath = (slug: string) => `${BLUEPRINTS_PATH}/${slug}`;

const listChallenge = personalTool("list_my_blueprints", "crafting:read");
const setChallenge = personalTool("set_blueprint_owned", "crafting:write");
const ownersChallenge = personalTool(
  "blueprint_owners_in_org",
  "crafting:read",
);

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const blueprintInput = z
  .string()
  .min(1)
  .describe(
    "Blueprint slug (search_blueprints, get_blueprint_by_slug) or blueprint id",
  );

const ownedBlueprintSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  tier: z.number().optional(),
  isDefault: z.boolean(),
  url: z.string(),
});

type BlueprintRef = {
  id: string;
  slug: string;
  name: string;
  isDefault: boolean;
};

/** Le blueprint qu'un slug (ou un ancien slug) ou un id désigne. */
async function findBlueprint(value: string): Promise<BlueprintRef | null> {
  const key = value.trim();
  if (ObjectId.isValid(key) && /^[0-9a-f]{24}$/i.test(key)) {
    const doc = await db
      .db()
      .collection("blueprints")
      .findOne(
        { _id: new ObjectId(key) },
        { projection: { slug: 1, name: 1, isDefault: 1 } },
      );
    if (doc) {
      return {
        id: doc._id.toString(),
        slug: String(doc.slug),
        name: String(doc.name),
        isDefault: doc.isDefault === true,
      };
    }
  }
  const blueprint = await getBlueprintBySlug(key);
  if (!blueprint) return null;
  return {
    id: blueprint.id,
    slug: blueprint.slug,
    name: blueprint.name,
    isDefault: blueprint.isDefault === true,
  };
}

/** Comme la route : le site rend la possession côté serveur. */
function refresh(slug: string) {
  for (const path of [blueprintPath(slug), BLUEPRINTS_PATH]) {
    try {
      revalidatePath(path);
    } catch {
      // Hors d'une requête Next (tests) : rien à rafraîchir.
    }
  }
}

const fold = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function registerCraftingTools(server: McpServer) {
  server.registerTool(
    "list_my_blueprints",
    {
      title: "List my blueprints",
      description:
        "List the crafting blueprints the signed-in player owns (those they marked as acquired, plus the default blueprints everyone owns), sorted by name, optionally filtered by part of the name, category and subcategory. Slugs work with get_blueprint_by_slug and set_blueprint_owned.",
      inputSchema: z.object({
        query: z.string().max(100).optional().describe("Part of the name"),
        category: z
          .string()
          .max(100)
          .optional()
          .describe("Blueprint category, e.g. Weapons, Armor"),
        subcategory: z.string().max(100).optional(),
        excludeDefault: z
          .boolean()
          .optional()
          .describe("Leave out the default blueprints everyone owns"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(PAGE_SIZE.max)
          .optional()
          .describe(`Results per page (default ${PAGE_SIZE.default})`),
        page: z.number().int().min(1).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        page: z.number(),
        totalPages: z.number(),
        blueprints: z.array(ownedBlueprintSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);

      // Les catégories exactes, retrouvées sans tenir compte de la casse.
      let category: string | undefined;
      let subcategory: string | undefined;
      if (args.category || args.subcategory) {
        const categories = await getBlueprintCategories();
        if (args.category) {
          const found = categories.find(
            (one) => fold(one.category) === fold(args.category!),
          );
          if (!found) {
            return toolError(
              `Unknown blueprint category “${args.category}”. Categories: ${categories.map((one) => one.category).join(", ")}.`,
            );
          }
          category = found.category;
        }
        if (args.subcategory) {
          const pool = categories
            .filter((one) => !category || one.category === category)
            .flatMap((one) => one.subcategories);
          subcategory = pool.find(
            (one) => fold(one) === fold(args.subcategory!),
          );
          if (!subcategory) {
            return toolError(
              `Unknown blueprint subcategory “${args.subcategory}”${category ? ` in ${category}` : ""}.`,
            );
          }
        }
      }

      const limit = args.limit ?? PAGE_SIZE.default;
      const page = args.page ?? 1;
      const query = args.query?.trim();

      let blueprints: z.infer<typeof ownedBlueprintSchema>[];
      let total: number;
      if (args.excludeDefault) {
        // Les blueprints par défaut sont peu nombreux : on filtre après coup
        // sur toute la liste possédée, puis on pagine.
        const all = await filterBlueprints({
          query: query || undefined,
          category,
          subcategory,
          owned: true,
          userId: user.id,
          limit: 10_000,
          page: 1,
        });
        const kept = all.blueprints.filter((bp) => bp.isDefault !== true);
        total = kept.length;
        blueprints = kept.slice((page - 1) * limit, page * limit).map(toOwned);
      } else {
        const found = await filterBlueprints({
          query: query || undefined,
          category,
          subcategory,
          owned: true,
          userId: user.id,
          limit,
          page,
        });
        total = found.total;
        blueprints = found.blueprints.map(toOwned);
      }
      const totalPages = Math.ceil(total / limit);

      const filters = [
        query ? `“${query}”` : undefined,
        category,
        subcategory,
      ].filter(Boolean);
      const text = blueprints.length
        ? `${total} owned blueprints${filters.length ? ` matching ${filters.join(", ")}` : ""}` +
          (totalPages > 1 ? ` (page ${page}/${totalPages})` : "") +
          ` — ${mdLink("your blueprints", OWNED_PATH)}:\n` +
          blueprints
            .map(
              (bp) =>
                `- ${mdLink(bp.name, blueprintPath(bp.slug))} (slug: ${bp.slug})` +
                (bp.category
                  ? ` — ${bp.category}${bp.subcategory ? ` › ${bp.subcategory}` : ""}`
                  : "") +
                (bp.isDefault ? " — default, owned by everyone" : ""),
            )
            .join("\n")
        : total > 0
          ? `No owned blueprint on page ${page}: there are ${totalPages} pages.`
          : `No owned blueprint${filters.length ? ` matching ${filters.join(", ")}` : ""} in ${mdLink("your blueprints", OWNED_PATH)}.`;

      return toolResult(
        { total, page, totalPages, blueprints, url: siteUrl(OWNED_PATH) },
        text,
      );
    },
  );

  server.registerTool(
    "set_blueprint_owned",
    {
      title: "Mark a blueprint as owned",
      description:
        "Mark a crafting blueprint as acquired by the signed-in player (owned: true, the default) or remove it from their blueprints (owned: false), like the button on the blueprint page. Default blueprints are owned by everyone and cannot be removed. Asks the user to confirm first.",
      inputSchema: z.object({
        blueprint: blueprintInput,
        owned: z
          .boolean()
          .optional()
          .describe("true to add it (default), false to remove it"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        blueprint: z.object({ slug: z.string(), name: z.string() }),
        owned: z.boolean(),
        changed: z.boolean(),
        url: z.string(),
      }),
      annotations: WRITE,
      scopeChallenge: setChallenge,
    },
    async ({ blueprint: value, owned, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const blueprint = await findBlueprint(value);
      if (!blueprint) {
        return toolError(
          `No blueprint “${value}”: find its slug with search_blueprints.`,
        );
      }
      const wanted = owned !== false;
      const path = blueprintPath(blueprint.slug);
      const shown = { slug: blueprint.slug, name: blueprint.name };
      const hasRow = await isUserOwningBlueprint(user.id, blueprint.id);

      // Rien à écrire : on le dit sans demander de confirmation.
      const unchanged = (summary: string, isOwned: boolean) =>
        toolResult(
          {
            status: "done",
            summary,
            blueprint: shown,
            owned: isOwned,
            changed: false,
            url: siteUrl(path),
          },
          `${summary} See ${mdLink(blueprint.name, path)}.`,
        );

      if (wanted && blueprint.isDefault) {
        return unchanged(
          `${blueprint.name} is a default blueprint: everyone owns it already, nothing to change.`,
          true,
        );
      }
      if (wanted && hasRow) {
        return unchanged(
          `${blueprint.name} is already in ${user.name}'s blueprints.`,
          true,
        );
      }
      if (!wanted && !hasRow) {
        return unchanged(
          blueprint.isDefault
            ? `${blueprint.name} is a default blueprint: everyone owns it and it cannot be removed.`
            : `${blueprint.name} is not in ${user.name}'s blueprints: nothing to remove.`,
          blueprint.isDefault,
        );
      }

      const summary = wanted
        ? `Add the blueprint ${blueprint.name} to ${user.name}'s blueprints.`
        : `Remove the blueprint ${blueprint.name} from ${user.name}'s blueprints` +
          (blueprint.isDefault
            ? " (it is a default blueprint: it stays owned by everyone)."
            : ".");
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const changed = wanted
        ? await addBlueprintToUser(user.id, blueprint.id)
        : await removeBlueprintFromUser(user.id, blueprint.id);
      if (changed) refresh(blueprint.slug);
      const isOwned = wanted || blueprint.isDefault;

      return toolResult(
        {
          status: "done",
          summary,
          blueprint: shown,
          owned: isOwned,
          changed,
          url: siteUrl(path),
        },
        `Done: ${blueprint.name} is ${isOwned ? "owned" : "no longer owned"}. See ${mdLink(blueprint.name, path)} and ${mdLink("your blueprints", OWNED_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "blueprint_owners_in_org",
    {
      title: "Who in my organizations owns a blueprint",
      description:
        "List the members of the signed-in player's organizations who own a crafting blueprint, as the blueprint page shows them: one organization if given, otherwise each of the player's organizations. Default blueprints, owned by everyone, list only members who marked them.",
      inputSchema: z.object({
        blueprint: blueprintInput,
        organization: z
          .string()
          .optional()
          .describe(
            "One of the player's organizations: its id, name or tag; all of them by default",
          ),
      }),
      outputSchema: z.object({
        blueprint: z.object({
          slug: z.string(),
          name: z.string(),
          isDefault: z.boolean(),
          url: z.string(),
        }),
        organizations: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            tag: z.string().optional(),
            url: z.string(),
            owners: z.array(z.object({ name: z.string() })),
          }),
        ),
      }),
      annotations: READ_ONLY,
      scopeChallenge: ownersChallenge,
    },
    async ({ blueprint: value, organization }, ctx) => {
      const user = await currentUser(ctx);
      const blueprint = await findBlueprint(value);
      if (!blueprint) {
        return toolError(
          `No blueprint “${value}”: find its slug with search_blueprints.`,
        );
      }

      // Les organisations du joueur, comme la fiche du blueprint (20 au plus).
      const userOrgs = await db
        .db()
        .collection<Organization>("organizations")
        .find(
          { "members.userId": new ObjectId(user.id) },
          { projection: { _id: 1, name: 1, tag: 1 } },
        )
        .limit(20)
        .toArray();
      if (userOrgs.length === 0) {
        return toolError(
          `${user.name} is not a member of any organization on Nexus Tools.`,
        );
      }

      let orgs = userOrgs;
      if (organization !== undefined) {
        const key = fold(organization);
        orgs = userOrgs.filter(
          (org) =>
            String(org._id) === organization.trim() ||
            fold(String(org.name ?? "")) === key ||
            (org.tag ? fold(org.tag) === key : false),
        );
        if (orgs.length === 0) {
          return toolError(
            `“${organization}” is not one of ${user.name}'s organizations: ${userOrgs.map((org) => org.name).join(", ")}.`,
          );
        }
      }

      const organizations = await Promise.all(
        orgs.map(async (org) => {
          const id = String(org._id);
          const members = await getUsersWithBlueprintInOrganization(
            id,
            blueprint.id,
          );
          return {
            id,
            name: String(org.name ?? ""),
            tag: org.tag || undefined,
            url: siteUrl(`/orgs/${id}`),
            owners: members.map((member) => ({ name: member.name })),
          };
        }),
      );

      const path = blueprintPath(blueprint.slug);
      const text =
        `Owners of ${mdLink(blueprint.name, path)} in ${user.name}'s organizations` +
        (blueprint.isDefault
          ? " (a default blueprint: everyone owns it, only members who marked it are listed)"
          : "") +
        ":\n" +
        organizations
          .map(
            (org) =>
              `- ${mdLink(org.name, `/orgs/${org.id}`)}: ` +
              (org.owners.length
                ? org.owners.map((owner) => owner.name).join(", ")
                : "nobody"),
          )
          .join("\n");

      return toolResult(
        {
          blueprint: {
            slug: blueprint.slug,
            name: blueprint.name,
            isDefault: blueprint.isDefault,
            url: siteUrl(path),
          },
          organizations,
        },
        text,
      );
    },
  );
}

function toOwned(bp: {
  id: string;
  slug: string;
  name: string;
  category?: string;
  subcategory?: string;
  tier?: number;
  isDefault?: boolean;
}): z.infer<typeof ownedBlueprintSchema> {
  return {
    id: bp.id,
    slug: bp.slug,
    name: bp.name,
    category: bp.category || undefined,
    subcategory: bp.subcategory || undefined,
    tier: bp.tier ?? undefined,
    isDefault: bp.isDefault === true,
    url: siteUrl(blueprintPath(bp.slug)),
  };
}
