/**
 * Crée ou met à jour tous les index de la base, en une passe.
 *
 *   npm run ensure:indexes
 *
 * À lancer à la main — après un déploiement qui en ajoute un, ou sur une base
 * neuve — plutôt que depuis le code de l'application : un `createIndex` à
 * chaque premier appel d'un processus, c'est une commande de plus par instance
 * démarrée, et sur une plateforme serverless c'est autant d'instances que de
 * réveils. Ici, une fois, pour toutes.
 *
 * `createIndex` est idempotent : un index déjà en place, avec les mêmes
 * options, ne coûte rien. Une option qui change (unique → non unique) fait
 * refuser la commande, et c'est le cas que la migration de `squads` traite.
 */

import type { Collection, Db, Document } from "mongodb";
import db from "@/lib/db";

/** Codes d'erreur de Mongo, par leur nom : le pilote ne donne que le numéro. */
const INDEX_OPTIONS_CONFLICT = 85;
const INDEX_NOT_FOUND = 27;

function mongoCode(error: unknown): number | undefined {
  return (error as { code?: number } | null)?.code;
}

// ─── Escouades ────────────────────────────────────────────────────────────────

/**
 * L'index des membres, et la migration qu'il porte.
 *
 * Il était unique — c'est ce qui faisait de « une escouade à la fois » un fait
 * plutôt qu'une convention. L'organisateur d'un raid peut maintenant en ouvrir
 * plusieurs et les mener jusqu'à passer la main : le même utilisateur figure
 * légitimement dans plus d'un document. Mongo refuse de *changer* les options
 * d'un index en place (`IndexOptionsConflict`) : une base écrite par la
 * version d'avant tient encore l'index unique, qui est supprimé et recréé
 * sans l'option.
 *
 * Retrouvé par sa clé plutôt que par le nom que l'ancienne version a laissé
 * Mongo choisir, et un index déjà parti n'est pas une erreur.
 */
async function ensureSquadMemberIndex(squads: Collection<Document>) {
  const key = { "members.userId": 1 } as const;

  try {
    await squads.createIndex(key);
    return;
  } catch (error) {
    if (mongoCode(error) !== INDEX_OPTIONS_CONFLICT) throw error;
  }

  const legacy = (await squads.indexes()).find(
    (index) =>
      index.key &&
      Object.keys(index.key).length === 1 &&
      index.key["members.userId"] === 1,
  );

  if (legacy?.name) {
    console.log(`  squads : l'index unique ${legacy.name} est remplacé`);
    try {
      await squads.dropIndex(legacy.name);
    } catch (error) {
      if (mongoCode(error) !== INDEX_NOT_FOUND) throw error;
    }
  }

  await squads.createIndex(key);
}

async function ensureSquads(database: Db) {
  const squads = database.collection("squads");

  // Le code d'invitation, unique : deux escouades ne partagent pas le leur.
  await squads.createIndex({ code: 1 }, { unique: true });
  // Chaque lecture de chaque membre passe par celui-ci.
  await ensureSquadMemberIndex(squads);
}

async function ensureRaids(database: Db) {
  await database.collection("raids").createIndex({ code: 1 }, { unique: true });
}

// ─── Bloc-notes ───────────────────────────────────────────────────────────────

/** Une note par utilisateur : la règle est tenue par la base. */
async function ensureNotes(database: Db) {
  await database
    .collection("notes")
    .createIndex({ userId: 1 }, { unique: true });
}

// ─── Objets du jeu ────────────────────────────────────────────────────────────

/**
 * Le slug est ce que chaque page et chaque lien visent : son unicité est
 * tenue par la base plutôt que par un lire-puis-écrire que deux créations
 * concurrentes passeraient toutes les deux.
 */
async function ensureGameItems(database: Db) {
  const items = database.collection("gameItems");

  await items.createIndex(
    { slug: 1 },
    { unique: true, name: "gameItems_slug_unique" },
  );
  await items.createIndex({ id: 1 }, { name: "gameItems_id" });
  await items.createIndex({ variantGroup: 1 }, { name: "gameItems_variant" });
  await items.createIndex({ setId: 1 }, { name: "gameItems_set" });
  // Unique, pour que deux imports lancés en même temps ne créent pas deux
  // fois le même objet ; partiel, pour que les objets saisis à la main (sans
  // source) restent libres.
  await items.createIndex(
    { "source.name": 1, "source.id": 1 },
    {
      unique: true,
      name: "gameItems_source_unique",
      partialFilterExpression: { "source.id": { $exists: true } },
    },
  );
}

// ─── Vaisseaux de cargo ───────────────────────────────────────────────────────

/** L'id est la clé que toute autre opération vise. */
async function ensureCargoShips(database: Db) {
  await database
    .collection("cargoShips")
    .createIndex({ id: 1 }, { unique: true, name: "cargoShips_id_unique" });
}

// ─── Lancement ────────────────────────────────────────────────────────────────

const STEPS: [string, (database: Db) => Promise<void>][] = [
  ["squads", ensureSquads],
  ["raids", ensureRaids],
  ["notes", ensureNotes],
  ["gameItems", ensureGameItems],
  ["cargoShips", ensureCargoShips],
];

async function main() {
  const database = db.db();
  let failed = 0;

  for (const [name, ensure] of STEPS) {
    try {
      await ensure(database);
      console.log(`${name} : index en place`);
    } catch (error) {
      failed += 1;
      console.error(`${name} : échec`, error);
    }
  }

  await db.close();
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
