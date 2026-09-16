/**
 * Le rendu d'un relevé dessiné, en SVG et rien d'autre.
 *
 * Un seul moteur pour trois sorties, et c'est le point : la carte qu'un lecteur
 * regarde, la planche qu'on publie et le PNG qu'on exporte sont la **même**
 * image. Deux moteurs auraient fini par diverger d'un pixel, puis d'une porte.
 *
 * Pur à dessein — ni React, ni DOM, ni `server-only`. Le serveur en fait une
 * page, le navigateur en fait un PNG en le sérialisant dans un `<canvas>`, et
 * l'éditeur s'en sert pour son aperçu sans rien réimplémenter.
 *
 * L'unité du `viewBox` est le **centimètre du relevé**, jamais le pixel. C'est
 * ce qui permet aux repères — qui sont des fractions de l'emprise — de tomber
 * exactement au même endroit quelle que soit la taille d'affichage, et à une
 * cote de rester une longueur.
 */

import {
  GLYPH_GRID,
  GLYPH_STROKE,
  PLACE_SERVICE_GLYPHS,
  PLAN_INK_COLORS,
  PLAN_GLYPHS,
  type PlanGlyph,
} from "@/lib/plan-symbols";
import { polygonCentroid, rotatePoint } from "@/lib/plan-geometry";
import type {
  DrawnPlacePlan,
  PlacePlanMarker,
  PlanLabel,
  PlanLevel,
  PlanMeasure,
  PlanRoom,
  RoomFill,
} from "@/types/places";

/* ------------------------------------------------------------------ */
/* La palette                                                          */
/* ------------------------------------------------------------------ */

/**
 * Les couleurs de la planche. Ce sont celles de l'application, résolues :
 * `app/globals.css` les donne en `hsl()` par variables, et une variable CSS ne
 * survit pas à la sérialisation vers un `<canvas>`.
 */
export const PLAN_THEME = {
  field: "#05192A",
  fg: "#C7E3FF",
  muted: "#8FB4D4",
  line: "rgba(158, 208, 255, 0.16)",
  wall: "#CBE4FF",
  room: "#16394F",
  mass: "#22506A",
  corridor: "rgba(22, 57, 79, 0.55)",
  accent: "#F2B441",
  access: "#4FD98A",
} as const;

export type PlanTheme = typeof PLAN_THEME;

/**
 * Les trois familles de la planche.
 *
 * Geist et rien d'autre : c'est la police que l'application sert elle-même
 * (`app/fonts`, chargée par `next/font/local`). Une police d'affichage plus
 * typée rendrait mieux le genre visé, mais il faudrait l'embarquer aussi dans
 * l'export, et une planche dont le PNG ne ressemble pas à l'écran vaut moins
 * qu'une planche sobre.
 */
const DISPLAY_FACE = "Geist, system-ui, sans-serif";
const TEXT_FACE = "Geist, system-ui, sans-serif";
const MONO_FACE = "Geist Mono, ui-monospace, monospace";

/** Le remplissage d'une pièce, et le trait qui la borde. */
function roomPaint(fill: RoomFill, theme: PlanTheme) {
  switch (fill) {
    case "mass":
      return { fill: theme.mass, stroke: theme.wall };
    case "corridor":
      return { fill: theme.corridor, stroke: theme.wall };
    case "objective":
      return { fill: "rgba(242, 180, 65, 0.12)", stroke: theme.accent };
    case "access":
      return { fill: "rgba(79, 217, 138, 0.10)", stroke: theme.access };
    case "none":
      return { fill: "none", stroke: theme.wall };
    default:
      return { fill: theme.room, stroke: theme.wall };
  }
}

/* ------------------------------------------------------------------ */
/* Les primitives                                                      */
/* ------------------------------------------------------------------ */

/**
 * Le texte d'un relevé est saisi par des humains, et la planche part en PNG et
 * en PDF : une esperluette non échappée casse le document entier, sans rien
 * dire de plus qu'une image vide.
 */
export function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Deux décimales suffisent au centimètre, et allègent la chaîne d'autant. */
function n(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "0";
}

