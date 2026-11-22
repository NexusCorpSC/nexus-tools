/**
 * Le scanner de signature radar : ce que vaut le nombre qu'affiche le scan du
 * jeu (le « RS » au-dessus d'un rocher, d'un astéroïde, d'une épave).
 *
 * Chaque gisement a une signature de base ; une grappe de N rochers du même
 * type affiche N fois cette base. Retrouver ce qu'on scanne revient donc à
 * chercher les signatures dont la valeur lue est un multiple.
 *
 * Ce fichier est partagé avec l'app de bureau (`src/lib/radar.ts` de
 * nexus-app), qui en garde une copie : le même nombre doit donner la même
 * identification des deux côtés.
 */

export const RADAR_CATEGORIES = [
  "ship",
  "asteroid",
  "salvage",
  "roc",
  "fps",
  "other",
] as const;

export type RadarCategory = (typeof RADAR_CATEGORIES)[number];

export interface RadarSignature {
  id: string;
  name: string;
  category: RadarCategory;
  /** La signature d'un seul élément, telle que le scan l'affiche. */
  value: number;
}

export const MAX_RADAR_NAME_LENGTH = 80;
export const MAX_RADAR_VALUE = 100_000;

/**
 * Au-delà, une grappe n'est plus crédible : les tables de la communauté
 * s'arrêtent à 10 ou 12 rochers, et les épaves vont un peu plus loin.
 */
export const MAX_RADAR_CLUSTER = 20;

/** Le plus grand nombre que le scanner accepte de lire ou de saisir. */
export const MAX_RADAR_READING = MAX_RADAR_VALUE * MAX_RADAR_CLUSTER;

/**
 * Sans correspondance exacte, les signatures à moins de cet écart relatif
 * sont proposées comme approchantes : un chiffre mal lu, une valeur qui a
 * bougé avec un patch.
 */
export const RADAR_APPROXIMATE_RATIO = 0.01;

/**
 * Les valeurs connues au patch 4.10.3 (tables de la communauté : Prospector
 * Index, données UEX, et SCMINER, concordantes). Les administrateurs les
 * corrigent depuis /admin/radar-signatures quand un patch les change ; ce
 * sont celles qui servent tant que rien n'est enregistré.
 */
export const DEFAULT_RADAR_SIGNATURES: RadarSignature[] = [
  ...(
    [
      ["Quantainium", 3170],
      ["Stileron", 3185],
      ["Savrilium", 3200],
      ["Ouratite", 3370],
      ["Riccite", 3385],
      ["Lindinium", 3400],
      ["Beryl", 3540],
      ["Taranite", 3555],
      ["Borase", 3570],
      ["Gold", 3585],
      ["Bexalite", 3600],
      ["Laranite", 3825],
      ["Aslarite", 3840],
      ["Titanium", 3855],
      ["Tungsten", 3870],
      ["Agricium", 3885],
      ["Torite", 3900],
      ["Hephaestanite", 4180],
      ["Tin", 4195],
      ["Quartz", 4210],
      ["Corundum", 4225],
      ["Copper", 4240],
      ["Silicon", 4255],
      ["Iron", 4270],
      ["Aluminium", 4285],
      ["Ice", 4300],
    ] as const
  ).map(([name, value]) => ({
    id: toRadarSignatureId(name),
    name,
    category: "ship" as const,
    value,
  })),
  ...(
    [
      ["I-type asteroid", 4000],
      ["C-type asteroid", 4700],
      ["S-type asteroid", 4720],
      ["P-type asteroid", 4750],
      ["M-type asteroid", 4850],
      ["Q-type asteroid", 4870],
      ["E-type asteroid", 4900],
    ] as const
  ).map(([name, value]) => ({
    id: toRadarSignatureId(name),
    name,
    category: "asteroid" as const,
    value,
  })),
  {
    id: "salvage-panels",
    name: "Salvage panels",
    category: "salvage",
    value: 2000,
  },
  {
    id: "roc-deposit",
    name: "ROC deposit",
    category: "roc",
    value: 4000,
  },
  {
    id: "fps-deposit",
    name: "FPS deposit",
    category: "fps",
    value: 3000,
  },
];

export function toRadarSignatureId(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, MAX_RADAR_NAME_LENGTH)
      .replace(/^-+|-+$/g, "") || "signature"
  );
}

export function isRadarCategory(value: unknown): value is RadarCategory {
  return (
    typeof value === "string" &&
    (RADAR_CATEGORIES as readonly string[]).includes(value)
  );
}

export interface RadarMatch {
  signature: RadarSignature;
  /** Combien d'éléments de ce type font la valeur lue. */
  count: number;
  /** Vrai quand `count` fois la base donne exactement la valeur lue. */
  exact: boolean;
  /** La valeur lue moins `count` fois la base. */
  difference: number;
}

export interface RadarIdentification {
  value: number;
  /** Les correspondances exactes, les plus probables d'abord. */
  matches: RadarMatch[];
  /** Sans correspondance exacte : les signatures qui s'en approchent. */
  approximate: RadarMatch[];
}

const CATEGORY_RANK = new Map(
  RADAR_CATEGORIES.map((category, index) => [category, index]),
);

function byLikelihood(a: RadarMatch, b: RadarMatch): number {
  return (
    Math.abs(a.difference) - Math.abs(b.difference) ||
    // Moins d'éléments pour la même valeur : l'explication la plus simple.
    a.count - b.count ||
    (CATEGORY_RANK.get(a.signature.category) ?? 0) -
      (CATEGORY_RANK.get(b.signature.category) ?? 0) ||
    a.signature.value - b.signature.value ||
    a.signature.name.localeCompare(b.signature.name)
  );
}

/**
 * Ce que peut être la valeur lue : les signatures dont elle est un multiple
 * (de 1 à {@link MAX_RADAR_CLUSTER} éléments), la grappe la plus petite
 * d'abord ; et, faute de multiple exact, les plus proches à
 * {@link RADAR_APPROXIMATE_RATIO} près.
 */
export function identifyRadarSignature(
  value: number,
  signatures: readonly RadarSignature[],
  limit = 6,
): RadarIdentification {
  const reading = Math.round(value);
  const exact: RadarMatch[] = [];
  const near: RadarMatch[] = [];

  if (!Number.isFinite(reading) || reading <= 0) {
    return { value: reading, matches: [], approximate: [] };
  }

  for (const signature of signatures) {
    if (!(signature.value > 0)) continue;
    const count = Math.max(1, Math.round(reading / signature.value));
    if (count > MAX_RADAR_CLUSTER) continue;
    const difference = reading - count * signature.value;
    const match = { signature, count, exact: difference === 0, difference };
    if (match.exact) {
      exact.push(match);
    } else if (Math.abs(difference) <= reading * RADAR_APPROXIMATE_RATIO) {
      near.push(match);
    }
  }

  exact.sort(byLikelihood);
  near.sort(byLikelihood);

  return {
    value: reading,
    matches: exact.slice(0, limit),
    approximate: exact.length > 0 ? [] : near.slice(0, limit),
  };
}
