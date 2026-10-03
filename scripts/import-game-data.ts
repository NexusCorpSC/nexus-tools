/**
 * Importe les blueprints, les factions et les missions du jeu.
 *
 *   npm run import:game-data -- <all|blueprints|missions|images> [options]
 *
 *   --source S         la source de tout : `wiki` (défaut, l'API du Star
 *                      Citizen Wiki) ou `scmdb` (les fichiers de scmdb.net)
 *   --blueprints-source S  la source des seuls blueprints
 *   --missions-source S    la source des seules factions et missions
 *   --version V        version du jeu à importer (défaut : celle que la source
 *                      sert par défaut, le dernier LIVE), par ex.
 *                      4.10.1-LIVE.12660092
 *   --dir DOSSIER      (scmdb) lire ses fichiers d'un dossier plutôt que de les
 *                      télécharger (`merged-<V>.json`, `crafting_blueprints-<V>.json`)
 *   --refresh-recipes  (wiki) redemander la recette de chaque blueprint, pas
 *                      seulement de ceux dont les ingrédients ont changé
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
 * Sources :
 *   - l'API du Star Citizen Wiki (`scripts/game-data/wiki.ts`), par défaut,
 *     lue par ses listes à 200 lignes par page : une cinquantaine de
 *     requêtes pour tout, plus le détail des seuls blueprints nouveaux ou
 *     dont la recette a changé ;
 *   - scmdb.net (`scripts/game-data/scmdb.ts`), en secours : deux fichiers
 *     par version, gardés dans `.cache/game-data/scmdb/`. Il découpe les
 *     missions plus finement que le wiki, qui regroupe les variantes d'une
 *     même mission.
 * Les deux partagent les GUID des blueprints : on peut les combiner.
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
} from "./game-data/scmdb";
import {
  loadWiki,
  loadWikiRecipes,
  resolveWikiVersion,
  type WikiStats,
} from "./game-data/wiki";
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
import { SourceFormatError, type GameData } from "./game-data/source";

// ─── Ligne de commande ────────────────────────────────────────────────────────

/** Un arrêt voulu, avant toute écriture : son message suffit. */
class ImportStopped extends Error {}

type Target = "all" | "blueprints" | "missions" | "images";

type SourceName = GameData["source"];

type Options = {
  target: Target;
  blueprintsSource: SourceName;
  missionsSource: SourceName;
  version?: string;
  dir?: string;
  legacy?: string | false;
  allowMassRemoval: boolean;
  refreshRecipes: boolean;
  mirrorImages: boolean;
  dryRun: boolean;
};

const USAGE =
  "Usage : npm run import:game-data -- <all|blueprints|missions|images> [--source wiki|scmdb] [--blueprints-source wiki|scmdb] [--missions-source wiki|scmdb] [--version V] [--dir DOSSIER] [--refresh-recipes] [--legacy DOSSIER | --no-legacy] [--allow-mass-removal] [--mirror-images] [--dry-run]";

function parseArgs(argv: string[]): Options {
  const [target, ...rest] = argv;
  if (!["all", "blueprints", "missions", "images"].includes(target ?? "")) {
    console.error(USAGE);
    process.exit(1);
  }

  const options: Options = {
    target: target as Target,
    blueprintsSource: "wiki",
    missionsSource: "wiki",
    allowMassRemoval: false,
    refreshRecipes: false,
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
    const source = (): SourceName => {
      const value = next();
      if (value !== "wiki" && value !== "scmdb") {
        console.error(`${arg} : wiki ou scmdb\n${USAGE}`);
        process.exit(1);
      }
      return value;
    };
    if (arg === "--source") {
      options.blueprintsSource = options.missionsSource = source();
    } else if (arg === "--blueprints-source")
      options.blueprintsSource = source();
    else if (arg === "--missions-source") options.missionsSource = source();
    else if (arg === "--version") options.version = next();
    else if (arg === "--dir") options.dir = next();
    else if (arg === "--legacy") options.legacy = next();
    else if (arg === "--no-legacy") options.legacy = false;
    else if (arg === "--allow-mass-removal") options.allowMassRemoval = true;
    else if (arg === "--refresh-recipes") options.refreshRecipes = true;
    else if (arg === "--mirror-images") options.mirrorImages = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else {
      console.error(`Option inconnue : ${arg}\n${USAGE}`);
      process.exit(1);
    }
  }
  if (
    options.dir &&
    !sourcesFor(options).every((source) => source === "scmdb")
  ) {
    console.error(`--dir ne sert qu'avec --source scmdb\n${USAGE}`);
    process.exit(1);
  }

  return options;
}

// ─── Chargement ───────────────────────────────────────────────────────────────

/** Les sources que la cible demande. */
function sourcesFor(options: Options): SourceName[] {
  const sources = new Set<SourceName>();
  if (options.target !== "missions") sources.add(options.blueprintsSource);
  if (options.target !== "blueprints") sources.add(options.missionsSource);
  return [...sources];
}

