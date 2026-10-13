import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { geoOf } from "@/lib/nps-geometry";
import { getNpsBodies } from "@/lib/places";
import { visiblePlayers } from "@/lib/player-positions";
import type { PlayerInGame } from "@/types/player-positions";
import type { NpsBody } from "@/types/places";
import { currentUser, personalTool } from "../auth";
import { mdLink, READ_ONLY, siteUrl, toolResult } from "../format";

/**
 * Le suivi de position : les amis et membres d'organisation en jeu qui
 * partagent leur position avec le joueur, comme la Star Map les montre
 * (`lib/player-positions.ts`). En lecture seule : partager se décide dans le
 * NPS de l'app ou sur la Star Map.
 */

const STAR_MAP_PATH = "/starmap";

const listChallenge = personalTool("list_players_in_game", "players:read");

const playerSchema = z.object({
  name: z.string(),
  me: z.boolean(),
  friend: z.boolean(),
  organizations: z.array(z.string()),
  activity: z.string().optional(),
  playingSince: z.string(),
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
  source: z.string(),
  readAt: z.string(),
});

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toEntry(
  player: PlayerInGame,
  bodies: NpsBody[],
): z.infer<typeof playerSchema> {
  const body = player.bodySlug
    ? bodies.find((one) => one.slug === player.bodySlug)
    : undefined;
  const geo = body ? geoOf(player.position, body) : null;
  return {
    name: player.name,
    me: player.me,
    friend: player.friend,
    organizations: player.orgs.map((org) => org.name),
    activity: player.activity ?? undefined,
    playingSince: player.since,
    system: player.systemName ?? player.systemSlug,
    body: player.bodyName,
    latitude: geo ? round(geo.latitude, 3) : undefined,
    longitude: geo ? round(geo.longitude, 3) : undefined,
    altitude: geo ? Math.round(geo.altitude) : undefined,
    position: player.position,
    source: player.source,
    readAt: player.at,
  };
}

function entryLine(entry: z.infer<typeof playerSchema>): string {
  const where =
    entry.body && entry.latitude !== undefined
      ? `${entry.body}, ${entry.latitude}° / ${entry.longitude}°, ${entry.altitude} m`
      : `${entry.system} space`;
  const who = entry.me
    ? "you"
    : [entry.friend ? "friend" : undefined, ...entry.organizations]
        .filter(Boolean)
        .join(", ");
  return `- ${entry.name} (${who}) — ${where}${entry.activity ? ` — ${entry.activity}` : ""} — read at ${entry.readAt}`;
}

export function registerPlayerTools(server: McpServer) {
  server.registerTool(
    "list_players_in_game",
    {
      title: "List friends in game and where they are",
      description:
        "List the signed-in player's friends and organization members who are in game right now and share their position with them, with where they are (body, latitude/longitude, or star system space), their activity and when the position was read; the player's own position too if they share it. Positions are system-frame coordinates in space, or body-frame coordinates on a planet or moon, like the NPS.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        total: z.number(),
        players: z.array(playerSchema),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async (_input, ctx) => {
      const user = await currentUser(ctx);
      const [players, bodies] = await Promise.all([
        visiblePlayers(new ObjectId(user.id)),
        getNpsBodies(),
      ]);
      const entries = players.map((player) => toEntry(player, bodies));
      return toolResult(
        {
          total: entries.length,
          players: entries,
          url: siteUrl(STAR_MAP_PATH),
        },
        entries.length
          ? `${entries.length} players in game on the ${mdLink("Star Map", STAR_MAP_PATH)}:\n` +
              entries.map(entryLine).join("\n")
          : `Nobody shares their position with you right now. Positions show on the ${mdLink("Star Map", STAR_MAP_PATH)} while friends play.`,
      );
    },
  );
}
