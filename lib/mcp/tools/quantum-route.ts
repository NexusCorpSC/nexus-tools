import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getMarker } from "@/lib/markers";
import { parseShowLocation } from "@/lib/nps-geometry";
import { getNpsData } from "@/lib/places";
import {
  findQtBeacon,
  planQuantumRoute,
  qtTarget,
  qtText,
  quantumSystem,
  type QtCandidate,
} from "@/lib/quantum-route";
import type { PlacePosition } from "@/types/places";
import { optionalUserId } from "../auth";
import { READ_ONLY, siteUrl, toolError, toolResult } from "../format";

/**
 * Approcher un point sans balise par un saut quantique coupé : la même
 * recherche que /saut-quantique et la superposition de l'app
 * (`lib/quantum-route.ts`).
 */

const MARKERS_SCOPE = "markers:read";

function toEntry(candidate: QtCandidate) {
  return {
    from: candidate.from?.id,
    fromName: candidate.from?.name,
    to: candidate.to.id,
    toName: candidate.to.name,
    cut: candidate.cut,
    cutAtRemaining: candidate.cut ? qtText(candidate.remaining) : undefined,
    cutAtRemainingMetres: candidate.cut
      ? Math.round(candidate.remaining)
      : undefined,
    jumpLength: qtText(candidate.length),
    lineOffset: qtText(candidate.offset),
    expectedError: qtText(candidate.error),
    expectedErrorMetres: Math.round(candidate.error),
  };
}

function line(candidate: QtCandidate) {
  const route = candidate.from
    ? `${candidate.from.name} → ${candidate.to.name}`
    : `→ ${candidate.to.name}`;
  return candidate.cut
    ? `- ${route}: cut at ${qtText(candidate.remaining)} remaining, drop ≈ ${qtText(candidate.error)} from the target`
    : `- jump to ${candidate.to.name} all the way: ≈ ${qtText(candidate.error)} from the target`;
}