/** Des centimètres en mètres, à la française. */
function metres(value: number): string {
  return `${(value / 100).toFixed(2).replace(".", ",")} m`;
}

/**
 * Un facteur d'échelle, avec assez de décimales pour ne pas mentir.
 *
 * `n()` arrondit au centième, ce qui convient à un centimètre de relevé mais
 * ruine un rapport : à partir d'environ 2 528 m d'emprise — que
 * `MAX_PLAN_EXTENT_CM` autorise largement — le rapport passait sous 0,005,
 * s'arrondissait à zéro, et la planche sortait avec son titre, son échelle et
 * un vide à la place du plan.
 */
function ratio(value: number): string {
  return Number.isFinite(value) && value > 0 ? value.toPrecision(8) : "0";
}

/** La rotation d'un élément, autour de son propre centre. Vide quand nulle. */
function spin(rot: number, cx: number, cy: number): string {
  return rot ? ` transform="rotate(${n(rot)} ${n(cx)} ${n(cy)})"` : "";
}

/**
 * Coupe un nom en deux lignes au plus, sur le blanc le plus central.
 *
 * SVG ne renvoie pas le texte à la ligne : sans ça, « Bureau du superviseur »
 * déborde de sa pièce et vient se poser sur la voisine.
 */
function twoLines(name: string, maxChars: number): string[] {
  if (name.length <= maxChars || !name.includes(" ")) return [name];

  const middle = name.length / 2;
  let cut = -1;
  for (let at = name.indexOf(" "); at !== -1; at = name.indexOf(" ", at + 1)) {
    if (cut === -1 || Math.abs(at - middle) < Math.abs(cut - middle)) cut = at;
  }
  return [name.slice(0, cut), name.slice(cut + 1)];
}

/* ------------------------------------------------------------------ */
/* Un niveau                                                           */
/* ------------------------------------------------------------------ */

export type LevelOptions = {
  theme?: PlanTheme;
  /** Peindre le fond. Faux pour le visualiseur, qui a déjà le sien. */
  background?: boolean;
  /** Graver les noms de pièce. Faux pour une vignette, où ils seraient illisibles. */
  labels?: boolean;
  /**
   * Les repères de ce niveau, à graver. Absents, ils ne le sont pas — le
   * visualiseur pose les siens en boutons focusables par-dessus le SVG.
   */
  markers?: PlacePlanMarker[];
  /** L'emprise, pour convertir les fractions d'un repère en centimètres. */
  extentCm?: { width: number; height: number };
};

/** Les sommets d'un contour, au format qu'attend `points`. */
function roomPolygonPoints(points: number[]): string {
  return points
    .map((value, index) => (index % 2 ? `${n(value)} ` : `${n(value)},`))
    .join("")
    .trim();
}

/**
 * L'inclinaison d'une étiquette, pour qu'elle ne se lise jamais à l'envers.
 *
 * Au-delà du quart de tour, le texte suivait la pièce jusqu'à se retrouver la
 * tête en bas. Un demi-tour de plus le remet debout sans changer la ligne qu'il
 * suit : c'est la convention des plans d'architecte.
 */
function readableAngle(rot: number): number {
  return rot > 90 || rot < -90 ? rot + 180 : rot;
}

/**
 * Le hachurage d'un escalier : cinq marches dans la moitié basse de la pièce,
 * sous l'étiquette plutôt qu'à travers, et le glyphe qui dit **où ça mène**.
 *
 * Le sens manquait. `room.stair` n'était testé qu'en vérité : « monte » et
 * « descend » sortaient identiques, et le choix fait dans l'inspecteur — stocké,
 * normalisé, relu — était jeté au moment de dessiner.
 *
 * Exporté parce que l'éditeur s'en sert : sa couche SVG partage le repère en
 * centimètres du moteur, donc elle affiche la même hachure que la planche au
 * lieu d'en réinventer une qui finirait par diverger.
 */
