/**
 * Pose sur les planètes et les lunes du catalogue ce dont le NPS a besoin pour
 * s'y repérer : centre, rayon, vitesse et calage de rotation.
 *
 *   npm run import:celestial-bodies -- [--dry-run] [--file <oc.json>]
 *
 * Les valeurs viennent de starmap.space (Graupunkt, base communautaire tenue à
 * jour patch après patch) : `api/v3/oc`, les « object containers » du jeu,
 * pour tous les systèmes qu'elle décrit (Stanton, Pyro, Nyx…). `--file` lit
 * une copie de cette réponse plutôt que l'API.
 *
 * Un corps se retrouve par son nom, parmi les planètes et les lunes de son
 * système : « Pyro5 » côté starmap est « Pyro V » au catalogue, les chiffres
 * romains se lisent comme les autres. Un corps sans vitesse de rotation ou
 * sans marqueurs orbitaux est laissé : ce sont des valeurs provisoires (les
 * planètes de Nyx en ont), et une position relevée avec une rotation fausse
 * se perdrait dès qu'on la corrige.
 *
 * Seul `celestial` est écrit : ni le nom, ni l'arbre, ni les positions
 * relevées par les joueurs ne sont touchés. Idempotent ; à relancer quand un
 * patch déplace un corps ou recale sa rotation.
 */

import { readFileSync } from "node:fs";
import db from "@/lib/db";
import type { CelestialBody, Place } from "@/types/places";

const OC_URL = "https://starmap.space/api/v3/oc/index.php";

/** Le rayon de la zone où le repère du corps tourne avec lui. */
const ZONE_PER_ORBITAL_MARKER = 3;

type Options = { dryRun: boolean; file?: string };

/** Une entrée de `api/v3/oc`, réduite à ce qui sert ici. */
type Container = {
  System: string;
  ObjectContainer: string;
  Type: string;
  XCoord: number | string;
  YCoord: number | string;
  ZCoord: number | string;
  RotationSpeedX: number | string;
  RotationAdjustmentX: number | string;
  BodyRadius: number | string;
  OrbitalMarkerRadius: number | string;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--file" && argv[index + 1]) options.file = argv[++index];
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(1);
    }
  }
  return options;
}

async function loadContainers(options: Options): Promise<Container[]> {
  if (options.file) {
    return JSON.parse(readFileSync(options.file, "utf8")) as Container[];
  }
  const response = await fetch(OC_URL, {
    headers: { "User-Agent": "nexus-tools (import:celestial-bodies)" },
  });
  if (!response.ok) {
    throw new Error(`${OC_URL} : HTTP ${response.status}`);
  }
  return (await response.json()) as Container[];
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
function bodyKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => fromRoman(word)?.toString() ?? word)
    .join("");
}

function toCelestial(container: Container): CelestialBody | null {
  const number = (value: number | string) => Number(value);
  const celestial = {
    x: number(container.XCoord),
    y: number(container.YCoord),
    z: number(container.ZCoord),
    radius: number(container.BodyRadius),
    zoneRadius: number(container.OrbitalMarkerRadius) * ZONE_PER_ORBITAL_MARKER,
    rotationHours: number(container.RotationSpeedX),
    rotationAdjust: number(container.RotationAdjustmentX),
  };
  const finite = Object.values(celestial).every(Number.isFinite);
  const known =
    celestial.radius > 0 &&
    celestial.zoneRadius > 0 &&
    celestial.rotationHours > 0;
  return finite && known ? celestial : null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const containers = (await loadContainers(options)).filter(
    (container) => container.Type === "Planet",
  );

  const places = db.db().collection<Place>("gameLocations");
  const candidates = await places
    .find(
      { type: { $in: ["planet", "moon"] } },
      { projection: { _id: 0, slug: 1, name: 1, systemName: 1 } },
    )
    .toArray();

  // Système, puis nom : deux systèmes peuvent avoir des corps homonymes.
  const bySystem = new Map<string, Map<string, string[]>>();
  for (const place of candidates) {
    const system = bodyKey(place.systemName ?? "");
    const names = bySystem.get(system) ?? new Map<string, string[]>();
    const key = bodyKey(place.name);
    names.set(key, [...(names.get(key) ?? []), place.slug]);
    bySystem.set(system, names);
  }

  let written = 0;
  const unknownSystems = new Set<string>();
  const missing: string[] = [];
  const ambiguous: string[] = [];
  const provisional: string[] = [];

  for (const container of containers) {
    const label = `${container.ObjectContainer} (${container.System})`;
    const names = bySystem.get(bodyKey(container.System));
    if (!names) {
      unknownSystems.add(container.System);
      continue;
    }
    const slugs = names.get(bodyKey(container.ObjectContainer)) ?? [];
    if (slugs.length === 0) {
      missing.push(label);
      continue;
    }
    if (slugs.length > 1) {
      ambiguous.push(label);
      continue;
    }
    const celestial = toCelestial(container);
    if (!celestial) {
      provisional.push(label);
      continue;
    }

    written++;
    console.log(`${label} → ${slugs[0]}`);
    if (!options.dryRun) {
      await places.updateOne({ slug: slugs[0] }, { $set: { celestial } });
    }
  }

  console.log(
    options.dryRun
      ? `\nRien écrit : --dry-run. ${written} corps à poser.`
      : `\nTerminé : ${written} corps posé(s).`,
  );
  if (provisional.length > 0) {
    console.log(
      `Rotation ou marqueurs inconnus, laissés : ${provisional.join(", ")}`,
    );
  }
  if (missing.length > 0) {
    console.log(`Absents du catalogue : ${missing.join(", ")}`);
  }
  if (ambiguous.length > 0) {
    console.log(
      `Plusieurs lieux du même nom, laissés : ${ambiguous.join(", ")}`,
    );
  }
  if (unknownSystems.size > 0) {
    console.log(
      `Systèmes absents du catalogue : ${[...unknownSystems].join(", ")}`,
    );
  }

  await db.close();
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
