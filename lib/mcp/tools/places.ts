import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  filterPlaces,
  getNpsData,
  getPlaceDetails,
  getPlaceFacets,
  getPlacePlans,
} from "@/lib/places";
import { listMissionsAt } from "@/lib/missions";
import {
  bodyAt,
  compassPoint,
  geoOf,
  guide,
  nearestPlaces,
  parseShowLocation,
  positionOf,
  toBodyFrame,
  type Fix,
} from "@/lib/nps-geometry";
import {
  isDrawnPlan,
  planImage,
  PLACE_SERVICES,
  PLACE_TYPES,
  type PlacePlan,
} from "@/types/places";
import {
  jsonBlock,
  mdLink,
  PAGE_SIZE,
  READ_ONLY,
  siteUrl,
  toolError,
  toolResult,
  withoutInternals,
} from "../format";

export const placePath = (slug: string) => `/lieux/${slug}`;

const placeSummary = z.object({
  slug: z.string(),
  name: z.string(),
  type: z.string(),
  parentName: z.string().optional(),
  systemName: z.string().optional(),
  bodyName: z.string().optional(),
  services: z.array(z.string()).optional(),
  planCount: z.number().optional(),
  url: z.string(),
});

/** Ce qu'une fiche dit d'un plan, sans sa géométrie : `get_place_plan` la donne. */
export function planDigest(plan: PlacePlan) {
  const image = planImage(plan);
  return {
    id: plan.id,
    name: plan.name,
    kind: isDrawnPlan(plan) ? ("drawn" as const) : ("image" as const),
    levels: isDrawnPlan(plan)
      ? plan.levels.map((level) => ({ id: level.id, name: level.name }))
      : undefined,
    markers: plan.markers.length,
    imageUrl: image?.url,
    borrowedFrom: plan.borrowedFrom?.slug,
  };
}