export function stairs(room: PlanRoom, theme: PlanTheme): string {
  const inset = Math.min(room.w, room.h) * 0.14;
  const top = room.y + room.h * 0.45;
  const span = room.h * 0.42;
  const steps = 5;

  let out = "";
  for (let step = 0; step < steps; step += 1) {
    const y = top + (span / (steps - 1)) * step;
    out +=
      `<line x1="${n(room.x + inset)}" y1="${n(y)}"` +
      ` x2="${n(room.x + room.w - inset)}" y2="${n(y)}"` +
      ` stroke="${theme.wall}" stroke-width="${n(Math.max(2, room.h * 0.012))}"` +
      ` opacity="0.65" />`;
  }

  if (room.stair === "up" || room.stair === "down") {
    const size = Math.min(room.w, room.h) * 0.22;
    out += glyph(
      room.stair === "up" ? "stairUp" : "stairDown",
      room.x + room.w / 2 - size / 2,
      top + span / 2 - size / 2,
      size,
      theme.accent,
    );
  }

  return out;
}

/**
 * Le nom d'une pièce, posé dans la pièce.
 *
 * Exporté pour la même raison que `stairs` : l'éditeur ne dessinait pas le nom
 * d'une pièce libre, et plutôt que d'écrire une troisième mise en page
 * d'étiquette, il appelle celle-ci.
 */
export function roomLabel(room: PlanRoom, theme: PlanTheme): string {
  if (!room.label || !room.name) return "";

  const size = Math.max(45, Math.min(130, Math.min(room.w, room.h) / 5));

  /*
   * Où poser le nom, en deux temps.
   *
   * D'abord dans le repère **non tourné** de la pièce : son centre de gravité
   * s'il s'agit d'une pièce libre, parce que sur une pièce en L le centre de la
   * boîte tombe dans l'échancrure, donc hors de la pièce ; et remonté à 22 %
   * quand un escalier occupe le bas.
   *
   * Puis tourné autour du **même pivot que la forme** — le centre de la boîte.
   * C'est l'étape qui manquait : la forme pivote là-bas, le centre de gravité
   * voyage donc avec elle, et un nom laissé sur le centre non tourné dérivait
   * d'autant. Un carré ne s'en apercevait pas, son centre de gravité étant le
   * pivot ; un L de quatre mètres, oui.
   */
  const pivot = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  const base = room.points?.length ? polygonCentroid(room.points) : pivot;
  const anchor = rotatePoint(
    { x: base.x, y: room.stair ? room.y + room.h * 0.22 : base.y },
    pivot,
    room.rot,
  );
  const cx = anchor.x;
  const cy = anchor.y;
  const lines = twoLines(
    room.name,
    Math.max(10, Math.floor(room.w / size) * 2),
  );

  const tspans = lines
    .map(
      (line, index) =>
        `<tspan x="${n(cx)}" dy="${index === 0 ? n(-((lines.length - 1) * size * 0.6)) : n(size * 1.15)}">${esc(line)}</tspan>`,
    )
    .join("");

  return (
    `<text x="${n(cx)}" y="${n(cy)}" fill="${theme.fg}"` +
    ` font-family="${DISPLAY_FACE}" font-size="${n(size)}"` +
    ` font-weight="600" letter-spacing="${n(size * 0.06)}"` +
    ` text-anchor="middle" dominant-baseline="central"` +
    // L'ancre est déjà au bon endroit : cette rotation-ci ne fait qu'incliner
    // les lettres, et le demi-tour de lisibilité les remet debout sur place.
    `${spin(readableAngle(room.rot), cx, cy)}>${tspans}</text>`
  );
}

/**
 * Une mention libre posée sur le plan — « quai 3 », « accès restreint ».
 *
 * Exportée pour la même raison que `roomLabel` et `stairs` : l'éditeur ne les
 * dessinait pas **du tout**. L'outil posait un texte que la barre des calques
 * comptait et que personne ne voyait.
 */
export function planLabel(label: PlanLabel, theme: PlanTheme): string {
  return (
    `<text x="${n(label.x)}" y="${n(label.y)}" fill="${theme.muted}"` +
    ` font-family="${TEXT_FACE}" font-size="90" text-anchor="middle"` +
    ` dominant-baseline="central"` +
    `${spin(readableAngle(label.rot), label.x, label.y)}>` +
    `${esc(label.text)}</text>`
  );
}

