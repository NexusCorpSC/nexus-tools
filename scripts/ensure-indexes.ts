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

// ─── Plans de vol ─────────────────────────────────────────────────────────────

/**
 * Les plans d'une escouade ou d'un raid.
 *
 * `ownerId` est ce que toute lecture vise, et `archivedAt` distingue les plans
 * vivants — ceux que le flux d'événements porte — des plans rangés. Les deux
 * dans le même index : c'est la requête que le topic `plan` relit une fois par
 * membre connecté à chaque trait tracé, donc la seule qui doive être rapide.
 */
async function ensurePlans(database: Db) {
  await database
    .collection("plans")
    .createIndex({ ownerId: 1, archivedAt: 1 }, { name: "plans_owner" });
}

/**
 * Les traits, et les deux règles qu'ils tiennent.
 *
 * Le premier index sert la requête de delta — « tout ce qui dépasse telle
 * révision, dans telle époque » — et sert aussi le vidage d'une phase, qui
 * frappe le même préfixe.
 *
 * Le second empêche un POST rejoué après un timeout de dessiner le trait deux
 * fois : le client frappe son propre `clientId` avant d'envoyer, et le doublon
 * est renvoyé tel quel plutôt que redessiné.
 */
async function ensurePlanStrokes(database: Db) {
  const strokes = database.collection("planStrokes");

  await strokes.createIndex(
    { planId: 1, phaseId: 1, epoch: 1, rev: 1 },
    { name: "planStrokes_delta" },
  );
  await strokes.createIndex(
    { planId: 1, clientId: 1 },
    { unique: true, name: "planStrokes_client_unique" },
  );
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

// ─── Lieux du 'verse ──────────────────────────────────────────────────────────

/**
 * Le catalogue des lieux, à ne pas confondre avec `locations`, qui garde les
 * emplacements de rangement que chaque joueur nomme lui-même.
 */
async function ensureGameLocations(database: Db) {
  const places = database.collection("gameLocations");

  await places.createIndex(
    { slug: 1 },
    { unique: true, name: "gameLocations_slug_unique" },
  );
  await places.createIndex({ id: 1 }, { name: "gameLocations_id" });
  // Les lieux contenus par un lieu, déjà triés : la requête que relance chaque
  // dépliage de l'arbre, et celle que suit le recalcul des champs dérivés.
  await places.createIndex(
    { parentSlug: 1, name: 1 },
    { name: "gameLocations_parent" },
  );
  // Tout un sous-arbre en une passe : les magasins d'une ville, qui se
  // tiennent dans ses quartiers et non directement sous elle.
  await places.createIndex(
    { ancestorSlugs: 1 },
    { name: "gameLocations_ancestors" },
  );
  // Trier sur le chemin rend l'arbre dans l'ordre de parcours. Non unique à
  // dessein : un recalcul à mi-course fait transitoirement collisionner deux
  // chemins, et un index unique avorterait l'écriture groupée.
  await places.createIndex({ path: 1 }, { name: "gameLocations_path" });
  await places.createIndex(
    { systemSlug: 1, type: 1, name: 1 },
    { name: "gameLocations_browse" },
  );
  await places.createIndex({ services: 1 }, { name: "gameLocations_services" });
  // Unique, pour que deux imports lancés en même temps ne créent pas deux fois
  // le même lieu ; partiel, pour que les lieux saisis à la main restent libres.
  await places.createIndex(
    { "source.name": 1, "source.id": 1 },
    {
      unique: true,
      name: "gameLocations_source_unique",
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
  ["plans", ensurePlans],
  ["planStrokes", ensurePlanStrokes],
  ["gameItems", ensureGameItems],
  ["gameLocations", ensureGameLocations],
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
