/**
 * Les glyphes d'un plan dessiné, en données plutôt qu'en composants.
 *
 * Les icônes de service vivent déjà dans `lib/place-icons.ts`, mais sous forme
 * de composants Heroicons : parfaits dans une page React, inutilisables dans la
 * chaîne SVG que `lib/plan-render.ts` fabrique pour la planche et pour le PNG.
 * D'où ce second jeu, en `d` de tracé pur — le même dessin, dans la seule forme
 * qu'une sérialisation sait embarquer.
 *
 * Tous sont tracés sur une grille de 24, en traits sans remplissage : c'est ce
 * qui leur permet d'être rendus à 16 px dans une légende et à 48 px sur une
 * planche en 2560 sans jamais être redessinés.
 */

/** La grille sur laquelle tous les glyphes sont tracés. */
export const GLYPH_GRID = 24;

/** L'épaisseur de trait, dans cette même grille. */
export const GLYPH_STROKE = 1.6;

/**
 * Ce qu'un repère peut désigner sur la planche, et le dessin qui le dit.
 *
 * Les clés ne sont pas des `PlaceService` : un service est ce qu'on vient
 * chercher sur place, alors qu'un repère de planche marque aussi ce qui n'est
 * pas un service — une sortie de secours, un point d'apparition, un objectif.
 */
export const PLAN_GLYPHS = {
  door: "M4 20h4V4l8 2.4V20h4",
  doubleDoor: "M2 20h3V5l6 1.8V20M22 20h-3V5l-6 1.8V20",
  airlock: "M3.5 5h17v14h-17ZM12 5v14M8 12H5m14 0h-3",
  stairUp: "M3 20h4v-4h5v-4h5V8h4m-1-3 3 3-3 3",
  stairDown: "M3 20h4v-4h5v-4h5V8h4M7 11l-3-3 3-3",
  lift: "M4.5 3.5h15v17h-15Zm4.5 7.5 3-3 3 3M9 14l3 3 3-3",
  ladder: "M7 3v18M17 3v18M7 8h10M7 13h10M7 18h10",
  glazing: "M3.5 6.5h17v11h-17Zm.5 10.5 16-10",
  objective: "m12 3 4.5 9L12 21l-4.5-9Z",
  spawn: "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z",
  exit: "M10 20.5 13 15l-3-3 1-5 4 3 3 1M4 12h3",
  locker: "M5.5 3.5h13v17h-13Zm0 8.5h13M15 8h1.2M15 16h1.2",
  terminal: "M4 4.5h16v11H4Zm4 15h8m-4-4v4",
  care: "M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z",
  hazard: "M12 3.5 21.5 20H2.5Zm0 6.5v4m0 3v.01",

  /*
   * Ce que le relevé d'un lieu montre quand ce n'est ni un service ni une
   * porte vers ailleurs : ce qu'on vient y chercher, et ce qui s'y oppose.
   */
  crate: "M3.5 8 12 4l8.5 4v8L12 20l-8.5-4Zm0 0L12 12l8.5-4M12 12v8",
  key: "M20.5 3.5 12 12m-1.5 1.5L12 12m-1.5 1.5 2.5 2.5M12 12l2.5 2.5m3-9 2 2M7 14.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  camera: "M3.5 7.5h9.5l3 3.5H3.5Zm0 3.5v8.5M3.5 11l14-3.5 3 11-17 4Z",
  turret: "M12 12.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm2-1.5V4h6M8 20.5h8",
  breaker: "M6.5 3.5h11v17h-11Zm6 3.5-3 5h4l-3 5",
  lockedDoor:
    "M5 20.5V3.5h14v17M14.5 10.5h4v5h-4Zm.8 0V9a1.2 1.2 0 0 1 2.4 0v1.5",
  listening:
    "M12 20.5V8m0 0a3.5 3.5 0 1 0 0-4.5M5 13a7 7 0 0 1 0-6m14 6a7 7 0 0 0 0-6M8 20.5h8",
  deposit: "M4 20.5h16L16 9l-4 4-2-2.5Zm4-11L10 5l2.5 3",
  wreck: "M3 18.5h18M5.5 18.5 7 8l10 2-1 8.5M7 8l2.5-4.5M17 10l2 8.5",
  container: "M3 8.5h18v10H3Zm3.5 0v10m5-10v10m5-10v10",
  supply: "M12 3.5v9m0 0-3.5-3m3.5 3 3.5-3M4 14.5v5h16v-5",
} as const;

export type PlanGlyph = keyof typeof PLAN_GLYPHS;

/** Un nom de glyphe venu du client, avant de le croire. */
export function isPlanGlyph(value: string): value is PlanGlyph {
  return Object.hasOwn(PLAN_GLYPHS, value);
}

