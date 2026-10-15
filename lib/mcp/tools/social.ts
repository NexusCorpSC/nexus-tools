import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import db from "@/lib/db";
import { getMyDisplayOrg } from "@/lib/display-org";
import {
  addFriendByCode,
  FriendError,
  getMyFriendCode,
  listFriends,
  normalizeFriendCode,
  removeFriend,
} from "@/lib/friends";
import {
  listOrgInventory,
  ORG_INVENTORY_ALL_LIMIT,
  type OrgInventoryLot,
} from "@/lib/org-inventory";
import { isOrgValidated, organizations } from "@/lib/orgs";
import { getOrgPresence } from "@/lib/presence";
import { formatFriendCode, type Friend } from "@/types/friends";
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
 * Les amis et les organisations du joueur : les mêmes fonctions que la carte
 * Amis du profil (`lib/friends.ts`), la page d'une organisation et sa
 * présence (`lib/presence.ts`), et son inventaire partagé
 * (`lib/org-inventory.ts`). Les organisations se lisent entre membres : un
 * outil ne montre que celles dont le joueur fait partie. Où sont les amis en
 * jeu, c'est `list_players_in_game`.
 */

const FRIENDS_PATH = "/profile#amis";
const ORGS_PATH = "/orgs";

const orgPath = (orgId: string) => `/orgs/${encodeURIComponent(orgId)}`;

const listFriendsChallenge = personalTool("list_friends", "players:read");
const codeChallenge = personalTool("my_friend_code", "players:read");
const addFriendChallenge = personalTool("add_friend", "players:write");
const removeFriendChallenge = personalTool("remove_friend", "players:write");
const listOrgsChallenge = personalTool("list_my_orgs", "players:read");
const getOrgChallenge = personalTool("get_org", "players:read");
const inventoryChallenge = personalTool("org_inventory", "inventory:read");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

// ─── Amis ─────────────────────────────────────────────────────────────────────

const plannedSchema = z.object({
  at: z.string(),
  activity: z.string().optional(),
});

const friendSchema = z.object({
  id: z.string(),
  name: z.string(),
  organization: z
    .string()
    .optional()
    .describe(
      "The organization shown with their name: the one they chose, else the first one shared with the user",
    ),
  friendsSince: z.string(),
  playing: z
    .object({ activity: z.string().optional(), since: z.string() })
    .optional(),
  planned: plannedSchema.optional(),
});

function toFriend(friend: Friend): z.infer<typeof friendSchema> {
  return {
    id: friend.userId,
    name: friend.name,
    organization: friend.sharedOrg ?? undefined,
    friendsSince: friend.friendsSince,
    playing: friend.playing
      ? {
          activity: friend.playing.activity ?? undefined,
          since: friend.playing.since,
        }
      : undefined,
    planned: friend.planned
      ? {
          at: friend.planned.at,
          activity: friend.planned.activity ?? undefined,
        }
      : undefined,
  };
}

function friendLine(friend: z.infer<typeof friendSchema>): string {
  const state = friend.playing
    ? `playing since ${friend.playing.since}${friend.playing.activity ? ` — ${friend.playing.activity}` : ""}`
    : friend.planned
      ? `session planned at ${friend.planned.at}${friend.planned.activity ? ` — ${friend.planned.activity}` : ""}`
      : "not playing";
  return `- ${friend.name} (id: ${friend.id})${friend.organization ? ` [${friend.organization}]` : ""} — ${state}`;
}

const FRIEND_ERRORS: Record<FriendError["code"], string> = {
  invalid_code: "a friend code has 8 characters, like K7QD-92PX",
  not_found:
    "this code does not exist or was already used; ask your friend for a new one",
  own_code: "this is the user's own code: they should share it instead",
  already_friends: "you are already friends",
  too_many_attempts: "too many wrong codes; try again in a few minutes",
};

// ─── Organisations ────────────────────────────────────────────────────────────

const orgSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string().optional(),
  description: z.string().optional(),
  public: z.boolean(),
  rank: z.string().optional(),
  editor: z.boolean(),
  memberCount: z.number(),
  shownWithMyName: z
    .boolean()
    .describe("The organization the user chose to show next to their name"),
  url: z.string(),
});

type MyOrg = {
  _id: string;
  name: string;
  tag?: string;
  description?: string;
  public?: boolean;
  reportHidden?: boolean;
  validation?: { status: "pending" | "validated" | "rejected" };
  members: { userId: ObjectId | string; rank?: string; editor?: boolean }[];
};