async function loadSource(
  source: SourceName,
  options: Options,
  stats: WikiStats,
): Promise<GameData> {
  if (source === "wiki") {
    const version = await resolveWikiVersion(options.version, stats);
    console.log(`Source : API du Star Citizen Wiki, version ${version}`);
    return loadWiki(
      version,
      {
        blueprints:
          options.target !== "missions" && options.blueprintsSource === "wiki",
        missions:
          options.target !== "blueprints" && options.missionsSource === "wiki",
      },
      stats,
    );
  }
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

  const stats: WikiStats = { requests: 0 };
  const loaded = new Map<SourceName, GameData>();
  for (const source of sourcesFor(options)) {
    loaded.set(source, await loadSource(source, options, stats));
  }
  const withBlueprints = options.target !== "missions";
  const withMissions = options.target !== "blueprints";
  const bpData = withBlueprints
    ? loaded.get(options.blueprintsSource)!
    : undefined;
  const msData = withMissions ? loaded.get(options.missionsSource)! : undefined;
  if (
    bpData &&
    msData &&
    bpData.version.toLowerCase() !== msData.version.toLowerCase()
  ) {
    console.warn(
      `  ⚠ Les deux sources ne sont pas à la même version : blueprints ${bpData.version}, missions ${msData.version}. Les blueprints qu'une mission récompense mais que l'autre version n'a pas seront signalés.`,
    );
  }
  // La sous-catégorie (taille, famille d'arme ou d'armure) n'est pas au
  // wiki ; quand les fichiers scmdb sont déjà là (missions prises chez
  // scmdb), ils la donnent sans requête de plus. Sinon une fiche garde la
  // sienne.
  const scmdbData = loaded.get("scmdb");
  if (bpData?.source === "wiki" && scmdbData) {
    const subcategories = new Map(
      scmdbData.blueprints.map((record) => [record.gameId, record.subcategory]),
    );
    for (const record of bpData.blueprints) {
      record.subcategory ??= subcategories.get(record.gameId);
    }
  }
  const legacy = await loadLegacy(options);
  if (bpData) console.log(`${bpData.blueprints.length} blueprints`);
  if (msData)
    console.log(
      `${msData.factions.length} factions, ${msData.missions.length} missions`,
    );

  const planOptions = (data: GameData) => ({
    version: data.version,
    source: data.source,
    allowMassRemoval: options.allowMassRemoval,
  });

  // Tout est calculé avant la première écriture.
  const existingBlueprints = await blueprintsCollection.find().toArray();
  const planAll = (data: GameData) =>
    planBlueprints(
      existingBlueprints,
      data.blueprints,
      legacy?.blueprints,
      planOptions(data),
    );
  let blueprints = bpData ? planAll(bpData) : undefined;
  // Le wiki ne donne la recette complète qu'au détail : seulement pour les
  // blueprints nouveaux ou dont les ingrédients ont changé, puis on recalcule.
  if (blueprints && bpData?.source === "wiki") {
    const wanted = options.refreshRecipes
      ? bpData.blueprints.map((record) => record.gameId)
      : blueprints.needsRecipe;
    if (wanted.length > 0) {
      console.log(`Recettes à lire au détail : ${wanted.length}`);
      const recipes = await loadWikiRecipes(
        bpData.version,
        wanted,
        stats,
        bpData.warnings,
      );
      for (const record of bpData.blueprints) {
        const recipe = recipes.get(record.gameId);
        if (recipe) record.recipe = recipe;
      }
      blueprints = planAll(bpData);
    }
  }
  if (loaded.has("wiki"))
    console.log(`Requêtes à l'API du wiki : ${stats.requests}`);
  for (const data of loaded.values())
    for (const warning of data.warnings) console.warn(`  ⚠ ${warning}`);
  const blueprintDocs = blueprints?.docs ?? existingBlueprints;
  if (blueprints) printReport("Blueprints", blueprints.report);

  let factions: ReturnType<typeof planFactions> | undefined;
  let missions: ReturnType<typeof planMissions> | undefined;
  let obtention: ReturnType<typeof planObtention> | undefined;
  if (msData) {
    const byGameId = new Map(
      blueprintDocs
        .filter((doc) => doc.gameId)
        .map((doc) => [doc.gameId!, doc]),
    );
    const rewarded = msData.missions.some(
      (mission) => mission.blueprintGameIds.length > 0,
    );
    if (byGameId.size === 0 && rewarded) {
      // Sans GUID en base, chaque mission perdrait ses blueprints récompensés.
      throw new ImportStopped(
        "Aucun blueprint n'a encore de GUID en base : lancez `all` (ou `blueprints`) avant `missions`. Rien n'a été écrit.",
      );
    }
    factions = planFactions(await factionsCollection.find().toArray(), msData);
    missions = planMissions(
      await missionsCollection.find().toArray(),
      msData,
      legacy?.missions,
      factions,
      byGameId,
      planOptions(msData),
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

  console.log(
    `Terminé : version ${[...new Set([...loaded.values()].map((data) => data.version))].join(" / ")} importée.`,
  );
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