/**
 * Le dessin de chaque service, en tracé pur.
 *
 * Elle manquait, et c'est pour ça qu'une planche exportée ne montrait aucun
 * repère : `lib/place-icons.ts` associe bien un service à une icône, mais ce
 * sont des composants React, que rien ne sait sérialiser dans un SVG. Les
 * tracés viennent de la maquette validée, où ils ont été dessinés pour être les
 * mêmes qu'en fiche de lieu.
 */
export const PLACE_SERVICE_GLYPHS: Record<string, string> = {
  asop: "M12 2.5c3.2 2.4 5 6 5 10l-1.6 4h-6.8L7 12.5c0-4 1.8-7.6 5-10ZM8 17 5.5 21h13L16 17M12 8.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6Z",
  restock: "M13.5 2.5 5 13.5h6L10.5 21.5 19 10.5h-6Z",
  medical:
    "M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.4a4.7 4.7 0 0 1 8.5 2.8c0 5.8-8.5 11.3-8.5 11.3Z",
  armory:
    "M12 2.5 20 5v7c0 5-3.6 8.2-8 9.5C7.6 20.2 4 17 4 12V5Zm-3 9.3 2.2 2.2L15.4 10",
  cargo: "M3.5 7.5h17V20h-17ZM2.5 4h19v3.5h-19ZM10 12h4",
  refinery:
    "M9.5 3v6.2L4.2 18a2 2 0 0 0 1.7 3h12.2a2 2 0 0 0 1.7-3l-5.3-8.8V3M8 3h8M7 14h10",
  rental:
    "M8 3.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm3.2 7.7 9 9m-2.7-2.7 2-2m-5 0 2-2",
  habitation: "M3.5 11 12 3.5l8.5 7.5M5.5 10.2V20h13v-9.8M10 20v-5.5h4V20",
  crafting:
    "M14.8 3.2a4.5 4.5 0 0 0 5.6 5.9l-9 9a2.6 2.6 0 0 1-3.7-3.7Zm-9.8 15.8 2-2",
  missions: "M6.5 4.5h11v16h-11ZM9 3h6v3H9ZM8.5 11h7M8.5 15h4.5",
  transit:
    "m3 6.5 6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5ZM9 4v15.5M15 6.5V22",
  hangar: "M3.5 3.5h7v7h-7Zm10 0h7v7h-7Zm-10 10h7v7h-7Zm10 0h7v7h-7Z",
};

/**
 * Les icônes du rail d'outils, reprises une à une de la maquette validée.
 *
 * Même grille de 24 et même trait que `PLAN_GLYPHS` : le rail, la légende et la
 * planche parlent la même langue graphique. Des lettres y tenaient lieu d'icônes
 * à la première livraison — elles ne disaient rien, et c'est ce que cette table
 * répare.
 *
 * Les clés sont celles de `PLAN_TOOLS` (`drawn-plan-editor/use-plan-draft.ts`) :
 * en ajouter un outil sans l'ajouter ici laisse un bouton vide.
 */
export const TOOL_GLYPHS = {
  select: "m5 3 14 8.5-6.2 1.4L10 20Z",
  room: "M3.5 5.5h17v13h-17Z",
  poly: "M4 4h9v7h7v9H4Z",
  wall:
    "M3 18 21 6M1.9 18a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0" +
    "M18.9 6a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0",
  door: "M4 20h4V4l8 2.4V20h4" + "M13.9 12.5a.9.9 0 1 0 1.8 0 .9.9 0 1 0-1.8 0",
  stair: "M3 20h4v-4h5v-4h5V8h4",
  marker:
    "M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" +
    "M9.6 10a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 1 0-4.8 0",
  label: "M5 6.5V5h14v1.5M12 5v14M9 19h6",
  measure: "M2.5 8.5h19v7h-19ZM7 8.5v3M11 8.5v4M15 8.5v3M19 8.5v4",
} as const;

export type ToolGlyph = keyof typeof TOOL_GLYPHS;

/**
 * La lettre du raccourci, affichée en badge d'angle sur le bouton.
 *
 * Ce n'est pas une traduction : une touche du clavier est la même partout, et
 * la passer par `messages/*.json` laissait croire le contraire.
 */
export const TOOL_KEYS = {
  select: "V",
  room: "R",
  poly: "P",
  wall: "M",
  door: "D",
  stair: "E",
  marker: "X",
  label: "T",
  measure: "C",
} as const;

/**
 * Les encres de la planche, reprises une à une de `PLAN_INKS` (`types/plan.ts`).
 *
 * Le plan de vol et le plan de lieu se lisent souvent l'un après l'autre — le
 * relevé sert de fond au briefing. Deux palettes voudraient dire que l'ambre du
 * briefing et l'ambre de la carte ne sont pas le même ambre, et personne ne
 * saurait dire lequel veut dire quoi.
 */
export const PLAN_INK_COLORS = {
  amber: "#F2B441",
  red: "#F0564F",
  green: "#4FD98A",
  sky: "#6FB6F0",
  violet: "#B08CF0",
  white: "#E8F3FF",
} as const;

export type PlanInkName = keyof typeof PLAN_INK_COLORS;
