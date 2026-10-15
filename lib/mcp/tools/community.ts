import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import en from "@/messages/en.json";
import { getLeaderboard } from "@/lib/gamification";
import { listMissing, MISSING_KINDS, type MissingKind } from "@/lib/missing";
import { LEADERBOARD_PERIODS, LEADERBOARD_SCOPES } from "@/types/gamification";
import { optionalUserId } from "../auth";
import { mdLink, READ_ONLY, siteUrl, toolResult } from "../format";

/**
 * Les pages publiques de la communauté : « Ce qui manque » (`lib/missing.ts`,
 * `/ce-qui-manque`) et le classement des contributeurs (`lib/gamification.ts`,
 * `/classement`). Les mêmes fonctions que les pages, rien de plus : un joueur
 * retiré du classement n'y figure pas, et l'identifiant d'un joueur ne sort pas.
 */

const MISSING_PATH = "/ce-qui-manque";
const LEADERBOARD_PATH = "/classement";

/** L'onglet de chaque sorte de trou, comme les adresses de la page. */
const MISSING_TABS: Record<MissingKind, string> = {
  placeImage: "images",
  placePlan: "plans",
  itemSection: "objets",
  stalePrices: "cours",
  missionPlace: "missions",
};

const MISSING_TEXT = en.Missing.kinds as Record<
  MissingKind,
  { tab: string; hint: string; cta: string }
>;

/** L'outil qui comble chaque sorte de trou, quand l'assistant le peut. */
const MISSING_TOOLS: Record<MissingKind, string | undefined> = {
  // Une image se téléverse sur le site.
  placeImage: undefined,
  placePlan: "plan_draft_create",
  itemSection: "contribute_item_edit",
  stalePrices: "confirm_data (subject prices)",
  missionPlace: "contribute_mission_tip",
};

const missingPath = (kind: MissingKind) =>
  `${MISSING_PATH}?quoi=${MISSING_TABS[kind]}`;