/** Le contenu d'un niveau, sans `<svg>` autour : pièces, murs, portes, textes. */
export function renderLevelBody(
  level: PlanLevel,
  options: LevelOptions = {},
): string {
  const theme = options.theme ?? PLAN_THEME;
  const withLabels = options.labels !== false;
  let out = "";

  for (const room of level.rooms) {
    const paint = roomPaint(room.fill, theme);
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const stroke = Math.max(2, Math.min(room.w, room.h) * 0.02);

    // Une pièce libre est le même objet dessiné autrement : `x/y/w/h` restent sa
    // boîte englobante, donc la rotation et la sélection ne savent rien de sa
    // forme. Le hachurage, lui, la connaît maintenant — voir plus bas.
    const outline = room.points?.length ? roomPolygonPoints(room.points) : "";
    const shape = outline
      ? `<polygon points="${outline}"` +
        ` fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${n(stroke)}"` +
        ` stroke-linejoin="round" />`
      : `<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}"` +
        ` fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${n(stroke)}" />`;

    /*
     * Le hachurage d'escalier se calcule sur la boîte englobante. Dans une cage
     * en L, il déborderait donc de la pièce : on le découpe au contour.
     *
     * C'est le seul `id` que ce moteur émette, et il vaut d'être justifié —
     * un identifiant est global au document, donc deux rendus du même relevé
     * sur une page se marcheraient dessus. Celui-ci porte l'identifiant de la
     * pièce, un nanoid, et aucune de nos trois sorties n'affiche deux fois le
     * même niveau.
     */
    const hatch = room.stair ? stairs(room, theme) : "";
    const clipped =
      hatch && outline
        ? `<clipPath id="stair-${room.id}"><polygon points="${outline}" /></clipPath>` +
          `<g clip-path="url(#stair-${room.id})">${hatch}</g>`
        : hatch;

    out += `<g${spin(room.rot, cx, cy)}>` + shape + clipped + `</g>`;
  }

  for (const wall of level.walls) {
    out +=
      `<rect x="${n(wall.x)}" y="${n(wall.y)}" width="${n(wall.w)}" height="${n(wall.h)}"` +
      ` fill="${theme.wall}"${spin(wall.rot, wall.x + wall.w / 2, wall.y + wall.h / 2)} />`;
  }

  for (const door of level.doors) {
    // Une ouverture n'est pas une porte : elle évide le mur, elle ne le remplit pas.
    const fill = door.kind === "opening" ? theme.field : theme.wall;
    out +=
      `<rect x="${n(door.x)}" y="${n(door.y)}" width="${n(door.w)}" height="${n(door.h)}"` +
      ` fill="${fill}"${spin(door.rot, door.x + door.w / 2, door.y + door.h / 2)} />`;
  }

  for (const measure of level.measures ?? []) {
    out += measureLine(measure, theme, withLabels);
  }

  // Les repères ne sont gravés que si on les demande : le visualiseur pose les
  // siens en vrais boutons par-dessus, et les dessiner ici les doublerait.
  if (options.markers?.length && options.extentCm) {
    for (const marker of options.markers) {
      out += markerBadge(
        marker,
        options.extentCm.width,
        options.extentCm.height,
        theme,
      );
    }
  }

  if (withLabels) {
    for (const room of level.rooms) out += roomLabel(room, theme);

    for (const label of level.labels) out += planLabel(label, theme);
  }

  return out;
}

/**
 * Une cote : le trait, ses deux embouts, et la longueur au-dessus.
 *
 * La longueur se calcule ici et nulle part ailleurs. Elle n'est pas stockée,
 * donc elle ne peut pas mentir le jour où l'on déplace ce qu'elle mesure — et
 * le texte reste droit quelle que soit l'inclinaison du trait, parce qu'une
 * mesure qu'il faut pencher la tête pour lire n'est pas une mesure.
 */