export function registerQuantumRouteTools(server: McpServer) {
  server.registerTool(
    "plan_quantum_route",
    {
      title: "Plan a cut quantum jump to any point",
      description:
        "Get as close as possible to a point with no quantum beacon (a position marker, a recorded place, or star-system coordinates) by cutting a quantum jump: finds the departure/destination beacons whose straight line passes closest to the point and the remaining distance the HUD shows when to cut (cutAtRemaining). Routes through a planet, a moon or the star are left out. expectedError adds the line's offset and a hand cut accurate to about 1% of the remaining distance; the player finishes with the NPS. A point on or near the ground of a body is answered with the nearest place on that body to jump to instead. Give exactly one of markerId (needs sign-in), place (slug) or system + location/x,y,z. from (a place or body slug) fixes the departure; without it, every pair of beacons is tried.",
      inputSchema: z.object({
        markerId: z
          .string()
          .optional()
          .describe("One of the signed-in player's markers, from list_markers"),
        place: z
          .string()
          .optional()
          .describe("Slug of a place with recorded coordinates"),
        system: z
          .string()
          .optional()
          .describe("System slug for coordinates: stanton, pyro, nyx…"),
        location: z
          .string()
          .optional()
          .describe(
            "The /showlocation line, e.g. Coordinates: x:5000000000 y:20000000000 z:0",
          ),
        x: z.number().optional().describe("System X, in metres"),
        y: z.number().optional().describe("System Y, in metres"),
        z: z.number().optional().describe("System Z, in metres"),
        from: z
          .string()
          .optional()
          .describe(
            "Departure beacon: slug of a place in space or of a body. Omit to try every pair",
          ),
        limit: z.number().int().min(1).max(10).optional(),
      }),
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async (args, ctx) => {
      const { bodies, places } = await getNpsData();

      let name: string | undefined;
      let systemSlug: string | undefined;
      let position: PlacePosition | undefined;
      const query = new URLSearchParams();

      if (args.markerId) {
        const userId = optionalUserId(ctx, MARKERS_SCOPE);
        if (!userId) {
          return toolError(
            "Markers are personal: the user must sign in to Nexus (scope markers:read).",
          );
        }
        const marker = await getMarker(userId, args.markerId);
        if (!marker) return toolError(`No marker ${args.markerId}.`);
        name = marker.name;
        systemSlug = marker.systemSlug;
        position = marker.position;
        query.set("marker", marker.id);
      } else if (args.place) {
        const place = places.find((one) => one.slug === args.place);
        if (!place) {
          return toolError(
            `No recorded coordinates for the place ${args.place} (players can contribute them).`,
          );
        }
        name = place.name;
        position = place.position;
        systemSlug =
          place.systemSlug ??
          bodies.find((body) => body.slug === place.position.body)?.systemSlug;
        query.set("place", place.slug);
      } else {
        const read = args.location
          ? parseShowLocation(args.location)
          : args.x !== undefined && args.y !== undefined && args.z !== undefined
            ? { x: args.x, y: args.y, z: args.z }
            : null;
        if (!read) {
          return toolError(
            "Give markerId, place, or system with the /showlocation line or x, y and z.",
          );
        }
        if (!args.system) {
          return toolError(
            "Coordinates of different systems do not compare: give system (stanton, pyro, nyx…).",
          );
        }
        systemSlug = args.system;
        position = read;
        query.set("system", args.system);
        query.set("x", String(read.x));
        query.set("y", String(read.y));
        query.set("z", String(read.z));
      }

      if (!systemSlug || !position) {
        return toolError("The system of this point is not known.");
      }
      const system = quantumSystem(bodies, places, systemSlug, Date.now());
      const target = qtTarget(position, system, name);
      if (!target) {
        return toolError(
          "The body this point is on has no rotation data yet: it cannot be placed.",
        );
      }
      const from = args.from ? findQtBeacon(system, args.from) : undefined;
      if (args.from && !from) {
        return toolError(
          `${args.from} is not a quantum beacon of ${systemSlug} with known coordinates. Beacons: ${system.beacons.map((one) => one.id).join(", ")}.`,
        );
      }
      if (from) query.set("from", from.id);
      const url = siteUrl(`/saut-quantique?${query}`);
      const plan = planQuantumRoute(target, system, {
        from,
        limit: args.limit,
      });
      const label = name ? `“${name}”` : "this point";

      if (plan.kind === "surface") {
        const { body, altitude, places: near, fromOrbit } = plan.surface;
        const text =
          `${label} is near the ground of ${body.name} (altitude ${qtText(Math.max(0, altitude))}): the body blocks any straight line, so no jump is cut. ` +
          (near.length > 0
            ? `Jump to ${near[0].place.name} (${qtText(near[0].distance)} from the point), then fly.` +
              (near.length > 1
                ? ` Other places: ${near
                    .slice(1)
                    .map((one) => `${one.place.name} (${qtText(one.distance)})`)
                    .join(", ")}.`
                : "")
            : `Jump to ${body.name}: at least ${qtText(fromOrbit)} will be left from the orbital markers.`);
        return toolResult(
          {
            kind: "surface",
            body: body.slug,
            altitude: qtText(Math.max(0, altitude)),
            places: near.map((one) => ({
              slug: one.place.slug,
              name: one.place.name,
              distance: qtText(one.distance),
            })),
            url,
          },
          `${text}\n\nNavigator: ${url}`,
        );
      }

      const candidates = plan.candidates.map(toEntry);
      const text =
        plan.candidates.length > 0
          ? `Best quantum routes to ${label} (${systemSlug}), smallest expected error first:\n` +
            plan.candidates.map(line).join("\n") +
            "\nFinish with the NPS of Nexus App."
          : `No clear route leads near ${label}${from ? ` from ${from.name}` : ""}.`;
      return toolResult(
        { kind: "space", system: systemSlug, candidates, url },
        `${text}\n\nNavigator: ${url}`,
      );
    },
  );
}
