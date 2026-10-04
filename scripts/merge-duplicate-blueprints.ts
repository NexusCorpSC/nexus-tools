/**
 * Fusionne les blueprints en double : une fiche sans GUID, créée avant
 * l'import du wiki sans figurer dans l'ancien export (`assets/blueprints.json`),
 * et la fiche que l'import a créée pour le même blueprint à côté d'elle.
 *
 *   npm run merge:blueprints              # le rapport, sans rien écrire
 *   npm run merge:blueprints -- --apply   # fusionner
 *
 * La fiche gardée est l'ancienne : c'est elle que les joueurs possédaient et
 * que les liens partagés désignent. Elle reçoit de la fiche importée ce que
 * le jeu décide (GUID, nom en jeu, catégorie, recette, temps, source) et
 * garde ce qu'un administrateur a saisi (nom, description, slug, image,
 * statistiques, obtention). Puis tout ce qui pointait vers la fiche importée
 * pointe vers elle :
 *   - les blueprints possédés (`user-blueprints`), sans doublon si le joueur
 *     possédait déjà les deux ;
 *   - les missions qui la donnent (`missions.blueprints`) ;
 *   - les objets du catalogue liés par slug (`gameItems.blueprintSlugs`) ;
 * et son slug redirige vers la fiche gardée (`previousSlugs`). La fiche
 * importée est enfin supprimée.
 *
 * Une paire n'est formée que si elle est sûre : même nom, et parmi des
 * homonymes, même recette. Le reste est listé et laissé tel quel.
 *
 * Interrompu en cours de route, le script se relance : la fiche importée
 * porte alors `mergedInto`, et la fusion reprend là où elle s'est arrêtée.
 *
 * Ensuite, `npm run import:game-data -- all` régénère les textes
 * d'obtention.
 */

import type { Collection } from "mongodb";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import {
  autoDescription,
  groupByName,
  type BlueprintDoc,
} from "./game-data/plan";
import { recipeFingerprint } from "./game-data/source";

type Doc = BlueprintDoc & { mergedGameId?: string };

type Pair = { kept: Doc; merged: Doc };

/** Les champs que le jeu décide, pris à la fiche importée. */
const GAME_FIELDS = [
  "gameName",
  "gameTag",
  "productEntityClass",
  "category",
  "craftingTime",
  "recipe",
  "source",
  "removedInVersion",
] as const;

function findPairs(docs: Doc[]) {
  const pairs: Pair[] = [];
  const skipped: string[] = [];

  // Les fusions interrompues, à terminer.
  const byId = new Map(docs.map((doc) => [doc._id.toHexString(), doc]));
  for (const merged of docs) {
    if (!merged.mergedInto) continue;
    const kept = byId.get(merged.mergedInto.toHexString());
    if (kept) pairs.push({ kept, merged });
    else skipped.push(`${merged.name} : fiche cible introuvable`);
  }
  const busy = new Set(pairs.flatMap((pair) => [pair.kept, pair.merged]));

  const imported = new Map<string, Doc[]>();
  for (const doc of docs) {
    if (!doc.gameId || !doc.source || busy.has(doc)) continue;
    for (const name of new Set([doc.name, doc.gameName ?? doc.name])) {
      imported.set(name, [...(imported.get(name) ?? []), doc]);
    }
  }
  const orphans = docs.filter(
    (doc) => !doc.gameId && !doc.mergedInto && !busy.has(doc),
  );
  const orphansByName = groupByName(orphans);

  const taken = new Set<Doc>();
  for (const kept of orphans) {
    // Seule une fiche importée après elle la double : une plus ancienne a été
    // rattachée par l'ancien export, et c'est la fiche sans GUID qui pose
    // question.
    const created = kept._id.getTimestamp().getTime();
    const named = imported.get(kept.name) ?? [];
    let candidates = named.filter(
      (doc) => !taken.has(doc) && doc._id.getTimestamp().getTime() > created,
    );
    if (!candidates.length) {
      if (named.length)
        skipped.push(
          `${kept.name} (${kept.slug}) : la fiche importée du même nom est plus ancienne`,
        );
      continue;
    }
    // Dès que le nom désigne plusieurs blueprints du jeu (ou plusieurs
    // fiches sans GUID), seule la recette dit lequel est le bon.
    if (named.length > 1 || orphansByName.get(kept.name)!.length > 1) {
      const fingerprint = recipeFingerprint(kept.recipe);
      candidates = candidates.filter(
        (doc) => recipeFingerprint(doc.recipe) === fingerprint,
      );
    }
    if (candidates.length !== 1) {
      skipped.push(
        `${kept.name} (${kept.slug}) : ${candidates.length ? "plusieurs fiches importées à la même recette" : "homonymes, aucune fiche importée à la même recette"}`,
      );
      continue;
    }
    taken.add(candidates[0]);
    pairs.push({ kept, merged: candidates[0] });
  }
  return { pairs, skipped };
}