function measureLine(
  measure: PlanMeasure,
  theme: PlanTheme,
  withLabel: boolean,
): string {
  const dx = measure.x2 - measure.x1;
  const dy = measure.y2 - measure.y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return "";

  const width = Math.max(2, length * 0.006);
  const tick = Math.max(12, length * 0.03);
  // La normale au trait, pour poser les embouts en travers et décaler le texte.
  const nx = (-dy / length) * tick;
  const ny = (dx / length) * tick;
  const stroke = ` stroke="${theme.accent}" stroke-width="${n(width)}"`;

  let out =
    `<line x1="${n(measure.x1)}" y1="${n(measure.y1)}"` +
    ` x2="${n(measure.x2)}" y2="${n(measure.y2)}"${stroke} />` +
    `<line x1="${n(measure.x1 - nx / 2)}" y1="${n(measure.y1 - ny / 2)}"` +
    ` x2="${n(measure.x1 + nx / 2)}" y2="${n(measure.y1 + ny / 2)}"${stroke} />` +
    `<line x1="${n(measure.x2 - nx / 2)}" y1="${n(measure.y2 - ny / 2)}"` +
    ` x2="${n(measure.x2 + nx / 2)}" y2="${n(measure.y2 + ny / 2)}"${stroke} />`;

  if (withLabel) {
    const size = Math.max(50, Math.min(120, length / 8));
    out +=
      `<text x="${n(measure.x1 + dx / 2 + nx)}" y="${n(measure.y1 + dy / 2 + ny)}"` +
      ` fill="${theme.accent}" font-family="${MONO_FACE}" font-size="${n(size)}"` +
      ` text-anchor="middle" dominant-baseline="central">${esc(metres(length))}</text>`;
  }

  return out;
}

/**
 * Un niveau, seul, dans un `<svg>` dont le `viewBox` est l'emprise du relevé.
 *
 * C'est la forme que le visualiseur affiche : mise à 100 % de son cadre, elle
 * fait tomber un repère posé à 0,5 / 0,5 exactement au centre du relevé, sans
 * que personne ait à convertir quoi que ce soit.
 */
export function renderLevelSvg(
  plan: DrawnPlacePlan,
  level: PlanLevel,
  options: LevelOptions = {},
): string {
  const theme = options.theme ?? PLAN_THEME;
  const background = options.background
    ? `<rect width="${n(plan.widthCm)}" height="${n(plan.heightCm)}" fill="${theme.field}" />`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` viewBox="0 0 ${n(plan.widthCm)} ${n(plan.heightCm)}"` +
    ` preserveAspectRatio="xMidYMid meet" role="img">` +
    background +
    renderLevelBody(level, options) +
    `</svg>`
  );
}

/* ------------------------------------------------------------------ */
/* La planche                                                          */
/* ------------------------------------------------------------------ */

export type PlateOptions = {
  theme?: PlanTheme;
  /** Largeur de la planche en pixels. La hauteur en découle. */
  width?: number;
  /** Les niveaux gravés, dans cet ordre. Tous, par défaut. */
  levelIds?: string[];
  title: string;
  subtitle?: string;
  /** Les glyphes de la légende. Vide : pas de légende. */
  legend?: { glyph: PlanGlyph; label: string; color?: string }[];
  /** La ligne de mentions, obligatoire sur une planche publiée. */
  credits?: string;
  version?: string;
  accent?: string;
  /**
   * Des `@font-face` à embarquer dans la planche.
   *
   * Indispensable à l'export : un SVG rastérisé passe par un `<img>`, dont le
   * document n'hérite d'aucune police de la page. Sans elles, le PNG sort dans
   * la police de repli du navigateur. Inutile pour l'affichage à l'écran, où
   * la page a déjà chargé Geist.
   */
  fontCss?: string;
};

function glyphPath(
  d: string,
  x: number,
  y: number,
  size: number,
  color: string,
): string {
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${ratio(size / GLYPH_GRID)})"` +
    ` fill="none" stroke="${color}" stroke-width="${GLYPH_STROKE}"` +
    ` stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${d}" /></g>`
  );
}

function glyph(
  name: PlanGlyph,
  x: number,
  y: number,
  size: number,
  color: string,
): string {
  return glyphPath(PLAN_GLYPHS[name], x, y, size, color);
}

