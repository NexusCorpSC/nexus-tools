/**
 * Pose sur les planètes et les lunes du catalogue ce dont le NPS a besoin pour
 * s'y repérer : centre, rayon, vitesse et calage de rotation.
 *
 *   npm run import:celestial-bodies -- [--dry-run]
 *
 * Les valeurs viennent de `scripts/game-data/celestial-bodies.json`, tirées de
 * la base de l'outil communautaire de Valalol (licence MIT). Elles datent de
 * fin 2023 et ne couvrent que Stanton : un patch qui déplace un corps ou
 * recale sa rotation se corrige dans ce fichier, puis on relance.
 *
 * Un corps se retrouve par son nom, parmi les planètes et les lunes de son
 * système. Seul `celestial` est écrit : ni le nom, ni l'arbre, ni les
 * positions relevées par les joueurs ne sont touchés. Idempotent.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import db from "@/lib/db";
import type { CelestialBody, Place } from "@/types/places";

type Options = { dryRun: boolean };

type BodyFile = {
  system: string;
  bodies: (CelestialBody & { name: string })[];
};

function parseArgs(argv: string[]): Options {
  const options: Options = { dryRun: false };
  for (const arg of argv) {
    if (arg === "--dry-run") options.dryRun = true;
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(1);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const file = JSON.parse(
    readFileSync(
      join(process.cwd(), "scripts/game-data/celestial-bodies.json"),
      "utf8",
    ),
  ) as BodyFile;

  const places = db.db().collection<Place>("gameLocations");
  const candidates = await places
    .find(
      { type: { $in: ["planet", "moon"] }, systemSlug: file.system },
      { projection: { _id: 0, slug: 1, name: 1 } },
    )
    .toArray();

  const byName = new Map<string, string[]>();
  for (const place of candidates) {
    const key = place.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), place.slug]);
  }

  let written = 0;
  const missing: string[] = [];
  const ambiguous: string[] = [];

  for (const { name, ...celestial } of file.bodies) {
    const slugs = byName.get(name.toLowerCase()) ?? [];
    if (slugs.length === 0) {
      missing.push(name);
      continue;
    }
    if (slugs.length > 1) {
      ambiguous.push(name);
      continue;
    }

    written++;
    console.log(`${name} → ${slugs[0]}`);
    if (!options.dryRun) {
      await places.updateOne({ slug: slugs[0] }, { $set: { celestial } });
    }
  }

  console.log(
    options.dryRun
      ? `\nRien écrit : --dry-run. ${written} corps à poser.`
      : `\nTerminé : ${written} corps posé(s).`,
  );
  if (missing.length > 0) {
    console.log(`Absents du catalogue : ${missing.join(", ")}`);
  }
  if (ambiguous.length > 0) {
    console.log(
      `Plusieurs lieux du même nom, laissés : ${ambiguous.join(", ")}`,
    );
  }

  await db.close();
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
