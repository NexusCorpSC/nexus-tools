/**
 * Importe les blueprints, les factions et les missions du jeu.
 *
 *   npm run import:game-data -- <all|blueprints|missions|images> [options]
 *
 *   --version V        version du jeu à importer (défaut : la plus récente du
 *                      LIVE au manifeste de scmdb), par ex. 4.10.1-live.12660092
 *   --dir DOSSIER      lire les fichiers scmdb d'un dossier plutôt que de les
 *                      télécharger (`merged-<V>.json`, `crafting_blueprints-<V>.json`)
 *   --legacy DOSSIER   l'ancien export qui a servi aux imports d'avant les GUID
 *                      (défaut : `assets/` s'il contient missions.json et
 *                      blueprints.json) ; `--no-legacy` pour s'en passer
 *   --allow-mass-removal  accepter qu'un import marque plus de 20 % des fiches
 *                      comme disparues du jeu
 *   --mirror-images    (images) recopier les images dans le blob storage
 *                      plutôt que de pointer vers la source
 *                      (BLOB_READ_WRITE_TOKEN requis)
 *   --dry-run          tout calculer et afficher le rapport, n'écrire nulle part
 *
 * Source : scmdb.net (`scripts/game-data/scmdb.ts`). Les fichiers sont gardés
 * dans `.cache/game-data/scmdb/` : relancer l'import ne retélécharge rien.
 *
 * Ce que l'import garantit (`scripts/game-data/plan.ts`) :
 *   - un blueprint est suivi par son GUID, une mission par ses identifiants de
 *     contrat et ses noms techniques : un renommage en jeu met la fiche à jour
 *     au lieu d'en créer une autre, et les `_id` — donc les blueprints possédés
 *     par les joueurs et les liens `/missions/…` — ne bougent jamais ;
 *   - le nom, la description, le slug, l'image, les statistiques et le texte
 *     d'obtention qu'un administrateur a modifiés sont gardés ;
 *   - ce qui disparaît du jeu est marqué `removedInVersion` au lieu d'être
 *     supprimé, et une mission fusionnée dans une autre redirige vers elle ;
 *   - le format de la source est vérifié avant toute écriture, et un import
 *     qui retirerait d'un coup une grosse part du catalogue s'arrête.
 *
 * L'ordre `all` est celui qu'il faut : blueprints, puis factions et missions
 * (qui pointent vers les blueprints), puis les textes d'obtention et les
 * liens des objets du catalogue vers les blueprints dont le slug a changé.
 *
 * `images` est à part, parce qu'il interroge un autre site : il donne une
 * illustration aux blueprints qui n'en ont pas (`scripts/game-data/images.ts`).
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { put } from "@vercel/blob";
import type { AnyBulkWriteOperation, Collection, Document } from "mongodb";
import db from "@/lib/db";
import {
  findScmdbFiles,
  loadScmdb,
  loadScmdbFiles,
  resolveScmdbVersion,
  SourceFormatError,
} from "./game-data/scmdb";
import {
  MassRemovalError,
  planBlueprints,
  planFactions,
  planMissions,
  planObtention,
  type BlueprintDoc,
  type DocUpdate,
  type FactionDoc,
  type MissionDoc,
  type Report,
} from "./game-data/plan";
import { planBlueprintImages } from "./game-data/images";
import type { GameData } from "./game-data/source";

// ─── Ligne de commande ────────────────────────────────────────────────────────

/** Un arrêt voulu, avant toute écriture : son message suffit. */
class ImportStopped extends Error {}

type Target = "all" | "blueprints" | "missions" | "images";

type Options = {
  target: Target;
  version?: string;
  dir?: string;
  legacy?: string | false;
  allowMassRemoval: boolean;
  mirrorImages: boolean;
  dryRun: boolean;
};

const USAGE =
  "Usage : npm run import:game-data -- <all|blueprints|missions|images> [--version V] [--dir DOSSIER] [--legacy DOSSIER | --no-legacy] [--allow-mass-removal] [--mirror-images] [--dry-run]";

function parseArgs(argv: string[]): Options {
  const [target, ...rest] = argv;
  if (!["all", "blueprints", "missions", "images"].includes(target ?? "")) {
    console.error(USAGE);
    process.exit(1);
  }

  const options: Options = {
    target: target as Target,
    allowMassRemoval: false,
    mirrorImages: false,
    dryRun: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => {
      const value = rest[++i];
      if (!value || value.startsWith("--")) {
        console.error(`${arg} attend une valeur\n${USAGE}`);
        process.exit(1);
      }
      return value;
    };
    if (arg === "--version") options.version = next();
    else if (arg === "--dir") options.dir = next();
    else if (arg === "--legacy") options.legacy = next();
    else if (arg === "--no-legacy") options.legacy = false;
    else if (arg === "--allow-mass-removal") options.allowMassRemoval = true;
    else if (arg === "--mirror-images") options.mirrorImages = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else {
      console.error(`Option inconnue : ${arg}\n${USAGE}`);
      process.exit(1);
    }
  }

  return options;
}

// ─── Chargement ───────────────────────────────────────────────────────────────