/**
 * Un repère, gravé sur la planche.
 *
 * Il n'y en avait aucun : `renderLevelBody` ne mentionnait pas les repères,
 * alors que la légende annonçait une ligne « Repère » dès qu'il y en avait un.
 * La planche promettait un symbole qu'elle ne traçait pas.
 *
 * Les repères sont en fractions de l'emprise, pas en centimètres — c'est ce qui
 * leur permet de survivre à un changement de fond — donc ils se convertissent
 * ici, et nulle part ailleurs.
 */
function markerBadge(
  marker: PlacePlanMarker,
  widthCm: number,
  heightCm: number,
  theme: PlanTheme,
): string {
  // Même ordre que la normalisation — cible, service, symbole — pour qu'un
  // document qui en porterait deux se dessine comme la base le comprend.
  const d = marker.targetSlug
    ? PLAN_GLYPHS.spawn
    : marker.service
      ? PLACE_SERVICE_GLYPHS[marker.service]
      : marker.glyph
        ? PLAN_GLYPHS[marker.glyph]
        : PLAN_GLYPHS.spawn;
  if (!d) return "";

  const box = Math.max(60, widthCm * 0.028);
  const cx = marker.x * widthCm;
  const cy = marker.y * heightCm;
  const pad = box * 0.18;

  return (
    `<rect x="${n(cx - box / 2)}" y="${n(cy - box / 2)}" width="${n(box)}" height="${n(box)}"` +
    ` rx="${n(box * 0.16)}" fill="${theme.field}" fill-opacity="0.9"` +
    ` stroke="${theme.accent}" stroke-width="${n(Math.max(2, box * 0.06))}" />` +
    glyphPath(
      d,
      cx - box / 2 + pad,
      cy - box / 2 + pad,
      box - pad * 2,
      theme.accent,
    )
  );
}

/**
 * La planche complète : en-tête, niveaux côte à côte, légende, échelle,
 * mentions. C'est ce qui part en PNG et ce que la route d'impression rend.
 *
 * La hauteur n'est pas un réglage : elle tombe de la largeur et du niveau le
 * plus haut, parce qu'une planche coupée est le seul défaut qu'on ne rattrape
 * pas après coup.
 */
function plateLayout(plan: DrawnPlacePlan, options: PlateOptions) {
  const width = options.width ?? 1600;
  const pad = Math.round(width * 0.02);

  const levels = options.levelIds?.length
    ? options.levelIds
        .map((id) => plan.levels.find((level) => level.id === id))
        .filter((level): level is PlanLevel => Boolean(level))
    : plan.levels;

  const legend = options.legend ?? [];
  const legendWidth = legend.length ? Math.round(width * 0.15) : 0;
  const headerHeight = Math.round(width * 0.07);
  const footerHeight = Math.round(width * 0.045);

  // Chaque niveau reçoit la même largeur : ce sont les mêmes murs vus d'étages
  // différents, et les mettre à deux échelles rendrait leur comparaison fausse.
  const gutter = Math.round(width * 0.02);
  const bandWidth = width - pad * 2 - legendWidth - (legendWidth ? gutter : 0);
  const cellWidth = Math.max(
    1,
    (bandWidth - gutter * (levels.length - 1)) / Math.max(1, levels.length),
  );
  const cellHeight = (cellWidth * plan.heightCm) / plan.widthCm;
  const titleHeight = Math.round(width * 0.022);
  const height = Math.round(
    headerHeight + cellHeight + titleHeight + footerHeight + pad * 2.5,
  );

  return {
    width,
    height,
    pad,
    levels,
    legend,
    legendWidth,
    headerHeight,
    footerHeight,
    gutter,
    cellWidth,
    titleHeight,
    bodyTop: headerHeight + pad,
    bandLeft: pad + (legendWidth ? legendWidth + gutter : 0),
    /**
     * Combien de pixels de planche vaut un centimètre de relevé. C'est la
     * seule échelle : le dessin et la barre d'échelle la partagent, sans quoi
     * la barre mesurerait autre chose que ce qu'elle surmonte.
     */
    perCm: cellWidth / plan.widthCm,
  };
}

