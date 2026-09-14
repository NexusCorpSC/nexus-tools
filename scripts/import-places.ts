/**
 * Remplit le catalogue des lieux du 'verse.
 *
 *   npm run import:places -- <curated|missions|all|recompute> [options]
 *
 *   --update      rafraîchir les lieux déjà importés (défaut : les sauter)
 *   --limit N     n'importer que les N premiers lieux de chaque source
 *   --filter TEXTE  ne garder que les lieux dont le nom contient TEXTE
 *   --dry-run     tout calculer, n'écrire nulle part
 *
 * Sources :
 *   curated   La table écrite à la main, plus bas : les systèmes, les corps
 *             qui portent quelque chose, et l'arborescence des villes dont
 *             l'application parle vraiment — Lorville et ses quartiers,
 *             Area18, New Babbage, Orison, les stations de Stanton et de Pyro.
 *   missions  Le dictionnaire `locationPools` d'`assets/missions.json`, en
 *             remplissage : les corps célestes et les avant-postes.
 *   recompute N'importe rien : recalcule seulement les champs dérivés de tout
 *             le catalogue. C'est le bouton de réparation quand un arbre a
 *             l'air faux.
 *
 * L'ordre compte, et c'est tout le sujet. Dans `locationPools`, Area18,
 * Orison, Grim HEX, Port Tressler et Everus Harbor n'existent que comme
 * « Outpost » ou « Destination » sans système : le filtre évident — ne garder
 * que ce qui a un système — supprimerait exactement les lieux vedettes. La
 * table écrite à la main passe donc en premier, et le dictionnaire ne sert
 * qu'à compléter ce qu'elle n'a pas nommé.
 *
 * Chaque lieu importé porte sa provenance : relancer l'import ne crée jamais
 * de doublon, et `--update` met à jour ce que la source connaît en gardant la
 * description, les services, l'image et les plans qu'un administrateur a
 * ajoutés.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import {
  getPlaceBySlug,
  recomputeAllPlaces,
  upsertImportedPlace,
  type PlaceInput,
} from "@/lib/places";
import { toPlaceSlug, type PlaceService, type PlaceType } from "@/types/places";

// ─── Ligne de commande ────────────────────────────────────────────────────────

type Options = {
  source: "curated" | "missions" | "all" | "recompute";
  limit?: number;
  filter?: string;
  update: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Options {
  const [source, ...rest] = argv;
  if (!["curated", "missions", "all", "recompute"].includes(source ?? "")) {
    console.error(
      "Usage : npm run import:places -- <curated|missions|all|recompute> [options]",
    );
    process.exit(1);
  }

  const options: Options = {
    source: source as Options["source"],
    update: false,
    dryRun: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => rest[++i];
    if (arg === "--limit") options.limit = Number(next());
    else if (arg === "--filter") options.filter = next()?.toLowerCase();
    else if (arg === "--update") options.update = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

// ─── La table écrite à la main ────────────────────────────────────────────────

type Curated = {
  slug: string;
  name: string;
  type: PlaceType;
  parent?: string;
  services?: PlaceService[];
  shopCategory?: string;
  description?: string;
};

/**
 * Déclarée dans l'ordre de l'arborescence : un lieu n'apparaît jamais avant
 * celui qui le contient, pour que la création se fasse en une passe.
 *
 * Ajouter un lieu ici le crée à l'import suivant ; le modifier ne change que
 * ce que la source connaît — nom, type, parent — et laisse intact ce qu'un
 * administrateur a écrit dans le back-office. Un lieu ajouté depuis le
 * back-office n'a pas de provenance : l'import ne le voit pas et n'y touche
 * jamais.
 */
