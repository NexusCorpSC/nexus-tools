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
  PLAN_GLYPHS,
  type PlanGlyph,
} from "@/lib/plan-symbols";
import type {
  DrawnPlacePlan,
  PlanLevel,
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
};

/**
 * Le hachurage d'un escalier : cinq marches dans la moitié basse de la pièce,
 * sous l'étiquette plutôt qu'à travers.
 */
function stairs(room: PlanRoom, theme: PlanTheme): string {
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
  return out;
}

function roomLabel(room: PlanRoom, theme: PlanTheme): string {
  if (!room.label || !room.name) return "";

  const size = Math.max(45, Math.min(130, Math.min(room.w, room.h) / 5));
  const cx = room.x + room.w / 2;
  // Un escalier porte son hachurage en bas : son nom monte pour lui laisser la place.
  const cy = room.stair ? room.y + room.h * 0.22 : room.y + room.h / 2;
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
    `${spin(room.rot, cx, room.y + room.h / 2)}>${tspans}</text>`
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

    out +=
      `<g${spin(room.rot, cx, cy)}>` +
      `<rect x="${n(room.x)}" y="${n(room.y)}" width="${n(room.w)}" height="${n(room.h)}"` +
      ` fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${n(stroke)}" />` +
      (room.stair ? stairs(room, theme) : "") +
      `</g>`;
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

  if (withLabels) {
    for (const room of level.rooms) out += roomLabel(room, theme);

    for (const label of level.labels) {
      out +=
        `<text x="${n(label.x)}" y="${n(label.y)}" fill="${theme.muted}"` +
        ` font-family="${TEXT_FACE}" font-size="90" text-anchor="middle"` +
        ` dominant-baseline="central"${spin(label.rot, label.x, label.y)}>` +
        `${esc(label.text)}</text>`;
    }
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

function glyph(
  name: PlanGlyph,
  x: number,
  y: number,
  size: number,
  color: string,
): string {
  const ratio = size / GLYPH_GRID;
  return (
    `<g transform="translate(${n(x)} ${n(y)}) scale(${n(ratio)})"` +
    ` fill="none" stroke="${color}" stroke-width="${GLYPH_STROKE}"` +
    ` stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${PLAN_GLYPHS[name]}" /></g>`
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
export function renderPlateSvg(
  plan: DrawnPlacePlan,
  options: PlateOptions,
): string {
  const theme = options.theme ?? PLAN_THEME;
  const accent = options.accent ?? theme.accent;
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
  const bodyHeight = cellHeight + titleHeight;
  const height = Math.round(
    headerHeight + bodyHeight + footerHeight + pad * 2.5,
  );

  const bodyTop = headerHeight + pad;
  const bandLeft = pad + (legendWidth ? legendWidth + gutter : 0);

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

    const scale = cellWidth / plan.widthCm;
    out +=
      `<g transform="translate(${n(left)} ${n(bodyTop + titleHeight)}) scale(${n(scale)})">` +
      renderLevelBody(level, { theme }) +
      `</g>`;
  });

  // ── Échelle : dix mètres, mesurés sur la planche elle-même ──
  const perCm = cellWidth / plan.widthCm;
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