/**
 * Les dimensions d'une planche, sans la dessiner.
 *
 * Elles se calculent ; elles ne se relisent pas dans le SVG produit. L'export
 * les cherchait à l'expression régulière dans l'attribut `height` et retombait
 * sur la **largeur** quand la racine cessait d'y porter un entier — un PNG au
 * mauvais rapport, et pas un mot pour le dire.
 */
export function plateSize(
  plan: DrawnPlacePlan,
  options: PlateOptions,
): { width: number; height: number } {
  const layout = plateLayout(plan, options);
  return { width: layout.width, height: layout.height };
}

/**
 * La légende d'une planche : les seuls symboles qu'elle emploie.
 *
 * Une légende exhaustive dirait d'un relevé sans escalier qu'il en a un. On la
 * déduit donc du dessin, plutôt que de la tenir à la main quelque part.
 */
export function plateLegend(
  plan: DrawnPlacePlan,
  labels: Record<string, string>,
): { glyph: PlanGlyph; label: string; color?: string }[] {
  const used = new Set<PlanGlyph>();

  for (const level of plan.levels) {
    for (const door of level.doors) {
      if (door.kind === "double") used.add("doubleDoor");
      else if (door.kind === "airlock") used.add("airlock");
      else if (door.kind === "single") used.add("door");
    }
    for (const room of level.rooms) {
      if (room.stair === "up") used.add("stairUp");
      if (room.stair === "down") used.add("stairDown");
      if (room.fill === "objective") used.add("objective");
    }
  }
  if (plan.markers.length) used.add("terminal");

  return [...used].map((glyph) => ({
    glyph,
    label: labels[glyph] ?? glyph,
    color: glyph === "objective" ? PLAN_INK_COLORS.amber : undefined,
  }));
}