/** Les organisations dont le joueur est membre, par nom, comme `/orgs`. */
async function myOrgs(userId: string): Promise<MyOrg[]> {
  return organizations()
    .find(
      { "members.userId": new ObjectId(userId) },
      {
        projection: {
          name: 1,
          tag: 1,
          description: 1,
          public: 1,
          reportHidden: 1,
          validation: 1,
          members: 1,
        },
      },
    )
    .sort({ name: 1 })
    .toArray() as Promise<MyOrg[]>;
}

/**
 * Une organisation du joueur, désignée par son id, son nom ou son tag exacts
 * (sans casse) ; sinon l'erreur qui liste les siennes.
 */
async function resolveMyOrg(
  userId: string,
  reference: string,
): Promise<
  { org: MyOrg; error?: undefined } | { error: ReturnType<typeof toolError> }
> {
  const orgs = await myOrgs(userId);
  const wanted = reference.trim().toLowerCase();
  const byId = orgs.find((org) => String(org._id) === reference.trim());
  const matches = byId
    ? [byId]
    : orgs.filter(
        (org) =>
          org.name.toLowerCase() === wanted ||
          (org.tag ?? "").toLowerCase() === wanted,
      );
  if (matches.length === 1) {
    return { org: matches[0] };
  }
  const options = orgs.map(
    (org) => `- ${org.name}${org.tag ? ` [${org.tag}]` : ""} (id: ${org._id})`,
  );
  return {
    error: toolError(
      matches.length > 1
        ? `Several of your organizations match "${reference}": pass one of these ids:\n${options.join("\n")}`
        : orgs.length
          ? `"${reference}" is not one of your organizations. Yours:\n${options.join("\n")}`
          : `You are not a member of any organization. Browse or create one on ${mdLink("Organizations", ORGS_PATH)}.`,
    ),
  };
}

function toOrgSummary(
  org: MyOrg,
  userId: string,
  displayOrgId: string | null,
): z.infer<typeof orgSummarySchema> {
  const me = org.members.find((member) =>
    new ObjectId(member.userId).equals(userId),
  );
  const id = String(org._id);
  return {
    id,
    name: org.name,
    tag: org.tag || undefined,
    description: org.description || undefined,
    public: org.public === true && org.reportHidden !== true,
    rank: me?.rank || undefined,
    editor: me?.editor === true,
    memberCount: org.members.length,
    shownWithMyName: displayOrgId === id,
    url: siteUrl(orgPath(id)),
  };
}

const memberSchema = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.string().optional(),
  playing: z
    .object({ activity: z.string().optional(), since: z.string() })
    .optional(),
  planned: plannedSchema
    .extend({
      event: z
        .object({ title: z.string(), url: z.string() })
        .optional()
        .describe("The organization event this session is for"),
    })
    .optional(),
});

// ─── Inventaire partagé ───────────────────────────────────────────────────────

const orgLotSchema = z.object({
  name: z.string(),
  quantity: z.number(),
  unit: z.string().optional(),
  quality: z.number().optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  locationId: z.string().optional(),
  holder: z.string().describe("The member who holds the lot"),
  updatedAt: z.string().optional(),
});

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function toOrgLot(lot: OrgInventoryLot): z.infer<typeof orgLotSchema> {
  const updated = lot.updatedAt as unknown;
  return {
    name: String(lot.name ?? ""),
    quantity: Number(lot.quantity ?? 0),
    unit: text(lot.unit),
    quality: typeof lot.quality === "number" ? lot.quality : undefined,
    description: text(lot.description),
    location: text(lot.location?.name),
    locationId: lot.location?.id ?? text(lot.locationId),
    holder: String(lot.ownerName ?? ""),
    updatedAt: updated instanceof Date ? updated.toISOString() : text(updated),
  };
}

function orgLotLine(lot: z.infer<typeof orgLotSchema>): string {
  const details = [
    lot.unit ? `${lot.quantity} ${lot.unit}` : `×${lot.quantity}`,
    lot.quality !== undefined ? `quality ${lot.quality}` : undefined,
    `held by ${lot.holder}`,
  ].filter(Boolean);
  return `  - ${lot.name} — ${details.join(", ")}${lot.description ? ` — “${lot.description}”` : ""}`;
}