export function registerCommunityTools(server: McpServer) {
  server.registerTool(
    "list_missing",
    {
      title: "List what's missing in the catalog",
      description:
        "The catalog gaps players run into most (the site's “What's missing” page), most visited pages first over 30 days: placeImage (places without an image), placePlan (stations, spaceports, outposts and buildings without a map), itemSection (vehicles, weapons, resources without their figures), stalePrices (resource prices not confirmed for two weeks), missionPlace (missions without a location). Each entry has its page, where to fill it and the points it earns, to suggest contributions to the user.",
      inputSchema: z.object({
        kind: z.enum(MISSING_KINDS).optional().describe("Default placeImage"),
        limit: z.number().int().min(1).max(30).optional(),
      }),
      outputSchema: z.object({
        kind: z.string(),
        hint: z.string(),
        total: z.number(),
        fillWith: z.string().optional(),
        entries: z.array(
          z.object({
            slug: z.string(),
            name: z.string(),
            detail: z.string().optional(),
            views: z.number(),
            points: z.number(),
            url: z.string(),
            fillUrl: z.string(),
          }),
        ),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ kind = "placeImage", limit = 15 }) => {
      const { entries, total } = await listMissing(kind, limit);
      const text = MISSING_TEXT[kind];
      const fillWith = MISSING_TOOLS[kind];
      const rows = entries.map((entry) => ({
        // `slug` est l'identifiant d'une mission pour missionPlace.
        slug: entry.slug,
        name: entry.name,
        detail:
          kind === "stalePrices"
            ? entry.detail
              ? `prices confirmed ${entry.detail.slice(0, 10)}`
              : "prices never confirmed"
            : entry.detail || undefined,
        views: entry.views,
        points: entry.points,
        url: siteUrl(entry.href),
        fillUrl: siteUrl(entry.fillHref),
      }));
      return toolResult(
        {
          kind,
          hint: text.hint,
          total,
          fillWith,
          entries: rows,
          url: siteUrl(missingPath(kind)),
        },
        `${text.tab}: ${total} in all. ${text.hint}` +
          (fillWith
            ? ` Fill with ${fillWith}.`
            : " Images are added on the site.") +
          "\n\n" +
          (rows
            .map(
              (row, index) =>
                `- ${mdLink(row.name, entries[index].href)}` +
                (row.detail ? ` (${row.detail})` : "") +
                (row.views > 0 ? `, ${row.views} visits` : "") +
                ` — [${text.cta}](${row.fillUrl}) +${row.points} pts`,
            )
            .join("\n") || en.Missing.empty) +
          `\n\n${mdLink("What's missing", missingPath(kind))}`,
      );
    },
  );

  server.registerTool(
    "get_leaderboard",
    {
      title: "Contributor leaderboard",
      description:
        "The community contributor leaderboard (the site's /classement page): players or public organizations (sum of their members' points), for the current month (default) or all time, top 50. Players who chose to hide are left out. When the user is signed in with the profile scope, `me` gives their own rank and points.",
      inputSchema: z.object({
        period: z
          .enum(LEADERBOARD_PERIODS)
          .optional()
          .describe("Default month"),
        scope: z
          .enum(LEADERBOARD_SCOPES)
          .optional()
          .describe("Default players"),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      outputSchema: z.object({
        period: z.string(),
        scope: z.string(),
        since: z.string().optional(),
        entries: z.array(
          z.object({
            rank: z.number(),
            name: z.string(),
            points: z.number(),
            level: z.number().optional(),
            orgId: z.string().optional(),
            tag: z.string().optional(),
            members: z.number().optional(),
            url: z.string().optional(),
          }),
        ),
        me: z
          .object({
            rank: z.number().optional(),
            points: z.number(),
            hidden: z.boolean(),
          })
          .optional(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ period = "month", scope = "players", limit = 20 }, ctx) => {
      const readerId = optionalUserId(ctx, "profile");
      const board = await getLeaderboard(
        period,
        scope,
        readerId ? new ObjectId(readerId) : undefined,
      );
      // Un joueur n'a pas de page publique : ni son identifiant ni lien.
      const entries = board.entries.slice(0, limit).map((entry) =>
        scope === "orgs"
          ? {
              rank: entry.rank,
              name: entry.name,
              points: entry.points,
              orgId: entry.id,
              tag: entry.tag,
              members: entry.members,
              url: siteUrl(`/orgs/${entry.id}`),
            }
          : {
              rank: entry.rank,
              name: entry.name,
              points: entry.points,
              level: entry.level,
            },
      );
      const query = new URLSearchParams();
      if (period === "all") query.set("periode", "tout");
      if (scope === "orgs") query.set("qui", "orgas");
      const path = query.size
        ? `${LEADERBOARD_PATH}?${query}`
        : LEADERBOARD_PATH;
      const title =
        (scope === "orgs" ? "Organizations" : "Contributors") +
        (period === "month" && board.since
          ? ` since ${board.since.slice(0, 10)}`
          : ", all time");
      const me = board.me;
      return toolResult(
        {
          period,
          scope,
          since: board.since,
          entries,
          me,
          url: siteUrl(path),
        },
        `${title}:\n` +
          (entries
            .map(
              (entry) =>
                `${entry.rank}. ${"url" in entry && entry.url ? `[${entry.name.replace(/[[\]]/g, "")}](${entry.url})` : entry.name}` +
                ("tag" in entry && entry.tag ? ` [${entry.tag}]` : "") +
                ` — ${entry.points} pts` +
                ("level" in entry && entry.level !== undefined
                  ? ` (level ${entry.level})`
                  : ""),
            )
            .join("\n") || "Nobody yet.") +
          (me
            ? me.hidden
              ? "\n\nYou are hidden from the leaderboard."
              : `\n\nYou: ${me.rank ? `rank ${me.rank}, ` : ""}${me.points} pts.`
            : "") +
          `\n\n${mdLink("Leaderboard", path)}`,
      );
    },
  );
}
