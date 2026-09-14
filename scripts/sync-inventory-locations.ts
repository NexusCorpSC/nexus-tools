/**
 * Propose les lieux du catalogue dans le champ « lieu de stockage » de
 * l'inventaire.
 *
 *   npm run sync:inventory-locations -- [--dry-run]
 *
 * L'inventaire range ses objets par `locationId`, qui est l'identifiant d'une
 * ligne de la collection `locations`. Plutôt que de migrer ce champ — et de
 * toucher aux données que les joueurs ont déjà saisies — on projette le
 * catalogue dans `locations` sous forme de lignes partagées : sans `userId`,
 * donc déjà couvertes par le filtre que la route applique, et portant un
 * `placeSlug` qui les relie à leur fiche.
 *
 * Deux passes, toutes deux idempotentes :
 *
 *   1. Chaque lieu du catalogue a sa ligne miroir, créée ou rafraîchie.
 *   2. Chaque ligne partagée déjà présente dont le nom correspond, sans
 *      ambiguïté, à un lieu du catalogue est reliée à lui.
 *
 * Les lignes qui portent un `userId` ne sont jamais touchées : « Hangar de
 * Karim » n'est pas un lieu du catalogue. Elles sont seulement comptées.
 *
 * Aucun document `inventoryItems` n'est modifié, et les deux `$lookup` qui
 * joignent `locations` restent inchangés.
 */

import db from "@/lib/db";
import type { Place, PlaceType } from "@/types/places";

type Options = { dryRun: boolean };

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

/** Un système n'est pas un endroit où l'on pose des caisses. */
const NOT_STORAGE: PlaceType[] = ["star"];

type Mirror = {
  name: string;
  slug: string;
  system?: string;
  placeSlug: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const database = db.db();

  const places = (await database
    .collection<Place>("gameLocations")
    .find(
      { type: { $nin: NOT_STORAGE } },
      { projection: { _id: 0, slug: 1, name: 1, systemName: 1 } },
    )
    .toArray()) as Pick<Place, "slug" | "name" | "systemName">[];

  const mirrors: Mirror[] = places.map((place) => ({
    name: place.name,
    slug: place.slug,
    system: place.systemName,
    placeSlug: place.slug,
  }));

  console.log(`${mirrors.length} lieu(x) du catalogue à refléter`);

  const locations = database.collection("locations");
  let created = 0;
  let refreshed = 0;

  if (!options.dryRun) {
    const result = await locations.bulkWrite(
      mirrors.map((mirror) => ({
        updateOne: {
          filter: { placeSlug: mirror.placeSlug },
          update: { $set: mirror },
          upsert: true,
        },
      })),
      { ordered: false },
    );
    created = result.upsertedCount;
    refreshed = result.modifiedCount;
  }

  // ── Rattacher les lignes partagées déjà présentes ──
  const orphans = await locations
    .find({ userId: { $exists: false }, placeSlug: { $exists: false } })
    .toArray();

  const byName = new Map<string, Mirror[]>();
  for (const mirror of mirrors) {
    const key = mirror.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), mirror]);
  }

  let linked = 0;
  const ambiguous: string[] = [];

  for (const orphan of orphans) {
    const name = String(orphan.name ?? "").trim();
    const matches = byName.get(name.toLowerCase()) ?? [];
    if (matches.length === 0) continue;
    // Deux lieux du même nom : personne ne peut trancher à la place d'un
    // humain, et se tromper collerait les caisses au mauvais endroit.
    if (matches.length > 1) {
      ambiguous.push(name);
      continue;
    }

    linked++;
    if (!options.dryRun) {
      await locations.updateOne({ _id: orphan._id }, { $set: matches[0] });
    }
  }

  const personal = await locations.countDocuments({
    userId: { $exists: true },
  });

  console.log(
    options.dryRun
      ? `\nRien écrit : --dry-run. ${mirrors.length} miroir(s) à poser, ${linked} ligne(s) partagée(s) à relier.`
      : `\nTerminé : ${created} miroir(s) créé(s), ${refreshed} rafraîchi(s), ${linked} ligne(s) partagée(s) reliée(s).`,
  );
  if (ambiguous.length > 0) {
    console.log(
      `${ambiguous.length} nom(s) ambigu(s), laissés tels quels : ${[...new Set(ambiguous)].join(", ")}`,
    );
  }
  console.log(
    `${personal} lieu(x) personnel(s) : jamais touchés, ils n'appartiennent qu'à leur propriétaire.`,
  );

  await db.close();
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