async function loadData(options: Options): Promise<GameData> {
  if (options.dir) {
    const files = await findScmdbFiles(options.dir, options.version);
    console.log(`Source : fichiers locaux`);
    console.log(`  ${files.missions}\n  ${files.blueprints}`);
    return loadScmdbFiles(files.missions, files.blueprints);
  }
  const version = await resolveScmdbVersion(options.version);
  console.log(`Source : scmdb.net, version ${version}`);
  return loadScmdb(version);
}

/**
 * L'ancien export, celui des imports d'avant les GUID. Il ne sert qu'à
 * rattacher les fiches de ces imports à leur identifiant de jeu ; une fois
 * un import passé avec lui, il n'apporte plus rien.
 */
async function loadLegacy(options: Options): Promise<GameData | undefined> {
  if (options.legacy === false) return undefined;
  const dir = options.legacy ?? path.join(process.cwd(), "assets");
  const missions = path.join(dir, "missions.json");
  const blueprints = path.join(dir, "blueprints.json");
  if (!existsSync(missions) || !existsSync(blueprints)) {
    if (options.legacy) {
      throw new Error(
        `${dir} ne contient pas missions.json et blueprints.json`,
      );
    }
    return undefined;
  }
  const legacy = await loadScmdbFiles(missions, blueprints);
  console.log(`Ancien export : ${dir} (version ${legacy.version})`);
  return legacy;
}

// ─── Rapport ──────────────────────────────────────────────────────────────────

const SAMPLES = 8;