const CURATED: Curated[] = [
  // ── Les systèmes et les corps qui portent quelque chose ──
  { slug: "stanton", name: "Stanton", type: "star" },
  { slug: "pyro", name: "Pyro", type: "star" },
  { slug: "hurston", name: "Hurston", type: "planet", parent: "stanton" },
  { slug: "crusader", name: "Crusader", type: "planet", parent: "stanton" },
  { slug: "arccorp", name: "ArcCorp", type: "planet", parent: "stanton" },
  { slug: "microtech", name: "microTech", type: "planet", parent: "stanton" },
  { slug: "yela", name: "Yela", type: "moon", parent: "crusader" },
  { slug: "daymar", name: "Daymar", type: "moon", parent: "crusader" },
  { slug: "calliope", name: "Calliope", type: "moon", parent: "microtech" },
  { slug: "pyro-i", name: "Pyro I", type: "planet", parent: "pyro" },
  { slug: "monox", name: "Monox", type: "planet", parent: "pyro" },
  { slug: "bloom", name: "Bloom", type: "planet", parent: "pyro" },
  { slug: "pyro-v", name: "Pyro V", type: "planet", parent: "pyro" },
  { slug: "terminus", name: "Terminus", type: "planet", parent: "pyro" },

  // ── Lorville, l'arborescence de référence ──
  {
    slug: "lorville",
    name: "Lorville",
    type: "city",
    parent: "hurston",
    description:
      "Ville-usine de Hurston Dynamics, bâtie autour de la tour du Central Business District et fermée par un dôme. On y arrive par Teasa Spaceport ; le métro dessert ensuite les résidences L19 et le quartier commerçant.",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "cargo",
      "rental",
      "habitation",
      "crafting",
      "missions",
      "transit",
      "hangar",
    ],
  },
  {
    slug: "teasa-spaceport",
    name: "Teasa Spaceport",
    type: "spaceport",
    parent: "lorville",
    services: ["asop", "restock", "cargo", "rental", "hangar"],
  },
  {
    slug: "lorville-central-plaza",
    name: "Central Plaza",
    type: "district",
    parent: "lorville",
    services: ["transit", "missions"],
  },
  {
    slug: "lorville-l19",
    name: "L19 Habitation",
    type: "district",
    parent: "lorville",
    services: ["medical", "habitation"],
  },
  {
    slug: "lorville-cbd",
    name: "Central Business District",
    type: "district",
    parent: "lorville",
    services: ["armory", "crafting", "medical", "transit"],
  },
  {
    slug: "lorville-centre-medical",
    name: "Centre médical de Lorville",
    type: "building",
    parent: "lorville-cbd",
    services: ["medical"],
  },
  {
    slug: "new-deal",
    name: "New Deal",
    type: "shop",
    parent: "teasa-spaceport",
    shopCategory: "Vaisseaux",
  },
  {
    slug: "traveler-rentals",
    name: "Traveler Rentals",
    type: "shop",
    parent: "teasa-spaceport",
    shopCategory: "Location",
  },
  {
    slug: "tammany-and-sons",
    name: "Tammany and Sons",
    type: "shop",
    parent: "lorville-cbd",
    shopCategory: "Armures",
  },
  {
    slug: "cubby-blast-lorville",
    name: "Cubby Blast",
    type: "shop",
    parent: "lorville-cbd",
    shopCategory: "Armes",
  },
  {
    slug: "casaba-outlet-lorville",
    name: "Casaba Outlet",
    type: "shop",
    parent: "lorville-cbd",
    shopCategory: "Vêtements",
  },
  {
    slug: "dumpers-depot-lorville",
    name: "Dumper’s Depot",
    type: "shop",
    parent: "lorville-cbd",
    shopCategory: "Composants",
  },
  {
    slug: "reclamation-and-disposal",
    name: "Reclamation & Disposal",
    type: "shop",
    parent: "lorville-cbd",
    shopCategory: "Récupération",
  },
  {
    slug: "marias-pawn-shop",
    name: "Maria’s Pawn Shop",
    type: "shop",
    parent: "lorville-l19",
    shopCategory: "Occasion",
  },
  {
    slug: "wally-coles",
    name: "Wally Coles’",
    type: "shop",
    parent: "lorville-l19",
    shopCategory: "Bar",
  },

  // ── Les autres villes ──
  {
    slug: "area18",
    name: "Area18",
    type: "city",
    parent: "arccorp",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "cargo",
      "rental",
      "habitation",
      "missions",
      "transit",
    ],
  },
  {
    slug: "riker-memorial-spaceport",
    name: "Riker Memorial Spaceport",
    type: "spaceport",
    parent: "area18",
    services: ["asop", "restock", "cargo", "rental", "hangar"],
  },
  {
    slug: "area18-clinique",
    name: "Clinique d’Area18",
    type: "building",
    parent: "area18",
    services: ["medical"],
  },
  {
    slug: "new-babbage",
    name: "New Babbage",
    type: "city",
    parent: "microtech",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "cargo",
      "rental",
      "habitation",
      "crafting",
      "missions",
      "transit",
    ],
  },
  {
    slug: "new-babbage-interstellar",
    name: "New Babbage Interstellar",
    type: "spaceport",
    parent: "new-babbage",
    services: ["asop", "restock", "cargo", "rental", "hangar"],
  },
  {
    slug: "aspire-grand",
    name: "Aspire Grand",
    type: "district",
    parent: "new-babbage",
    services: ["habitation", "medical"],
  },
  {
    slug: "orison",
    name: "Orison",
    type: "city",
    parent: "crusader",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "cargo",
      "habitation",
      "missions",
      "transit",
    ],
  },

  // ── Les stations ──
  {
    slug: "everus-harbor",
    name: "Everus Harbor",
    type: "station",
    parent: "hurston",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "cargo",
      "rental",
      "habitation",
    ],
  },
  {
    slug: "port-tressler",
    name: "Port Tressler",
    type: "station",
    parent: "microtech",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "cargo",
      "rental",
      "habitation",
    ],
  },
  {
    slug: "baijini-point",
    name: "Baijini Point",
    type: "station",
    parent: "arccorp",
    services: ["asop", "restock", "medical", "cargo", "rental", "habitation"],
  },
  {
    slug: "seraphim-station",
    name: "Seraphim Station",
    type: "station",
    parent: "crusader",
    services: ["asop", "restock", "medical", "cargo", "habitation"],
  },
  {
    slug: "grim-hex",
    name: "Grim HEX",
    type: "station",
    parent: "yela",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "habitation",
      "crafting",
    ],
  },
  {
    slug: "ruin-station",
    name: "Ruin Station",
    type: "station",
    parent: "terminus",
    services: [
      "asop",
      "restock",
      "medical",
      "armory",
      "cargo",
      "habitation",
      "crafting",
    ],
  },
  {
    slug: "checkmate",
    name: "Checkmate",
    type: "station",
    parent: "pyro-i",
    services: ["asop", "restock", "armory", "cargo", "habitation"],
  },
  {
    slug: "orbituary",
    name: "Orbituary",
    type: "station",
    parent: "pyro-v",
    services: ["asop", "restock", "medical", "cargo", "habitation"],
  },
  {
    slug: "patch-city",
    name: "Patch City",
    type: "outpost",
    parent: "pyro-v",
    services: ["restock", "armory", "habitation", "crafting"],
  },
  {
    slug: "rats-nest",
    name: "Rat’s Nest",
    type: "outpost",
    parent: "bloom",
    services: ["restock", "cargo", "missions", "habitation"],
  },
];