/**
 * Ce qu'un administrateur a pu saisir sur la fiche importée : repris quand
 * la fiche gardée n'a rien à cet endroit (`taken`), perdu sinon (`lost`, pour
 * le rapport).
 */
function adminFields({ kept, merged }: Pair) {
  const taken: Record<string, unknown> = {};
  const lost: string[] = [];
  const isEmpty = (value: unknown) =>
    value === undefined ||
    value === null ||
    value === "" ||
    value === 0 ||
    (typeof value === "object" && !Object.keys(value).length);
  const isDefault = {
    description: (doc: Doc) =>
      isEmpty(doc.description) ||
      doc.description === autoDescription(doc.gameName ?? doc.name),
    statistics: (doc: Doc) => isEmpty(doc.statistics),
    tier: (doc: Doc) => isEmpty(doc.tier),
    imageUrl: (doc: Doc) => isEmpty(doc.imageUrl),
    obtention: (doc: Doc) =>
      isEmpty(doc.obtention) || doc.obtention === doc.generatedObtention,
  };
  for (const [field, isUnset] of Object.entries(isDefault)) {
    const key = field as keyof typeof isDefault;
    if (isUnset(merged)) continue;
    if (isUnset(kept)) taken[key] = merged[key];
    else if (JSON.stringify(kept[key]) !== JSON.stringify(merged[key]))
      lost.push(key);
  }
  return { taken, lost };
}

/** Le `$set` qui fait de la fiche gardée celle du blueprint du jeu. */
function keptFields(pair: Pair) {
  const { kept, merged } = pair;
  const set: Record<string, unknown> = {
    gameId: merged.gameId ?? merged.mergedGameId,
  };
  const unset: Record<string, ""> = {};
  for (const field of GAME_FIELDS) {
    if (merged[field] !== undefined) set[field] = merged[field];
    else if (field === "removedInVersion" && kept[field] !== undefined)
      unset[field] = "";
  }
  if (!kept.subcategory && merged.subcategory)
    set.subcategory = merged.subcategory;
  Object.assign(set, adminFields(pair).taken);
  set.previousSlugs = [
    ...new Set([
      ...(kept.previousSlugs ?? []),
      ...(merged.previousSlugs ?? []),
      merged.slug,
    ]),
  ].filter((slug) => slug && slug !== kept.slug);
  return Object.keys(unset).length
    ? { $set: set, $unset: unset }
    : { $set: set };
}

