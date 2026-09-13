import type { PlanInk } from "@/types/plan";
import type { RaidView, Squad } from "@/types/squad";

/**
 * What an ink looks like.
 *
 * A stroke stores a name, not a colour — the same bargain a role strikes when
 * it travels as `"heart-pulse"`. Two clients may draw it differently, and a
 * plan drawn last month survives a change of palette.
 *
 * `squad` is the one that earns its keep: it resolves to the hue the raid board
 * already gives the author's squad, so a glance at a plan says which squad drew
 * what without a legend. Outside a raid there is only one squad, and it takes
 * the board's own blue.
 */

/**
 * A hue per sub-squad, the same list and the same order as `app/squads/raid.tsx`.
 *
 * Blues through pinks only: green, amber and red already mean ready, leader and
 * down on the rows underneath, and a plan drawn over a roster should not have to
 * be read against it.
 */
export const SQUAD_HUES = [250, 300, 340, 200, 275, 320];

export function squadHue(index: number): string {
  return `oklch(0.74 0.13 ${SQUAD_HUES[index % SQUAD_HUES.length]})`;
}

/** The fixed half of the palette — everything that is not somebody's squad. */
const INKS: Record<Exclude<PlanInk, "squad">, string> = {
  amber: "#FCD34D",
  red: "#FCA5A5",
  green: "#6EE7B7",
  sky: "#7DD3FC",
  violet: "oklch(0.74 0.13 300)",
  white: "#CCE7FF",
};

/**
 * Which squad of the raid wears which hue, by id.
 *
 * Built from the raid in the order the board draws it, so the dot beside a
 * squad's name and the traces its members leave are the same colour. A squad
 * running alone is a map of one.
 */
export function hueMap(
  squad: Squad | null,
  raid: RaidView | null,
): Map<string, string> {
  const hues = new Map<string, string>();

  if (raid) {
    raid.squads.forEach((sub, index) => hues.set(sub.id, squadHue(index)));
  } else if (squad) {
    hues.set(squad.id, squadHue(0));
  }

  return hues;
}

/**
 * The colour to paint with.
 *
 * An author whose squad has left the raid since — or a plan read by somebody
 * who cannot see that squad — falls back to the board's own blue rather than
 * disappearing: a trace nobody can see is worse than a trace in the wrong
 * colour.
 */
export function inkColor(
  ink: PlanInk,
  squadId: string,
  hues: Map<string, string>,
): string {
  if (ink !== "squad") return INKS[ink];

  return hues.get(squadId) ?? squadHue(0);
}

/** The swatches the toolbar offers, in the order it offers them. */
export function inkSwatches(
  mine: string,
  hues: Map<string, string>,
): { ink: PlanInk; color: string }[] {
  return [
    { ink: "squad", color: inkColor("squad", mine, hues) },
    { ink: "amber", color: INKS.amber },
    { ink: "red", color: INKS.red },
    { ink: "green", color: INKS.green },
    { ink: "sky", color: INKS.sky },
    { ink: "violet", color: INKS.violet },
    { ink: "white", color: INKS.white },
  ];
}