// ─── Le dictionnaire d'assets/missions.json ───────────────────────────────────

type PoolEntry = {
  name: string;
  type: string;
  system: string | null;
  planet: string | null;
  moon: string | null;
};

/**
 * Ce qu'on garde. « Default » reste dehors : ce sont des points de Lagrange et
 * des doublons, pas des lieux où l'on marche.
 *
 * « Destination » a d'abord été écarté en bloc, et c'était trop large. Sur ses
 * 459 entrées, 147 portent le nom d'un lieu déjà retenu et 194 sont des
 * rebuts — mais il restait 138 noms uniques, dont Jumptown, Kudre Ore, les
 * abris de secours de Stanton, une vingtaine d'avant-postes de Pyro et les
 * points de saut de Nyx. On les admet, en confiant à `DESTINATION_JUNK` le
 * tri de ce qui reste : ces entrées désignent aussi des pièces intérieures.
 */
const KEPT_TYPES: Partial<Record<string, PlaceType>> = {
  Star: "star",
  Planet: "planet",
  Moon: "moon",
  LandingZone: "city",
  Station: "station",
  Outpost: "outpost",
  Destination: "outpost",
};

/**
 * Le rebut propre aux « Destination », et à elles seules : le type sert aussi
 * de point de largage à l'intérieur d'un lieu déjà catalogué. « Checkmate
 * Habs » et « Orbituary Clinic » sont des pièces de stations qu'on a déjà,
 * « Hangar 12 » et « Research Wing » ne nomment rien tout seuls, et
 * « Caterpillar » ou « Starfarer » sont des coques de vaisseau.
 *
 * Ce filtre ne s'applique qu'à ce type, sciemment : « microTech Logistics
 * Depot S4LD01 » est un avant-poste légitime, et le mot « Depot » ne doit le
 * condamner que lorsqu'il vient d'une Destination.
 */