async function merge(
  pair: Pair,
  collections: {
    blueprints: Collection<Doc>;
    owners: Collection;
    missions: Collection;
    items: Collection;
  },
) {
  const { kept, merged } = pair;
  const { blueprints, owners, missions, items } = collections;

  // 1. Libérer le GUID (index unique) en marquant la fusion en cours.
  if (!merged.mergedInto) {
    await blueprints.updateOne(
      { _id: merged._id },
      {
        $set: { mergedInto: kept._id, mergedGameId: merged.gameId },
        $unset: { gameId: "" },
      },
    );
  }

  // 2. La fiche gardée devient celle du blueprint du jeu.
  await blueprints.updateOne({ _id: kept._id }, keptFields(pair));

  // 3. Ce qui pointait vers la fiche importée.
  const from = merged._id.toHexString();
  const to = kept._id.toHexString();
  const owned = await owners.find({ blueprintId: from }).toArray();
  const already = new Set(
    (
      await owners
        .find({
          blueprintId: to,
          userId: { $in: owned.map((entry) => entry.userId) },
        })
        .toArray()
    ).map((entry) => entry.userId),
  );
  // Les joueurs qui avaient les deux fiches gardent la leur.
  await owners.deleteMany({
    blueprintId: from,
    userId: { $in: [...already] },
  });
  await owners.updateMany({ blueprintId: from }, { $set: { blueprintId: to } });

  for (const mission of await missions
    .find({ blueprints: merged._id })
    .toArray()) {
    const ids: ObjectId[] = [];
    for (const id of (mission.blueprints as ObjectId[]).map((id) =>
      id.equals(merged._id) ? kept._id : id,
    )) {
      if (!ids.some((other) => other.equals(id))) ids.push(id);
    }
    await missions.updateOne(
      { _id: mission._id },
      { $set: { blueprints: ids } },
    );
  }

  for (const item of await items
    .find({ blueprintSlugs: merged.slug })
    .toArray()) {
    const slugs = [
      ...new Set(
        (item.blueprintSlugs as string[]).map((slug) =>
          slug === merged.slug ? kept.slug : slug,
        ),
      ),
    ];
    await items.updateOne(
      { _id: item._id },
      { $set: { blueprintSlugs: slugs } },
    );
  }

  // 4. La fiche importée n'a plus de raison d'être.
  await blueprints.deleteOne({ _id: merged._id, mergedInto: kept._id });

  return { owned: owned.length, duplicates: already.size };
}

async function main() {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== "--apply");
  if (unknown.length) {
    console.error("Usage : npm run merge:blueprints [-- --apply]");
    process.exit(1);
  }
  const apply = args.includes("--apply");

  const database = db.db();
  const collections = {
    blueprints: database.collection<Doc>("blueprints"),
    owners: database.collection("user-blueprints"),
    missions: database.collection("missions"),
    items: database.collection("gameItems"),
  };

  const docs = await collections.blueprints.find().toArray();
  const { pairs, skipped } = findPairs(docs);

  for (const { kept, merged } of pairs) {
    const { lost } = adminFields({ kept, merged });
    const owners = await collections.owners.countDocuments({
      blueprintId: merged._id.toHexString(),
    });
    const notes = [
      merged.mergedInto ? "reprise" : "",
      owners ? `${owners} possession(s) à reprendre` : "",
      recipeFingerprint(kept.recipe) !== recipeFingerprint(merged.recipe)
        ? "recette mise à jour"
        : "",
      lost.length
        ? `saisi sur la fiche importée et perdu : ${lost.join(", ")}`
        : "",
    ].filter(Boolean);
    console.log(
      `${kept.name} : ${merged.slug} → ${kept.slug}${notes.length ? ` (${notes.join(", ")})` : ""}`,
    );
  }
  if (skipped.length) {
    console.log(`\nLaissés tels quels (${skipped.length}) :`);
    for (const line of skipped) console.log(`  ${line}`);
  }
  console.log(`\n${pairs.length} doublon(s) à fusionner.`);

  if (!apply) {
    if (pairs.length) console.log("Rien n'est écrit sans --apply.");
    await db.close();
    return;
  }

  let owned = 0;
  let duplicates = 0;
  for (const pair of pairs) {
    const result = await merge(pair, collections);
    owned += result.owned;
    duplicates += result.duplicates;
  }
  console.log(
    `Fusionnés : ${pairs.length} ; possessions reprises : ${owned - duplicates}, en double supprimées : ${duplicates}.`,
  );
  if (pairs.length) {
    console.log(
      "Relancer `npm run import:game-data -- all` pour régénérer les textes d'obtention.",
    );
  }
  await db.close();
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
