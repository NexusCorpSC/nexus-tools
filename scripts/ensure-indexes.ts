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
import { ATTEMPT_WINDOW_MS } from "@/lib/parcels";
import { FRIEND_ATTEMPT_WINDOW_MS } from "@/lib/friends";

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

// ─── Marketplace ──────────────────────────────────────────────────────────────

/**
 * Un panier par joueur, tenu par la base ; les commandes d'un joueur, que
 * « Mes commandes » et la page d'un panier validé lisent ; et celles d'un
 * magasin, que son back-office liste.
 */
async function ensureMarketplace(database: Db) {
  await database
    .collection("carts")
    .createIndex({ userId: 1 }, { unique: true });
  await database
    .collection("shopOrders")
    .createIndex({ userId: 1, createdAt: -1 }, { name: "shopOrders_user" });
  await database
    .collection("shopOrders")
    .createIndex({ shopId: 1, createdAt: -1 }, { name: "shopOrders_shop" });
  // Les magasins d'un joueur, comptés à la création d'un nouveau.
  await database.collection("shops").createIndex({ ownerId: 1 });
  // Les annonces qui suivent un lot, resynchronisées à chaque lecture.
  await database
    .collection("shopItems")
    .createIndex({ inventoryItemId: 1 }, { sparse: true });
  // L'historique du stock, par annonce et par magasin.
  const movements = database.collection("shopStockMovements");
  await movements.createIndex({ listingId: 1, at: -1 });
  await movements.createIndex({ shopId: 1, at: -1 });
}

// ─── Présence en jeu ──────────────────────────────────────────────────────────

/**
 * Une déclaration et une session prévue par utilisateur, tenues par la base ;
 * et leur échéance, que chaque lecture d'une organisation filtre avec ses
 * membres.
 */
async function ensurePresences(database: Db) {
  const presences = database.collection("presences");
  await presences.createIndex({ userId: 1 }, { unique: true });
  await presences.createIndex({ expiresAt: 1 });

  const planned = database.collection("plannedSessions");
  await planned.createIndex({ userId: 1 }, { unique: true });
  await planned.createIndex({ expiresAt: 1 });
}

// ─── Évènements d'organisation ───────────────────────────────────────────────

/**
 * Le calendrier d'une organisation se lit par période : l'orga d'abord, puis
 * la date de début.
 */