const DESTINATION_JUNK =
  /\[|UNINITIALIZED|\b(habs?|entrance|clinic|refinery|depot|warehouse|hangar \d+|maintenance area|(research|engineering) wing|landing area|storage shed|main building|abandoned section|site-b lab|trading post|asteroid (mining )?base)\b|^(caterpillar|constellation|freelancer|starfarer|aegis reclaimer)$/i;

/** Une « Destination » ainsi nommée est une station, pas un avant-poste. */
const DESTINATION_STATION = /\b(station|gateway|jump point)\b/i;

/** Les désignations techniques et les sous-zones d'intérieur du dump. */
const JUNK_NAME =
  /[_@]|wreck site|derelict|\bcave\b|unoccupied|^cluster |^RAB-|^(lobby|storehouse|supply room|shipping area|staging point|inventory cent|on-call area|exterior zone|security (checkpoint|compound))/i;

/**
 * Des tournures de phrase, pas des noms : « a Private Landing Pad »,
 * « L19 Habs in Lorville », « the Rayari lab on Cellin ». La casse compte ici
 * — « The Golden Riviera » est un vrai lieu.
 */
const JUNK_PHRASE = /^(a|an|the) |\b(in|on) [A-Z]/;

/** Les parents d'abord : un corps doit exister avant ce qu'il porte. */
const TYPE_ORDER: PlaceType[] = [
  "star",
  "planet",
  "moon",
  "city",
  "station",
  "outpost",
];

type PoolCandidate = PoolEntry & { key: string; placeType: PlaceType };

function loadPool(): PoolCandidate[] {
  // Onze mégaoctets : lus et analysés à l'exécution, jamais importés. Un
  // `import` statique ferait typer le littéral entier par TypeScript, et
  // `next build` n'en reviendrait pas.
  const raw = JSON.parse(
    readFileSync(path.join(process.cwd(), "assets", "missions.json"), "utf8"),
  ) as { locationPools?: Record<string, PoolEntry> };
  const pools = raw.locationPools;
  if (!pools) {
    console.error("assets/missions.json ne contient pas de locationPools");
    process.exit(1);
  }

  const kept = Object.entries(pools)
    .map(([key, entry]) => ({
      ...entry,
      key,
      placeType:
        entry.type === "Destination" &&
        DESTINATION_STATION.test(entry.name ?? "")
          ? ("station" as PlaceType)
          : KEPT_TYPES[entry.type],
    }))
    .filter(
      (entry): entry is PoolCandidate =>
        !!entry.placeType &&
        !!entry.name?.trim() &&
        !JUNK_NAME.test(entry.name) &&
        !JUNK_PHRASE.test(entry.name) &&
        !(entry.type === "Destination" && DESTINATION_JUNK.test(entry.name)) &&
        !!toPlaceSlug(entry.name),
    );

  return kept.sort(
    (a, b) =>
      TYPE_ORDER.indexOf(a.placeType) - TYPE_ORDER.indexOf(b.placeType) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * Le parent se lit sur le nom, pas sur un identifiant : le dump n'en donne
 * pas. La table est bâtie sur le seul ensemble retenu — il reste 262 noms en
 * double dans le dictionnaire complet, et une table bâtie sur tout choisirait
 * silencieusement le mauvais parent.
 */
function buildNameIndex(candidates: PoolCandidate[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const candidate of candidates) {
    const key = candidate.name.trim().toLowerCase();
    if (!index.has(key)) index.set(key, toPlaceSlug(candidate.name));
  }
  for (const entry of CURATED) {
    index.set(entry.name.trim().toLowerCase(), entry.slug);
  }
  return index;
}

/**
 * Le dump désigne un même corps de deux façons. Ses planètes de Pyro sont, dans
 * l'ordre, Pyro I, Monox, Bloom, Pyro IV, Pyro V, Terminus : Monox est donc le
 * deuxième, et 16 entrées le rattachent à « Pyro II » quand 19 l'appellent par
 * son nom. Sans cette table, ces 16 lieux perdent leur parent — Arid Reach,
 * Last Ditch et Ostler's Claim en font partie.
 *
 * Bloom et Terminus ne sont jamais désignés par leur numéro dans ce fichier ;
 * on ne déclare donc pas d'alias pour eux, faute de l'avoir constaté.
 */
const BODY_ALIASES: Record<string, string> = { "pyro ii": "monox" };

function parentOf(
  candidate: PoolCandidate,
  index: Map<string, string>,
): { slug?: string; missing?: string } {
  const wanted = candidate.moon || candidate.planet || candidate.system;
  if (!wanted) return {};
  const key = wanted.trim().toLowerCase();
  const slug = index.get(key) ?? index.get(BODY_ALIASES[key] ?? "");
  return slug ? { slug } : { missing: wanted };
}

// ─── Écriture ─────────────────────────────────────────────────────────────────

type Report = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

type Candidate = { input: PlaceInput; label: string };

async function persist(
  candidates: Candidate[],
  options: Options,
  report: Report,
): Promise<void> {
  for (const { input, label } of candidates) {
    if (options.dryRun) {
      console.log(`  · ${label}`);
      continue;
    }

    try {
      // Un slug déjà pris par une autre provenance appartient à la table
      // écrite à la main, ou à un administrateur : le remplissage ne lui
      // invente pas un `-2` à côté.
      const slug = toPlaceSlug(input.slug ?? input.name);
      const existing = await getPlaceBySlug(slug);
      const source = input.source as { name: string; id: string };
      if (
        existing &&
        (existing.source?.name !== source.name ||
          existing.source?.id !== source.id)
      ) {
        report.skipped++;
        console.log(`  = ${label}  → /lieux/${slug} (déjà pris)`);
        continue;
      }

      const outcome = await upsertImportedPlace(input, {
        update: options.update,
      });
      report[outcome.action]++;
      const mark = { created: "+", updated: "~", skipped: "=" }[outcome.action];
      console.log(`  ${mark} ${label}  → /lieux/${outcome.place.slug}`);
    } catch (error) {
      report.failed++;
      console.error(`  ! ${label} : ${(error as Error).message}`);
    }
  }
}

/** Applies --filter and --limit to whatever a source listed. */
function select<T>(rows: T[], name: (row: T) => string, options: Options): T[] {
  const filtered = options.filter
    ? rows.filter((row) => name(row).toLowerCase().includes(options.filter!))
    : rows;
  return options.limit ? filtered.slice(0, options.limit) : filtered;
}

async function importCurated(options: Options, report: Report): Promise<void> {
  console.log("\nTable écrite à la main");
  const selected = select(CURATED, (entry) => entry.name, options);
  console.log(`  ${selected.length} lieu(x) retenu(s) sur ${CURATED.length}`);

  await persist(
    selected.map((entry) => ({
      label: `${entry.type.padEnd(10)} ${entry.name}`,
      input: {
        name: entry.name,
        slug: entry.slug,
        type: entry.type,
        parentSlug: entry.parent,
        services: entry.services,
        shopCategory: entry.shopCategory,
        description: entry.description,
        source: { name: "curated", id: entry.slug },
      },
    })),
    options,
    report,
  );
}

async function importMissions(options: Options, report: Report): Promise<void> {
  const candidates = loadPool();
  const index = buildNameIndex(candidates);

  console.log("\nassets/missions.json — locationPools");
  const selected = select(candidates, (entry) => entry.name, options);
  console.log(`  ${selected.length} lieu(x) retenu(s)`);

  const rows: Candidate[] = [];
  const taken = new Set<string>();
  for (const candidate of selected) {
    const slug = toPlaceSlug(candidate.name);
    // La table écrite à la main fait autorité : le dump ne la double pas.
    if (CURATED.some((entry) => entry.slug === slug)) continue;
    // Deux entrées peuvent porter le même nom sous des clés différentes — le
    // dump en compte 262. Le slug étant unique en base, la seconde ferait
    // échouer l'écriture. C'est la première *retenue* qui le prend, pas la
    // première rencontrée : `taken` ne se remplit qu'en fin de boucle, pour
    // qu'une entrée sortie faute de parent laisse sa place à son homonyme
    // mieux rattaché. À rattachement égal, l'ordre de `TYPE_ORDER` tranche.
    if (taken.has(slug)) {
      report.skipped++;
      console.log(`  = ${candidate.name} (nom déjà pris)`);
      continue;
    }

    const { slug: parentSlug, missing } = parentOf(candidate, index);
    if (missing) {
      report.skipped++;
      console.log(`  = ${candidate.name} (parent « ${missing} » inconnu)`);
      continue;
    }
    // Une « Destination » sans corps de rattachement n'est pas une racine :
    // « Stanton Gateway » n'a rien à faire à côté de Stanton dans l'arbre. Les
    // types historiques gardent leur comportement, eux.
    if (candidate.type === "Destination" && !parentSlug) {
      report.skipped++;
      console.log(`  = ${candidate.name} (sans corps de rattachement)`);
      continue;
    }
    taken.add(slug);

    rows.push({
      label: `${candidate.placeType.padEnd(10)} ${candidate.name}`,
      input: {
        name: candidate.name,
        slug,
        type: candidate.placeType,
        parentSlug,
        source: { name: "missions-json", id: candidate.key },
      },
    });
  }

  await persist(rows, options, report);
}

// ─── Programme ────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report: Report = { created: 0, updated: 0, skipped: 0, failed: 0 };

  if (options.source === "recompute") {
    const changed = await recomputeAllPlaces();
    console.log(`Champs dérivés recalculés : ${changed} lieu(x) mis à jour.`);
    await db.close();
    return;
  }

  if (options.source === "curated" || options.source === "all") {
    await importCurated(options, report);
  }
  if (options.source === "missions" || options.source === "all") {
    await importMissions(options, report);
  }

  if (options.dryRun) {
    console.log("\nRien écrit : --dry-run.");
  } else {
    console.log(
      `\nTerminé : ${report.created} créé(s), ${report.updated} mis à jour, ${report.skipped} déjà présent(s), ${report.failed} en erreur.`,
    );
    // Un import insère les lieux dans le désordre : les chemins, les chaînes
    // d'ancêtres et les compteurs ne sont justes qu'après une passe complète.
    const changed = await recomputeAllPlaces();
    console.log(`Champs dérivés recalculés : ${changed} lieu(x) mis à jour.`);
  }

  await db.close();
  process.exitCode = report.failed > 0 ? 2 : 0;
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
