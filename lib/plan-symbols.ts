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
} as const;

export type PlanGlyph = keyof typeof PLAN_GLYPHS;

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