async function ensureOrgEvents(database: Db) {
  await database
    .collection("orgEvents")
    .createIndex({ orgId: 1, startsAt: 1 }, { name: "orgEvents_calendar" });
  // « Mes évènements à venir », que reprend une session prévue.
  await database
    .collection("orgEvents")
    .createIndex(
      { "registrations.userId": 1, startsAt: 1 },
      { name: "orgEvents_registrant" },
    );
  // Le calendrier de la communauté : les évènements publics de toutes les orgas.
  await database
    .collection("orgEvents")
    .createIndex({ visibility: 1, startsAt: 1 }, { name: "orgEvents_public" });
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

// ─── Blueprints, factions et missions ─────────────────────────────────────────

/**
 * Les clés que l'import des données du jeu (`npm run import:game-data`)
 * retrouve à chaque passage. Le GUID est unique, pour que deux imports
 * concurrents ne créent pas deux fois le même blueprint ; partiel, pour que
 * les fiches saisies à la main (sans GUID) restent libres.
 *
 * Le slug des blueprints n'est pas (encore) unique en base : les premiers
 * imports ont pu laisser des doublons, que l'import ne corrige pas tout seul.
 */
async function ensureGameData(database: Db) {
  const blueprints = database.collection("blueprints");
  await blueprints.createIndex({ slug: 1 }, { name: "blueprints_slug" });
  await blueprints.createIndex(
    { gameId: 1 },
    {
      unique: true,
      name: "blueprints_gameId_unique",
      partialFilterExpression: { gameId: { $exists: true } },
    },
  );
  // L'ancien slug d'un blueprint renommé en jeu, qui redirige.
  await blueprints.createIndex(
    { previousSlugs: 1 },
    { name: "blueprints_previousSlugs" },
  );
  // L'objet fabriqué, que la fiche d'un objet du catalogue cherche.
  await blueprints.createIndex(
    { productEntityClass: 1 },
    { name: "blueprints_product" },
  );

  await database.collection("factions").createIndex(
    { gameId: 1 },
    {
      unique: true,
      name: "factions_gameId_unique",
      partialFilterExpression: { gameId: { $exists: true } },
    },
  );

  const missions = database.collection("missions");
  await missions.createIndex({ factionId: 1 }, { name: "missions_faction" });
  await missions.createIndex(
    { blueprints: 1 },
    { name: "missions_blueprints" },
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
  // Qui emprunte un plan à ce lieu ? La question est posée avant chaque
  // suppression et chaque enregistrement de plans, pas seulement à l'affichage.
  await places.createIndex(
    { "plans.sourceSlug": 1 },
    { name: "gameLocations_plan_sources" },
  );
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

// ─── Colis ────────────────────────────────────────────────────────────────────

/**
 * Le code d'un colis, unique ; les envois et réceptions d'un joueur, que liste
 * sa page ; et les codes erronés, que la base oublie d'elle-même passé la
 * fenêtre qui les compte (`lib/parcels.ts`).
 */
async function ensureParcels(database: Db) {
  const parcels = database.collection("parcels");
  await parcels.createIndex({ code: 1 }, { unique: true });
  await parcels.createIndex({ senderId: 1, createdAt: -1 });
  await parcels.createIndex({ recipientId: 1, createdAt: -1 });
  // Ce que les colis en attente d'un joueur réservent, lu à chaque lecture de
  // son inventaire.
  await parcels.createIndex({ senderId: 1, status: 1, expiresAt: 1 });

  const attempts = database.collection("parcelCodeAttempts");
  await attempts.createIndex({ userId: 1, at: -1 });
  await attempts.createIndex(
    { at: 1 },
    { expireAfterSeconds: ATTEMPT_WINDOW_MS / 1000 },
  );
}

// ─── Amis ─────────────────────────────────────────────────────────────────────

/**
 * Un code en attente par joueur, et un code n'appartient qu'à un joueur ; une
 * amitié par paire, retrouvée par l'un ou l'autre ; et les codes erronés, que
 * la base oublie d'elle-même passé la fenêtre qui les compte
 * (`lib/friends.ts`).
 */
async function ensureFriends(database: Db) {
  const friendCodes = database.collection("friendCodes");
  await friendCodes.createIndex({ userId: 1 }, { unique: true });
  await friendCodes.createIndex({ code: 1 }, { unique: true });

  const friendships = database.collection("friendships");
  await friendships.createIndex({ pair: 1 }, { unique: true });
  await friendships.createIndex({ users: 1 });

  const attempts = database.collection("friendCodeAttempts");
  await attempts.createIndex({ userId: 1, at: -1 });
  await attempts.createIndex(
    { at: 1 },
    { expireAfterSeconds: FRIEND_ATTEMPT_WINDOW_MS / 1000 },
  );
}

// ─── Lancement ────────────────────────────────────────────────────────────────

// ─── Contributions ────────────────────────────────────────────────────────────

/**
 * La file d'attente se lit par statut, la plus ancienne d'abord ; le suivi d'un
 * joueur et le calcul de sa fiabilité, par auteur. La galerie d'un lieu se lit
 * par lieu et statut, et une même image ne s'envoie pas deux fois.
 */
async function ensureContributions(database: Db) {
  const contributions = database.collection("contributions");
  await contributions.createIndex({ status: 1, createdAt: 1 });
  await contributions.createIndex({ userId: 1, createdAt: -1 });
  await contributions.createIndex({ "target.type": 1, "target.slug": 1 });
  // Le journal, du plus récent au plus ancien.
  await contributions.createIndex({ status: 1, updatedAt: -1 });

  const media = database.collection("placeMedia");
  await media.createIndex({ placeSlug: 1, status: 1, createdAt: 1 });
  await media.createIndex({ url: 1 }, { unique: true });

  const points = database.collection("pointEvents");
  await points.createIndex({ userId: 1, at: -1 });
  await points.createIndex({ at: -1 });
  // La valeur d'un plan ne se touche qu'une fois.
  await points.createIndex(
    { planKey: 1, reason: 1 },
    { unique: true, partialFilterExpression: { reason: "plan" } },
  );
  // Un seul bonus de première image par lieu.
  await points.createIndex(
    { placeSlug: 1, reason: 1 },
    { unique: true, partialFilterExpression: { reason: "firstMedia" } },
  );
  // Un signalement retenu ne rapporte qu'une fois à chacun.
  await points.createIndex(
    { reportId: 1, userId: 1 },
    { unique: true, partialFilterExpression: { reason: "report" } },
  );

  // Le classement depuis toujours, et l'onglet Contributeurs.
  await database.collection("users").createIndex({ "contrib.points": -1 });
}

// ─── Signalements ─────────────────────────────────────────────────────────────

/**
 * Un seul dossier ouvert par cible : c'est l'index qui fait s'empiler les
 * signalements plutôt que de les dupliquer. L'onglet admin lit les dossiers
 * ouverts par poids ; la page d'un joueur, les siens ; la limite du jour, ses
 * signalements récents. Les jetons de téléversement s'effacent d'eux-mêmes.
 */
async function ensureReports(database: Db) {
  const reports = database.collection("reports");
  await reports.createIndex(
    { "target.type": 1, "target.id": 1 },
    { unique: true, partialFilterExpression: { status: "open" } },
  );
  await reports.createIndex({ status: 1, weight: -1, updatedAt: -1 });
  await reports.createIndex({ "entries.userId": 1, "entries.at": -1 });
  await reports.createIndex({ "target.type": 1, "target.slug": 1, status: 1 });
  // Les dossiers retenus contre le contenu d'un contributeur.
  await reports.createIndex({ "resolution.authorIds": 1 });

  const log = database.collection("moderationLog");
  await log.createIndex({ at: -1 });
  await log.createIndex({ reportId: 1 });

  const grants = database.collection("uploadGrants");
  await grants.createIndex({ userId: 1, at: -1 });
  await grants.createIndex({ at: 1 }, { expireAfterSeconds: 24 * 60 * 60 });
}

async function ensureCommunity(database: Db) {
  // Les visites par fiche et par jour, pour « Ce qui manque » : trois mois
  // suffisent à classer les trous.
  const views = database.collection("pageViews");
  await views.createIndex({ type: 1, slug: 1, day: 1 }, { unique: true });
  await views.createIndex({ type: 1, day: -1 });
  await views.createIndex(
    { day: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60 },
  );

  // Les organisations qu'un joueur a créées.
  await database.collection("organizations").createIndex({ createdBy: 1 });
  // Les missions qui se jouent dans un lieu.
  await database.collection("missions").createIndex({ placeSlugs: 1 });

  // Les confirmations d'une donnée, et celles d'un joueur dans la journée.
  await database.collection("contributions").createIndex({
    kind: 1,
    "target.type": 1,
    "target.slug": 1,
    "proposal.subject": 1,
    createdAt: -1,
  });
  await database
    .collection("contributions")
    .createIndex({ kind: 1, userId: 1, createdAt: -1 });
}

/**
 * Le fournisseur OAuth du serveur MCP (better-auth) : il cherche les clients
 * par `clientId`, les consentements par joueur et client, les jetons de
 * rafraîchissement par valeur. L'adaptateur MongoDB ne crée aucun index.
 */
async function ensureOAuth(database: Db) {
  await database.collection("oauthClients").createIndex({ clientId: 1 });
  await database
    .collection("oauthConsents")
    .createIndex({ userId: 1, clientId: 1 });
  const refresh = database.collection("oauthRefreshTokens");
  await refresh.createIndex({ token: 1 });
  await refresh.createIndex({ clientId: 1, userId: 1 });
}

/**
 * Les brouillons de plans dessinés par des agents (serveur MCP) : ceux d'un
 * joueur, et l'expiration sept jours après la dernière modification.
 */
async function ensurePlanDrafts(database: Db) {
  const drafts = database.collection("placePlanDrafts");
  await drafts.createIndex({ userId: 1, updatedAt: -1 });
  await drafts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

/**
 * Nexus Chat : les conversations d'un joueur, de la plus récente ; l'usage
 * d'un joueur depuis le début du mois (le budget) ; les verrous expirés
 * (une réponse à la fois) ; les demandes d'accès.
 */
async function ensureChat(database: Db) {
  await database
    .collection("chatConversations")
    .createIndex({ userId: 1, updatedAt: -1 });
  await database
    .collection("chatUsage")
    .createIndex({ userId: 1, createdAt: -1 });
  await database
    .collection("chatLocks")
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database
    .collection("users")
    .createIndex({ "chat.status": 1 }, { sparse: true });
}

const STEPS: [string, (database: Db) => Promise<void>][] = [
  ["squads", ensureSquads],
  ["raids", ensureRaids],
  ["notes", ensureNotes],
  ["marketplace", ensureMarketplace],
  ["presences", ensurePresences],
  ["orgEvents", ensureOrgEvents],
  ["plans", ensurePlans],
  ["planStrokes", ensurePlanStrokes],
  ["gameItems", ensureGameItems],
  ["gameData", ensureGameData],
  ["gameLocations", ensureGameLocations],
  ["cargoShips", ensureCargoShips],
  ["parcels", ensureParcels],
  ["friends", ensureFriends],
  ["contributions", ensureContributions],
  ["reports", ensureReports],
  ["community", ensureCommunity],
  ["oauth", ensureOAuth],
  ["planDrafts", ensurePlanDrafts],
  ["chat", ensureChat],
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