function round(value: number, digits = 0): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`;
  if (metres < 1_000_000) return `${round(metres / 1000, 1)} km`;
  return `${round(metres / 1_000_000, 1)} Mm`;
}

export function registerPlaceTools(server: McpServer) {
  server.registerTool(
    "search_places",
    {
      title: "Search places",
      description:
        "Search the places of the Star Citizen universe known to Nexus (systems' planets and moons, cities, stations, outposts, spaceports, districts, buildings, shops), with filters on type, system, celestial body, service or parent place.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Words in the name, parent, system or body"),
        type: z.enum(PLACE_TYPES).optional(),
        system: z
          .string()
          .optional()
          .describe("System slug, e.g. stanton, pyro"),
        body: z.string().optional().describe("Celestial body slug"),
        service: z.enum(PLACE_SERVICES).optional(),
        parent: z
          .string()
          .optional()
          .describe("Slug of the place directly containing the results"),
        under: z
          .string()
          .optional()
          .describe("Slug of a place: results anywhere below it"),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(PAGE_SIZE.max).optional(),
      }),
      outputSchema: z.object({
        total: z.number(),
        page: z.number(),
        places: z.array(placeSummary),
      }),
      annotations: READ_ONLY,
    },
    async ({ page = 1, limit = PAGE_SIZE.default, ...filters }) => {
      const { places, total } = await filterPlaces({ ...filters, page, limit });
      const summaries = places.map((place) => ({
        slug: place.slug,
        name: place.name,
        type: place.type,
        parentName: place.parentName,
        systemName: place.systemName,
        bodyName: place.bodyName,
        services: place.services,
        planCount: place.planCount,
        url: siteUrl(placePath(place.slug)),
      }));
      return toolResult(
        { total, page, places: summaries },
        `${total} places match (page ${page}):\n` +
          summaries
            .map(
              (place) =>
                `- ${mdLink(place.name, placePath(place.slug))} (slug: ${place.slug}, ${place.type})` +
                ` — ${[place.parentName, place.systemName].filter(Boolean).join(", ")}`,
            )
            .join("\n"),
      );
    },
  );

  server.registerTool(
    "list_place_facets",
    {
      title: "List place types, systems and bodies",
      description:
        "List the place types, star systems, celestial bodies and services known to Nexus, with their slugs, to build filters for search_places.",
      inputSchema: z.object({}),
      outputSchema: z.looseObject({}),
      annotations: READ_ONLY,
    },
    async () => {
      const facets = await getPlaceFacets();
      return toolResult(facets, jsonBlock(facets));
    },
  );

  server.registerTool(
    "get_place",
    {
      title: "Get a place",
      description:
        "Full sheet of a place by slug: description, tip, services, parent chain, child places, shops below it, missions given there, NPS coordinates when known, and the list of its maps (use get_place_plan for a map's content).",
      inputSchema: z.object({
        slug: z
          .string()
          .min(1)
          .describe("Place slug, from search or search_places"),
      }),
      outputSchema: z.looseObject({
        slug: z.string(),
        name: z.string(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug }) => {
      const place = await getPlaceDetails(slug);
      if (!place) return toolError(`No place found with slug: ${slug}`);
      const missions = await listMissionsAt(place.slug);
      const data = {
        ...withoutInternals(place, [
          "id",
          "plans",
          "planTargets",
          "ancestorSlugs",
          "path",
          "depth",
          "celestial",
          "createdAt",
        ]),
        slug: place.slug,
        name: place.name,
        url: siteUrl(placePath(place.slug)),
        ancestors: place.ancestors.map((a) => `${a.name} (${a.slug})`),
        children: place.children.map((c) => ({
          slug: c.slug,
          name: c.name,
          type: c.type,
        })),
        shops: place.shops.map((s) => ({ slug: s.slug, name: s.name })),
        plans: (place.plans ?? []).map(planDigest),
        missions: missions.map((m) => ({
          title: m.title,
          url: siteUrl(`/missions/${m.id}`),
        })),
      };
      return toolResult(
        data,
        `${mdLink(place.name, placePath(place.slug))}\n\n${jsonBlock(data)}`,
      );
    },
  );

  server.registerTool(
    "get_place_plan",
    {
      title: "Get a place map",
      description:
        "Content of one map of a place. A drawn map returns its full geometry: extent in centimetres, levels with rooms, walls, doors, labels, measures, and markers (as fractions of the extent). An image map returns its image URL and markers. Without planId, the first map of the place.",
      inputSchema: z.object({
        slug: z.string().min(1).describe("Place slug"),
        planId: z.string().optional().describe("Map id from get_place"),
      }),
      outputSchema: z.looseObject({
        place: z.string(),
        plan: z.looseObject({}),
      }),
      annotations: READ_ONLY,
    },
    async ({ slug, planId }) => {
      const found = await getPlacePlans(slug);
      if (!found) return toolError(`No place found with slug: ${slug}`);
      const plan = planId
        ? found.plans.find((candidate) => candidate.id === planId)
        : found.plans[0];
      if (!plan) {
        return toolError(
          found.plans.length
            ? `No map ${planId} on ${found.name}. Maps: ${found.plans.map((p) => `${p.name} (${p.id})`).join(", ")}`
            : `${found.name} has no map yet.`,
        );
      }
      const data = {
        place: found.slug,
        placeName: found.name,
        url: siteUrl(placePath(found.slug)),
        plan: withoutInternals(plan, ["underlay"]),
        markerTargets: found.targets.map((t) => ({
          slug: t.slug,
          name: t.name,
          type: t.type,
        })),
      };
      const image = planImage(plan);
      return toolResult(
        data,
        `${plan.name} — ${found.name}` +
          (image ? `\nImage: ![${plan.name}](${image.url})` : "") +
          `\n\n${jsonBlock(data)}`,
      );
    },
  );

  server.registerTool(
    "nps_locate",
    {
      title: "Locate a /showlocation reading (NPS)",
      description:
        'Nexus Positioning System. Give the line the game copies to the clipboard after the /showlocation chat command ("Coordinates: x:… y:… z:…", in metres, star system frame). Returns the celestial body the player is on or near, latitude/longitude/altitude, the nearest places with recorded coordinates, and, when a destination slug is given, the distance and the compass heading to follow. Coordinates of different systems do not compare: pass system when the player is in deep space.',
      inputSchema: z.object({
        location: z
          .string()
          .describe(
            "The /showlocation line, e.g. Coordinates: x:-18930539540.392 y:-2610440830.140 z:0.000",
          ),
        destination: z
          .string()
          .optional()
          .describe("Slug of the place to reach"),
        system: z
          .string()
          .optional()
          .describe(
            "System slug, when the player is in space far from any body",
          ),
        nearest: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("How many nearby places (default 5)"),
      }),
      outputSchema: z.looseObject({}),
      annotations: { ...READ_ONLY, idempotentHint: false },
    },
    async ({ location, destination, system, nearest = 5 }) => {
      const coordinates = parseShowLocation(location);
      if (!coordinates) {
        return toolError(
          'Could not read coordinates. Expected the /showlocation line: "Coordinates: x:… y:… z:…".',
        );
      }
      const fix: Fix = { ...coordinates, at: Date.now() };
      const { bodies, places } = await getNpsData();
      const body = bodyAt(fix, bodies);
      const systemSlug = system ?? body?.systemSlug;
      const local = body ? toBodyFrame(fix, body) : null;
      const geo = body && local ? geoOf(local, body) : null;

      const around = nearestPlaces(
        fix,
        places,
        bodies,
        systemSlug ?? null,
        nearest,
      ).map(({ place, distance }) => ({
        slug: place.slug,
        name: place.name,
        type: place.type,
        parentName: place.parentName,
        distanceMetres: Math.round(distance),
      }));

      let route: Record<string, unknown> | undefined;
      if (destination) {
        const target = places.find((place) => place.slug === destination);
        if (!target) {
          route = {
            destination,
            error:
              "No recorded NPS coordinates for this place yet (players can contribute them).",
          };
        } else {
          const guidance = guide(fix, null, target.position, bodies);
          route = guidance
            ? {
                destination: target.slug,
                destinationName: target.name,
                distanceMetres: Math.round(guidance.distance),
                surface: guidance.surface
                  ? {
                      distanceMetres: Math.round(guidance.surface.distance),
                      headingDegrees: round(guidance.surface.heading),
                      compass: compassPoint(
                        guidance.surface.heading,
                      ).toUpperCase(),
                    }
                  : undefined,
              }
            : { destination, error: "The destination's body is unknown." };
        }
      }

      const data = {
        system: systemSlug,
        body: body ? { slug: body.slug, name: body.name } : null,
        geo: geo
          ? {
              latitude: round(geo.latitude, 4),
              longitude: round(geo.longitude, 4),
              altitudeMetres: Math.round(geo.altitude),
            }
          : null,
        position: positionOf(fix, bodies),
        nearest: around,
        route,
      };
      const lines = [
        body
          ? `On or near ${body.name}${geo ? ` — lat ${data.geo!.latitude}°, lon ${data.geo!.longitude}°, alt ${formatDistance(geo.altitude)}` : ""}.`
          : systemSlug
            ? `In space (${systemSlug}), near no known body.`
            : "In space, near no known body. Pass `system` (e.g. stanton, pyro): coordinates of two systems do not compare, so nearby places may be wrong.",
        around.length
          ? "Nearest recorded places:\n" +
            around
              .map(
                (p) =>
                  `- ${p.name} (slug: ${p.slug}) — ${formatDistance(p.distanceMetres)}`,
              )
              .join("\n")
          : "No recorded place nearby.",
      ];
      if (route?.error)
        lines.push(`Destination ${destination}: ${route.error}`);
      else if (route) {
        const surface = route.surface as
          | { distanceMetres: number; headingDegrees: number; compass: string }
          | undefined;
        lines.push(
          `To ${route.destinationName}: ${formatDistance(route.distanceMetres as number)} in a straight line` +
            (surface
              ? `, ${formatDistance(surface.distanceMetres)} over the ground, heading ${surface.headingDegrees}° (${surface.compass}).`
              : "."),
        );
      }
      return toolResult(data, lines.join("\n\n"));
    },
  );
}