export function renderPlateSvg(
  plan: DrawnPlacePlan,
  options: PlateOptions,
): string {
  const theme = options.theme ?? PLAN_THEME;
  const accent = options.accent ?? theme.accent;
  const {
    width,
    height,
    pad,
    levels,
    legend,
    headerHeight,
    footerHeight,
    gutter,
    cellWidth,
    titleHeight,
    bodyTop,
    bandLeft,
    perCm,
  } = plateLayout(plan, options);

  let out =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"` +
    ` viewBox="0 0 ${width} ${height}" role="img">` +
    (options.fontCss ? `<style>${options.fontCss}</style>` : "") +
    `<rect width="${width}" height="${height}" fill="${theme.field}" />`;

  // ── En-tête ──
  out +=
    `<text x="${pad}" y="${Math.round(headerHeight * 0.55)}" fill="${theme.fg}"` +
    ` font-family="${DISPLAY_FACE}" font-size="${Math.round(width * 0.026)}"` +
    ` font-weight="700" letter-spacing="${n(width * 0.0008)}">${esc(options.title.toUpperCase())}</text>`;
  if (options.subtitle) {
    out +=
      `<text x="${pad}" y="${Math.round(headerHeight * 0.8)}" fill="${accent}"` +
      ` font-family="${TEXT_FACE}" font-size="${Math.round(width * 0.0085)}"` +
      ` letter-spacing="${n(width * 0.0015)}">${esc(options.subtitle.toUpperCase())}</text>`;
  }
  out += `<rect x="${pad}" y="${headerHeight}" width="${width - pad * 2}" height="1" fill="${accent}" opacity="0.7" />`;

  // ── La légende ──
  if (legend.length) {
    const rowHeight = Math.round(width * 0.022);
    legend.forEach((entry, index) => {
      const y = bodyTop + titleHeight + index * rowHeight;
      const size = Math.round(width * 0.013);
      out += glyph(entry.glyph, pad, y, size, entry.color ?? theme.fg);
      out +=
        `<text x="${pad + size + Math.round(width * 0.006)}" y="${y + size * 0.62}"` +
        ` fill="${theme.muted}" font-family="${DISPLAY_FACE}"` +
        ` font-size="${Math.round(width * 0.0072)}" font-weight="600"` +
        ` letter-spacing="${n(width * 0.0004)}">${esc(entry.label.toUpperCase())}</text>`;
    });
  }

  // ── Les niveaux ──
  levels.forEach((level, index) => {
    const left = bandLeft + index * (cellWidth + gutter);
    out +=
      `<text x="${n(left)}" y="${n(bodyTop + titleHeight * 0.7)}" fill="${theme.fg}"` +
      ` font-family="${DISPLAY_FACE}" font-size="${Math.round(width * 0.014)}"` +
      ` font-weight="700" letter-spacing="${n(width * 0.0012)}">${esc(level.name.toUpperCase())}</text>`;

    out +=
      `<g transform="translate(${n(left)} ${n(bodyTop + titleHeight)}) scale(${ratio(perCm)})">` +
      renderLevelBody(level, {
        theme,
        // Un repère sans niveau vaut pour tous : c'est le cas d'un plan image
        // dont le relevé a repris les repères.
        markers: plan.markers.filter(
          (marker) => !marker.levelId || marker.levelId === level.id,
        ),
        extentCm: { width: plan.widthCm, height: plan.heightCm },
      }) +
      `</g>`;
  });

  // ── Échelle : dix mètres, mesurés sur la planche elle-même ──
  const barWidth = 1000 * perCm;
  const barY = height - footerHeight - pad * 0.5;
  out +=
    `<rect x="${n(bandLeft)}" y="${n(barY)}" width="${n(barWidth / 2)}" height="6"` +
    ` fill="${theme.fg}" opacity="0.85" />` +
    `<rect x="${n(bandLeft)}" y="${n(barY)}" width="${n(barWidth)}" height="6"` +
    ` fill="none" stroke="${theme.fg}" stroke-width="1" opacity="0.85" />` +
    `<text x="${n(bandLeft + barWidth + 8)}" y="${n(barY + 7)}" fill="${theme.muted}"` +
    ` font-family="${MONO_FACE}" font-size="${Math.round(width * 0.0062)}">10 m</text>`;

  // ── Mentions ──
  if (options.credits) {
    out +=
      `<text x="${pad}" y="${height - Math.round(pad * 0.8)}" fill="${theme.muted}"` +
      ` font-family="${TEXT_FACE}" font-size="${Math.round(width * 0.006)}"` +
      ` opacity="0.8">${esc(options.credits)}</text>`;
  }
  if (options.version) {
    out +=
      `<text x="${width - pad}" y="${height - Math.round(pad * 0.8)}" fill="${theme.muted}"` +
      ` font-family="${MONO_FACE}" font-size="${Math.round(width * 0.006)}"` +
      ` text-anchor="end" opacity="0.8">${esc(options.version)}</text>`;
  }

  return out + `</svg>`;
}

/**
 * Les glyphes que la légende d'une planche peut nommer.
 *
 * Les libellés viennent de l'interface, donc de `next-intl`, et le moteur est
 * pur : chaque appelant traduit de son côté et passe la table. Ce type existe
 * pour qu'ils n'en oublient pas un.
 */
export type PlateGlyphLabels = Record<
  | "door"
  | "doubleDoor"
  | "airlock"
  | "stairUp"
  | "stairDown"
  | "objective"
  | "terminal",
  string
>;

/**
 * L'habillage complet d'une planche : titre, sous-titre, légende, mentions.
 *
 * Trois surfaces la composent — l'aperçu produit à l'enregistrement, la page de
 * planche qu'on partage, et le téléchargement depuis la page d'un lieu — et
 * elles le faisaient chacune à sa façon. La page de planche, notamment, passait
 * une légende vide : la planche partagée n'expliquait aucun de ses symboles,
 * alors que le PNG du même relevé les listait tous.
 */
export function plateOptions(
  plan: DrawnPlacePlan,
  {
    placeName,
    glyphs,
    credits,
  }: { placeName: string; glyphs: PlateGlyphLabels; credits: string },
): Omit<PlateOptions, "fontCss"> {
  return {
    title: placeName,
    subtitle: plan.name,
    legend: plateLegend(plan, glyphs),
    credits,
  };
}