/** Échappe une saisie pour la chercher telle quelle dans une expression régulière. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function registerSocialTools(server: McpServer) {
  server.registerTool(
    "list_friends",
    {
      title: "List my friends",
      description:
        "List all the signed-in player's friends, in game or not, like the Friends card of their profile: who is playing now (with the activity they declared and since when), who planned their next session (when, for what), and the organization shown with their name. Friends playing come first, then planned sessions, then the others by name. Friend ids are what remove_friend takes. For where friends are in game, use list_players_in_game.",
      inputSchema: z.object({
        status: z
          .enum(["playing", "planned", "offline"])
          .optional()
          .describe(
            "Only friends playing now, those with a planned session, or those neither playing nor planned",
          ),
      }),
      outputSchema: z.object({
        total: z.number(),
        playing: z.number(),
        friends: z.array(friendSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listFriendsChallenge,
    },
    async ({ status }, ctx) => {
      const user = await currentUser(ctx);
      const all = (await listFriends(new ObjectId(user.id))).map(toFriend);
      const friends = all.filter((friend) =>
        status === "playing"
          ? !!friend.playing
          : status === "planned"
            ? !!friend.planned
            : status === "offline"
              ? !friend.playing && !friend.planned
              : true,
      );
      const playing = all.filter((friend) => friend.playing).length;
      return toolResult(
        {
          total: friends.length,
          playing,
          friends,
          url: siteUrl(FRIENDS_PATH),
        },
        all.length === 0
          ? `No friends yet. Share your friend code (my_friend_code) or enter a friend's (add_friend), or use the ${mdLink("Friends card", FRIENDS_PATH)} of your profile.`
          : friends.length
            ? `${friends.length} of your ${all.length} ${mdLink("friends", FRIENDS_PATH)} (${playing} playing now):\n` +
              friends.map(friendLine).join("\n")
            : `None of your ${all.length} ${mdLink("friends", FRIENDS_PATH)} matches (${playing} playing now).`,
      );
    },
  );

  server.registerTool(
    "my_friend_code",
    {
      title: "Show my friend code",
      description:
        "Show the signed-in player's pending friend code, to hand to someone who then enters it (add_friend, or the Friends card of their profile) so both become friends. A code works once; when the player has none (never asked for, or already used), says where to generate one on the site.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        code: z.string().optional().describe('Formatted like "K7QD-92PX"'),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: codeChallenge,
    },
    async (_input, ctx) => {
      const user = await currentUser(ctx);
      const code = await getMyFriendCode(new ObjectId(user.id));
      const url = siteUrl(FRIENDS_PATH);
      return code
        ? toolResult(
            { code: formatFriendCode(code), url },
            `Your friend code: **${formatFriendCode(code)}**. It works only once: it disappears as soon as a friend enters it, and a new one is created the next time you ask on the ${mdLink("Friends card", FRIENDS_PATH)}.`,
          )
        : toolResult(
            { url },
            `You have no friend code right now (never generated, or already used). Generate one with “Generate a code” on the ${mdLink("Friends card", FRIENDS_PATH)} of your profile, then share it. Or enter a friend's code with add_friend.`,
          );
    },
  );

  server.registerTool(
    "add_friend",
    {
      title: "Add a friend by code",
      description:
        'Become friends with the player who gave the user their friend code (8 characters, like "K7QD-92PX"; case and dash optional). Both appear in each other\'s friend list and the code is used up. Asks the user to confirm first.',
      inputSchema: z.object({
        code: z.string().min(1).max(20).describe("The friend code"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ friend: friendSchema, url: z.string() }),
      annotations: WRITE,
      scopeChallenge: addFriendChallenge,
    },
    async ({ code, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const userId = new ObjectId(user.id);
      const normalized = normalizeFriendCode(code);
      if (!normalized) {
        return toolError(`No friend added: ${FRIEND_ERRORS.invalid_code}.`);
      }
      if ((await getMyFriendCode(userId)) === normalized) {
        return toolError(`No friend added: ${FRIEND_ERRORS.own_code}.`);
      }

      const summary = `Add the player whose friend code is ${formatFriendCode(normalized)} to ${user.name}'s friends: you will appear in each other's friend list, and see when the other plays. The code is then used up.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let friend: Friend;
      try {
        friend = await addFriendByCode(userId, normalized);
      } catch (error) {
        if (error instanceof FriendError) {
          return toolError(`No friend added: ${FRIEND_ERRORS[error.code]}.`);
        }
        throw error;
      }
      return toolResult(
        {
          status: "done",
          summary,
          friend: toFriend(friend),
          url: siteUrl(FRIENDS_PATH),
        },
        `Done: you are now friends with ${friend.name}. See ${mdLink("your friends", FRIENDS_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "remove_friend",
    {
      title: "Remove a friend",
      description:
        "End a friendship of the signed-in player, on both sides: the user also disappears from the other's list. The friend is named by id (from list_friends) or exact name. Asks the user to confirm first.",
      inputSchema: z.object({
        friend: z
          .string()
          .min(1)
          .describe("Friend id (list_friends) or exact name"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ removed: z.boolean() }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: removeFriendChallenge,
    },
    async ({ friend: reference, confirm }, ctx) => {
      const user = await currentUser(ctx);
      const userId = new ObjectId(user.id);
      const friends = await listFriends(userId);
      const wanted = reference.trim();
      const byId = friends.find((one) => one.userId === wanted);
      const matches = byId
        ? [byId]
        : friends.filter(
            (one) => one.name.toLowerCase() === wanted.toLowerCase(),
          );
      if (matches.length !== 1) {
        const options = (matches.length > 1 ? matches : friends).map(
          (one) => `- ${one.name} (id: ${one.userId})`,
        );
        return toolError(
          matches.length > 1
            ? `Several friends are named "${reference}": pass one of these ids:\n${options.join("\n")}`
            : friends.length
              ? `"${reference}" is not one of your friends. Your friends:\n${options.join("\n")}`
              : "You have no friends to remove.",
        );
      }
      const friend = matches[0];

      const summary = `Remove ${friend.name} from ${user.name}'s friends. You will disappear from their list too; becoming friends again takes a new friend code.`;
      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const removed = await removeFriend(userId, friend.userId);
      if (!removed) {
        return toolError(`${friend.name} is no longer one of your friends.`);
      }
      return toolResult(
        { status: "done", summary, removed: true },
        `Done: ${friend.name} was removed from ${mdLink("your friends", FRIENDS_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "list_my_orgs",
    {
      title: "List my organizations",
      description:
        "List the organizations the signed-in player is a member of, by name: tag, description, whether it is public, the player's rank and whether they can edit it, member count, and the one shown next to their name. Organization ids are what get_org and org_inventory take.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        total: z.number(),
        organizations: z.array(orgSummarySchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listOrgsChallenge,
    },
    async (_input, ctx) => {
      const user = await currentUser(ctx);
      const [orgs, display] = await Promise.all([
        myOrgs(user.id),
        getMyDisplayOrg(new ObjectId(user.id)),
      ]);
      const list = orgs.map((org) => toOrgSummary(org, user.id, display.orgId));
      return toolResult(
        { total: list.length, organizations: list, url: siteUrl(ORGS_PATH) },
        list.length
          ? `You are a member of ${list.length} organizations:\n` +
              list
                .map(
                  (org) =>
                    `- ${mdLink(`${org.name}${org.tag ? ` [${org.tag}]` : ""}`, orgPath(org.id))} (id: ${org.id}) — ${org.rank ?? "no rank"}${org.editor ? ", editor" : ""} — ${org.memberCount} members${org.public ? ", public" : ", private"}${org.shownWithMyName ? " — shown with your name" : ""}`,
                )
                .join("\n")
          : `You are not a member of any organization. Browse or create one on ${mdLink("Organizations", ORGS_PATH)}.`,
      );
    },
  );

  server.registerTool(
    "get_org",
    {
      title: "Show one of my organizations",
      description:
        "Show one organization the signed-in player is a member of, like its page: name, tag, description, visibility, the player's rank, and its members with their rank, who is playing now (activity, since when) and who planned a session (when, for what, and the organization event if any). Members playing come first, then planned sessions, then the others by name.",
      inputSchema: z.object({
        org: z
          .string()
          .min(1)
          .describe("Organization id (list_my_orgs), or its exact name or tag"),
      }),
      outputSchema: z.object({
        organization: orgSummarySchema.extend({
          validation: z
            .enum(["pending", "validated", "rejected"])
            .optional()
            .describe(
              "Review status of a player-created organization; shown to its editors only",
            ),
          inventoryUrl: z.string(),
          eventsUrl: z.string(),
        }),
        playing: z.number(),
        members: z.array(memberSchema),
      }),
      annotations: READ_ONLY,
      scopeChallenge: getOrgChallenge,
    },
    async ({ org: reference }, ctx) => {
      const user = await currentUser(ctx);
      const found = await resolveMyOrg(user.id, reference);
      if (found.error) return found.error;
      const org = found.org;
      const id = String(org._id);

      const memberIds = org.members.map(
        (member) => new ObjectId(member.userId),
      );
      const [presence, users, display] = await Promise.all([
        getOrgPresence(id, user.id),
        db
          .db()
          .collection<{ _id: ObjectId; name?: string }>("users")
          .find({ _id: { $in: memberIds } }, { projection: { name: 1 } })
          .toArray(),
        getMyDisplayOrg(new ObjectId(user.id)),
      ]);
      if (!presence)
        return toolError(`"${reference}" is not one of your organizations.`);

      const names = new Map(
        users.map((one) => [one._id.toString(), one.name || "Membre"]),
      );
      const playing = new Map(presence.playing.map((one) => [one.userId, one]));
      const planned = new Map(presence.planned.map((one) => [one.userId, one]));

      const members: z.infer<typeof memberSchema>[] = org.members.map(
        (member) => {
          const memberId = new ObjectId(member.userId).toString();
          const now = playing.get(memberId);
          const next = planned.get(memberId)?.planned;
          return {
            id: memberId,
            name: names.get(memberId) ?? "Membre",
            rank: member.rank || undefined,
            playing: now
              ? { activity: now.activity ?? undefined, since: now.since }
              : undefined,
            planned: next
              ? {
                  at: next.at,
                  activity: next.activity ?? undefined,
                  event: next.event
                    ? {
                        title: next.event.title,
                        url: siteUrl(
                          `${orgPath(id)}/events/${encodeURIComponent(next.event.eventId)}`,
                        ),
                      }
                    : undefined,
                }
              : undefined,
          };
        },
      );
      // Comme la liste d'amis : en jeu, puis prévus, puis les autres.
      members.sort((a, b) => {
        if (a.playing && b.playing)
          return a.playing.since.localeCompare(b.playing.since);
        if (a.playing) return -1;
        if (b.playing) return 1;
        if (a.planned && b.planned)
          return a.planned.at.localeCompare(b.planned.at);
        if (a.planned) return -1;
        if (b.planned) return 1;
        return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      });

      const summary = toOrgSummary(org, user.id, display.orgId);
      const organization = {
        ...summary,
        validation:
          summary.editor && org.validation
            ? isOrgValidated(org)
              ? ("validated" as const)
              : org.validation.status
            : undefined,
        inventoryUrl: siteUrl(`${orgPath(id)}/inventory`),
        eventsUrl: siteUrl(`${orgPath(id)}/events`),
      };

      const memberLine = (member: z.infer<typeof memberSchema>) => {
        const state = member.playing
          ? `playing since ${member.playing.since}${member.playing.activity ? ` — ${member.playing.activity}` : ""}`
          : member.planned
            ? `session planned at ${member.planned.at}${member.planned.activity ? ` — ${member.planned.activity}` : ""}${member.planned.event ? ` (event: ${member.planned.event.title})` : ""}`
            : "not playing";
        return `- ${member.name}${member.rank ? ` (${member.rank})` : ""} — ${state}`;
      };

      return toolResult(
        { organization, playing: presence.playing.length, members },
        `**${mdLink(`${summary.name}${summary.tag ? ` [${summary.tag}]` : ""}`, orgPath(id))}** — ${summary.public ? "public" : "private"} — you: ${summary.rank ?? "no rank"}${summary.editor ? ", editor" : ""}` +
          (organization.validation && organization.validation !== "validated"
            ? ` — validation ${organization.validation}`
            : "") +
          (summary.description ? `\n\n${summary.description}` : "") +
          `\n\n${presence.playing.length} of ${members.length} members playing now:\n` +
          members.map(memberLine).join("\n") +
          `\n\nSee also its ${mdLink("shared inventory", `${orgPath(id)}/inventory`)} and ${mdLink("events", `${orgPath(id)}/events`)}.`,
      );
    },
  );

  server.registerTool(
    "org_inventory",
    {
      title: "Search an organization's shared inventory",
      description:
        "List the inventory lots that members of one of the signed-in player's organizations share with it, like the organization's inventory page: item, quantity, quality, location and which member holds it, grouped by location. Filter by part of the item name, location, minimum quality or member.",
      inputSchema: z.object({
        org: z
          .string()
          .min(1)
          .describe("Organization id (list_my_orgs), or its exact name or tag"),
        query: z.string().max(100).optional().describe("Part of the item name"),
        location: z
          .string()
          .max(200)
          .optional()
          .describe("Location id, or part of its name"),
        minQuality: z.number().int().min(0).max(1000).optional(),
        member: z
          .string()
          .max(100)
          .optional()
          .describe("Only lots held by this member: exact name"),
        page: z.number().int().min(1).optional(),
        pageSize: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.object({
        organization: z.string(),
        total: z.number(),
        page: z.number(),
        lots: z.array(orgLotSchema),
        locations: z
          .array(
            z.object({
              name: z.string(),
              id: z.string().optional(),
              lots: z.number(),
            }),
          )
          .describe("Every location among the matching lots"),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: inventoryChallenge,
    },
    async (
      {
        org: reference,
        query,
        location,
        minQuality,
        member,
        page = 1,
        pageSize,
      },
      ctx,
    ) => {
      const user = await currentUser(ctx);
      const found = await resolveMyOrg(user.id, reference);
      if (found.error) return found.error;
      const org = found.org;
      const id = String(org._id);
      const path = `${orgPath(id)}/inventory`;
      const orgName = `${org.name}${org.tag ? ` [${org.tag}]` : ""}`;

      // Le membre est cherché par son nom parmi ceux qui partagent des lots.
      let userId: string | undefined;
      if (member) {
        const everyone = await listOrgInventory(org.members, {
          skip: 0,
          limit: 1,
        });
        const wanted = member.trim().toLowerCase();
        const holders = everyone.members.filter(
          (one) =>
            one.id === member.trim() || one.name.toLowerCase() === wanted,
        );
        if (holders.length !== 1) {
          return toolError(
            `No single member sharing lots with ${orgName} is named "${member}". Members sharing lots: ${everyone.members.map((one) => one.name).join(", ") || "none"}.`,
          );
        }
        userId = holders[0].id;
      }

      // Tout d'un coup, comme la page, pour filtrer par lieu ensuite.
      const result = await listOrgInventory(org.members, {
        query: query ? escapeRegex(query) : undefined,
        quality: minQuality !== undefined ? String(minQuality) : undefined,
        userId,
        skip: 0,
        limit: ORG_INVENTORY_ALL_LIMIT,
      });
      let lots = result.items.map(toOrgLot);

      if (location?.trim()) {
        const wanted = location.trim().toLowerCase();
        const byId = lots.filter((lot) => lot.locationId === location.trim());
        const filtered = byId.length
          ? byId
          : lots.filter((lot) =>
              (lot.location ?? "").toLowerCase().includes(wanted),
            );
        if (filtered.length === 0) {
          const places = [
            ...new Set(lots.map((lot) => lot.location ?? "Unknown location")),
          ];
          return toolError(
            `No shared lot of ${orgName}${query ? ` matching "${query}"` : ""} is at a location matching "${location}".` +
              (places.length
                ? ` Locations with lots: ${places.join(", ")}.`
                : ""),
          );
        }
        lots = filtered;
      }

      const counts = new Map<
        string,
        { name: string; id?: string; lots: number }
      >();
      for (const lot of lots) {
        const key = lot.locationId ?? "";
        const entry = counts.get(key) ?? {
          name: lot.location ?? "Unknown location",
          id: lot.locationId,
          lots: 0,
        };
        entry.lots += 1;
        counts.set(key, entry);
      }
      const locations = [...counts.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      );

      const size = pageSize ?? PAGE_SIZE.max;
      const shown = lots.slice((page - 1) * size, page * size);

      const groups = new Map<string, z.infer<typeof orgLotSchema>[]>();
      for (const lot of shown) {
        const key = lot.location ?? "Unknown location";
        groups.set(key, [...(groups.get(key) ?? []), lot]);
      }
      const markdown = [...groups]
        .map(
          ([place, group]) =>
            `- **${place}**\n${group.map(orgLotLine).join("\n")}`,
        )
        .join("\n");

      return toolResult(
        {
          organization: orgName,
          total: lots.length,
          page,
          lots: shown,
          locations,
          url: siteUrl(path),
        },
        lots.length
          ? `${lots.length} lots shared in ${mdLink(`${orgName}'s inventory`, path)}` +
              (lots.length > shown.length
                ? ` (page ${page}, ${shown.length} shown)`
                : "") +
              ":\n" +
              (markdown || "No lot on this page.")
          : `No shared lot${query ? ` matching "${query}"` : ""} in ${mdLink(`${orgName}'s inventory`, path)}. Members share lots from their own inventory.`,
      );
    },
  );
}
