import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { PLAN_GLYPHS } from "@/lib/plan-symbols";
import {
  DOOR_KINDS,
  MAX_LEVEL_DOORS,
  MAX_LEVEL_LABELS,
  MAX_LEVEL_MEASURES,
  MAX_LEVEL_ROOMS,
  MAX_LEVEL_WALLS,
  MAX_PLACE_MARKERS,
  MAX_PLAN_LEVELS,
  MAX_ROOM_POINTS,
  PLACE_SERVICES,
  ROOM_FILLS,
  ROOM_KINDS,
} from "@/types/places";

/**
 * Le mode d'emploi des plans dessinés, pour les agents qui en relèvent un par
 * les outils `plan_draft_*`. Écrit d'après `types/places.ts` : les listes
 * fermées et les limites viennent du code, elles ne peuvent pas dériver.
 */
export const PLAN_FORMAT_URI = "nexus://docs/plan-format";

export function planFormatDoc(): string {
  return `# Nexus Tools drawn place maps

A drawn plan is the floor map of a place (outpost, station, building), surveyed room by room. It is what the plan_draft_* tools edit, and exactly what the site's editor produces.

## Units and frame
- Integer centimetres everywhere. Origin (0, 0) is the top-left corner of the extent; x grows to the east (right), y to the south (down). North is up.
- The extent (widthCm × heightCm) is the drawing area; keep every room inside it. Leave a margin of a few metres.
- Typical sizes: corridor 200–300 cm wide, room 400–1200 cm, small ship hangar 2000–3000 cm, door 130 cm.

## Levels
- Up to ${MAX_PLAN_LEVELS} levels, ordered from the bottom (basement) to the top. Each level is a full sheet: nothing is shared between levels, not even a wall.

## Rooms (≤ ${MAX_LEVEL_ROOMS} per level)
- Rectangle: x, y (top-left corner), w, h, and rot (integer degrees, clockwise, around the centre, in ]-180, 180]).
- Any other shape: points = [x0, y0, x1, y1, …], 3 to ${MAX_ROOM_POINTS} vertices, in plan coordinates. An L-shaped building is ONE room, not two.
- kind (what it is): ${ROOM_KINDS.join(", ")}.
- fill (how it stands out): ${ROOM_FILLS.join(", ")}. plain by default; corridor for circulation; objective for a mission objective; access for an entrance area; mass for solid volumes; none for an outline only.
- stair: "up" or "down" makes the room a staircase.
- label: false hides the name (shafts, small technical rooms).
- Rooms of a level must not overlap, except areas of kind "outside".

## Walls (≤ ${MAX_LEVEL_WALLS} per level)
- Rooms already draw their outline. Add a wall only where no room borders: a facade, a low wall, a fence. plan_draft_edit takes a segment (x1, y1, x2, y2, thickness).

## Doors (≤ ${MAX_LEVEL_DOORS} per level)
- A door sits on a wall and knows nothing of the rooms it links. kind: ${DOOR_KINDS.join(", ")}. plan_draft_edit snaps it to the nearest room edge or wall.

## Labels and measures
- Labels (≤ ${MAX_LEVEL_LABELS} per level): free text at a point (a direction, a note).
- Measures (≤ ${MAX_LEVEL_MEASURES} per level): two points; the length is computed at render.

## Markers (≤ ${MAX_PLACE_MARKERS} per plan)
- A marker opens exactly one of: another place (its slug: a shop, a hangar, a clinic inside this place), a service (${PLACE_SERVICES.join(", ")}), or a glyph (${Object.keys(PLAN_GLYPHS).join(", ")}).
- Stored as fractions of the extent; plan_draft_edit takes centimetres and converts them.

## Workflow
1. get_place to know the place, its children (for markers) and its existing maps; get_place_plan to copy the style of a map.
2. plan_draft_create (new extent, or fromPlanId to correct an existing map).
3. plan_draft_edit in batches: levels, then rooms (nextTo helps chain them), then doors, labels, markers.
4. plan_draft_render after each batch: look at the image and fix the anomalies listed.
5. plan_draft_submit when it matches the place. The user confirms; trusted contributors publish directly, others go to review.
`;
}

export function registerPlanFormatResource(server: McpServer) {
  server.registerResource(
    "plan-format",
    PLAN_FORMAT_URI,
    {
      title: "Drawn place map format",
      description:
        "How Nexus Tools drawn place maps are described: units, levels, rooms, walls, doors, labels, measures, markers, and the drafting workflow.",
      mimeType: "text/markdown",
      cacheHint: { ttlMs: 60 * 60 * 1000, cacheScope: "public" },
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: "text/markdown", text: planFormatDoc() },
      ],
    }),
  );
}