function printReport(title: string, report: Report) {
  console.log(`\n${title}`);
  const keys = Object.keys(report.counts);
  if (keys.length === 0) {
    console.log("  rien à signaler");
    return;
  }
  for (const key of keys) {
    console.log(`  ${key} : ${report.counts[key]}`);
    const samples = report.samples[key] ?? [];
    for (const sample of samples.slice(0, SAMPLES))
      console.log(`      ${sample}`);
    if (samples.length > SAMPLES) {
      console.log(`      … et ${samples.length - SAMPLES} autre(s)`);
    }
  }
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

const BATCH = 500;

/**
 * Écrit par lots, sans s'arrêter au premier échec d'un lot : chaque écriture
 * est idempotente, relancer l'import termine ce qu'un échec a laissé.
 */
async function write<T extends Document>(
  collection: Collection<T>,
  inserts: T[],
  updates: DocUpdate[],
): Promise<void> {
  const operations: AnyBulkWriteOperation<T>[] = [
    ...inserts.map(
      (document) => ({ insertOne: { document } }) as AnyBulkWriteOperation<T>,
    ),
    ...updates.map(
      ({ _id, set, unset }) =>
        ({
          updateOne: {
            filter: { _id },
            update: {
              ...(Object.keys(set).length > 0 ? { $set: set } : {}),
              ...(unset.length > 0
                ? { $unset: Object.fromEntries(unset.map((key) => [key, ""])) }
                : {}),
            },
          },
        }) as AnyBulkWriteOperation<T>,
    ),
  ];

  for (let i = 0; i < operations.length; i += BATCH) {
    await collection.bulkWrite(operations.slice(i, i + BATCH), {
      ordered: false,
    });
  }
}

/**
 * Les objets du catalogue qui désignent un blueprint par son slug suivent
 * les slugs qu'un renommage a déplacés. Chaque objet est réécrit une fois,
 * d'après la table complète : un renommage en chaîne ne se décale pas.
 */
async function planItemSlugs(moves: Map<string, string>): Promise<DocUpdate[]> {
  if (moves.size === 0) return [];
  const items = await db
    .db()
    .collection("gameItems")
    .find(
      { blueprintSlugs: { $in: [...moves.keys()] } },
      { projection: { blueprintSlugs: 1 } },
    )
    .toArray();
  return items.map((item) => ({
    _id: item._id,
    set: {
      blueprintSlugs: [
        ...new Set(
          (item.blueprintSlugs as string[]).map(
            (slug) => moves.get(slug) ?? slug,
          ),
        ),
      ],
    },
    unset: [],
  }));
}

// ─── Images ───────────────────────────────────────────────────────────────────

/** Recopie une image dans le blob storage, au chemin qu'utilise l'upload d'administration. */
async function mirrorImage(url: string, slug: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "nexus-tools-import/0.1 (+https://tools.services.nexus)",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${response.status} — ${url}`);
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const extension =
    { "image/png": "png", "image/webp": "webp" }[contentType] ?? "jpg";
  const blob = await put(
    `blueprints/${slug}/image.${extension}`,
    Buffer.from(await response.arrayBuffer()),
    {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    },
  );
  return blob.url;
}

async function importImages(options: Options) {
  if (options.mirrorImages && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("--mirror-images demande BLOB_READ_WRITE_TOKEN");
    process.exit(1);
  }

  const database = db.db();
  const blueprints = database.collection<BlueprintDoc>("blueprints");
  const docs = await blueprints
    .find({
      gameId: { $exists: true },
      removedInVersion: { $exists: false },
      // `null` couvre aussi le champ absent.
      imageUrl: { $in: [null, ""] },
    })
    .toArray();
  console.log(`${docs.length} blueprint(s) sans image`);

  const classes = docs
    .map((doc) => doc.productEntityClass)
    .filter((value): value is string => !!value);
  const items = await database
    .collection("gameItems")
    .find(
      {
        "source.name": "scwiki",
        "source.id": { $in: classes },
        imageUrl: { $nin: [null, ""] },
      },
      { projection: { "source.id": 1, imageUrl: 1 } },
    )
    .toArray();
  const catalogueImages = new Map(
    items.map((item) => [item.source.id as string, item.imageUrl as string]),
  );

  const { choices, report } = await planBlueprintImages(docs, catalogueImages);
  printReport("Images", report);

  if (options.dryRun) {
    console.log("\nSimulation : rien n'a été écrit.");
    return;
  }

  let failed = 0;
  const updates: DocUpdate[] = [];
  for (const choice of choices) {
    try {
      const url = options.mirrorImages
        ? await mirrorImage(choice.url, choice.doc.slug)
        : choice.url;
      updates.push({ _id: choice.doc._id, set: { imageUrl: url }, unset: [] });
    } catch (error) {
      failed += 1;
      console.warn(`  ⚠ ${choice.doc.name} : ${(error as Error).message}`);
    }
  }
  await write(blueprints, [], updates);
  console.log(
    `Terminé : ${updates.length} image(s) posée(s), ${failed} en échec.`,
  );
  if (failed > 0) process.exitCode = 2;
}

// ─── Lancement ────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.target === "images") {
    await importImages(options);
    await db.close();
    return;
  }

  const database = db.db();
  const blueprintsCollection = database.collection<BlueprintDoc>("blueprints");
  const factionsCollection = database.collection<FactionDoc>("factions");
  const missionsCollection = database.collection<MissionDoc>("missions");

  const data = await loadData(options);
  const legacy = await loadLegacy(options);
  console.log(
    `${data.blueprints.length} blueprints, ${data.factions.length} factions, ${data.missions.length} missions`,
  );
  for (const warning of data.warnings) console.warn(`  ⚠ ${warning}`);

  const planOptions = {
    version: data.version,
    source: data.source,
    allowMassRemoval: options.allowMassRemoval,
  };
  const withBlueprints = options.target !== "missions";
  const withMissions = options.target !== "blueprints";

  // Tout est calculé avant la première écriture.
  const existingBlueprints = await blueprintsCollection.find().toArray();
  const blueprints = withBlueprints
    ? planBlueprints(
        existingBlueprints,
        data.blueprints,
        legacy?.blueprints,
        planOptions,
      )
    : undefined;
  const blueprintDocs = blueprints?.docs ?? existingBlueprints;
  if (blueprints) printReport("Blueprints", blueprints.report);

  let factions: ReturnType<typeof planFactions> | undefined;
  let missions: ReturnType<typeof planMissions> | undefined;
  let obtention: ReturnType<typeof planObtention> | undefined;
  if (withMissions) {
    const byGameId = new Map(
      blueprintDocs
        .filter((doc) => doc.gameId)
        .map((doc) => [doc.gameId!, doc]),
    );
    if (byGameId.size === 0 && data.blueprints.length > 0) {
      // Sans GUID en base, chaque mission perdrait ses blueprints récompensés.
      throw new ImportStopped(
        "Aucun blueprint n'a encore de GUID en base : lancez `all` (ou `blueprints`) avant `missions`. Rien n'a été écrit.",
      );
    }
    factions = planFactions(await factionsCollection.find().toArray(), data);
    missions = planMissions(
      await missionsCollection.find().toArray(),
      data,
      legacy?.missions,
      factions.byGameId,
      byGameId,
      planOptions,
    );
    obtention = planObtention(blueprintDocs, missions.docs, factions.docs);
    printReport("Factions", factions.report);
    printReport("Missions", missions.report);
    printReport("Obtention des blueprints", obtention.report);
  }

  const itemUpdates = await planItemSlugs(blueprints?.slugMoves ?? new Map());
  if (itemUpdates.length > 0) {
    console.log(
      `\nObjets du catalogue dont un lien de blueprint suit un slug déplacé : ${itemUpdates.length}`,
    );
  }

  if (options.dryRun) {
    console.log("\nSimulation : rien n'a été écrit.");
    await db.close();
    return;
  }

  console.log("\nÉcriture…");
  if (blueprints) {
    await write(blueprintsCollection, blueprints.inserts, blueprints.updates);
  }
  if (factions && missions && obtention) {
    await write(factionsCollection, factions.inserts, factions.updates);
    await write(missionsCollection, missions.inserts, missions.updates);
    await write(blueprintsCollection, [], obtention.updates);
  }
  await write(database.collection("gameItems"), [], itemUpdates);

  console.log(`Terminé : version ${data.version} importée.`);
  await db.close();
}

main().catch(async (error) => {
  if (
    error instanceof SourceFormatError ||
    error instanceof MassRemovalError ||
    error instanceof ImportStopped
  ) {
    console.error(`\n✖ ${error.message}`);
  } else {
    console.error(error);
  }
  await db.close().catch(() => {});
  process.exit(1);
});
