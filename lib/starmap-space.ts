/**
 * Ce que les imports lisent chez starmap.space (Graupunkt, base communautaire
 * tenue à jour patch après patch) : `api/v3/oc`, les « object containers » du
 * jeu (étoiles, planètes, lunes, points de Lagrange, points de saut), et
 * `api/v3/pois`, les lieux posés dessus.
 */

import { readFileSync } from "node:fs";

export const OC_URL = "https://starmap.space/api/v3/oc/index.php";
export const POIS_URL = "https://starmap.space/api/v3/pois/index.php";

/** Une entrée de `api/v3/oc`, réduite à ce qui sert ici. */
export type Container = {
  System: string;
  ObjectContainer: string;
  InternalName?: string;
  Type: string;
  XCoord: number | string;
  YCoord: number | string;
  ZCoord: number | string;
  RotationSpeedX: number | string;
  RotationAdjustmentX: number | string;
  BodyRadius: number | string | null;
  OrbitalMarkerRadius: number | string | null;
};

/**
 * Une entrée de `api/v3/pois`. `Planet` nomme le conteneur qui la porte : un
 * corps, un point de Lagrange, un point de saut, ou « Space ». Sur un corps,
 * les coordonnées sont en kilomètres dans son repère ; dans l'espace, en
 * mètres dans celui du système.
 */
export type Poi = {
  System: string;
  Planet: string;
  PoiName: string;
  Type: string;
  XCoord: number | string | null;
  YCoord: number | string | null;
  ZCoord: number | string | null;
};

/** Lit `url`, ou la copie `file` de sa réponse quand elle est donnée. */
export async function loadStarmapSpace<T>(
  url: string,
  file?: string,
): Promise<T[]> {
  if (file) return JSON.parse(readFileSync(file, "utf8")) as T[];
  const response = await fetch(url, {
    headers: { "User-Agent": "nexus-tools (starmap.space import)" },
  });
  if (!response.ok) throw new Error(`${url} : HTTP ${response.status}`);
  return (await response.json()) as T[];
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10 };

function fromRoman(word: string): number | null {
  if (!/^[ivx]+$/.test(word)) return null;
  let total = 0;
  for (let index = 0; index < word.length; index++) {
    const value = ROMAN[word[index]];
    const next = ROMAN[word[index + 1]] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

/** « Pyro V », « pyro 5 » et « Pyro5 » donnent tous « pyro5 ». */
export function bodyKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => fromRoman(word)?.toString() ?? word)
    .join("");
}

/** Un nombre fini, ou `null` : la source mêle chaînes, nombres et `null`. */
export function coordinate(
  value: number | string | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
