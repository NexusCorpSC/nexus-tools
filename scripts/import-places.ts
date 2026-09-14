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
  /**
   * Ce lieu se rattache à un parent que seul le dump fournit — Nyx, par
   * exemple, que la table n'écrit pas. Il est donc créé après la passe des
   * missions, faute de quoi `createPlace` refuserait un parent inexistant.
   *
   * La table ne déclare pas Nyx elle-même à dessein : sur une base déjà
   * peuplée, un lieu du dump repris par la table changerait de provenance, et
   * l'import en créerait un doublon en « -2 » plutôt que de le reconnaître.
   */
  late?: boolean;
};

/**
 * Les stations du Keeger Belt, que QV Planet Services a bâties autour des
 * astéroïdes de Nyx pour les ouvrir au laser — le décor de l'opération Rock
 * Breaker. `locationPools` ne les nomme pas ; elles n'existent dans le dump
 * que par les droits miniers vendus pour chacune, d'où cette liste.
 */
const QV_BREAKER_DESIGNATIONS = [
  "BRK-110",
  "BRK-127",
  "BRK-184",
  "BRK-223",
  "BRK-235",
  "BRK-267",
  "BRK-284",
  "BRK-304",
  "BRK-320",
  "BRK-425",
  "BRK-437",
  "BRK-521",
  "BRK-529",
  "BRK-542",
  "BRK-546",
  "BRK-563",
  "BRK-597",
  "BRK-608",
  "BRK-630",
  "BRK-709",
  "BRK-711",
  "BRK-766",
  "BRK-782",
  "BRK-864",
  "BRK-879",
  "BRK-892",
  "BRK-913",
  "BRK-970",
  "BRK-985",
];

const QV_BREAKER_DESCRIPTION =
  "Station d'extraction de QV Planet Services, à l'abandon dans le Keeger Belt de Nyx. Elle enserre un astéroïde qu'un laser devait fendre pour en tirer le minerai ; l'installation est hors tension, et la remettre en marche — quatre condensateurs dans le noyau, un redémarrage depuis la salle des opérations, puis le tir — est tout l'objet de l'opération Rock Breaker. Les veines de sadaryx se minent à la main sur place. Les stations sont bâties sur le même moule, et souvent occupées par des hors-la-loi.";

const QV_BREAKERS: Curated[] = QV_BREAKER_DESIGNATIONS.map((designation) => ({
  slug: toPlaceSlug(`QV Breaker Station ${designation}`),
  name: `QV Breaker Station ${designation}`,
  type: "station" as PlaceType,
  parent: "nyx",
  late: true,
  description: QV_BREAKER_DESCRIPTION,
}));

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

  ...QV_BREAKERS,

  // Le dump ne la nomme que dans le texte de quatre contrats InterSec, au
  // singulier et toujours « the old QV Logistics station ». Le wiki n'a pas de
  // page pour elle ; le contexte vient de celle des QV Services Stations —
  // Nyx, bâties par QV Planet Services, passées aux mains du Shattered Blade,
  // et accessibles par les seuls contrats d'InterSec Defense Solutions.
  {
    slug: "qv-logistics-station",
    name: "QV Logistics Station",
    type: "station",
    parent: "nyx",
    late: true,
    description:
      "Ancienne station logistique de QV Planet Services, dans Nyx, aujourd'hui tenue par le Shattered Blade qui s'y sert de ses entrepôts pour écouler des pièces vanduul. On n'y entre que par un contrat d'InterSec Defense Solutions : c'est le décor de la chaîne Vanduul-Tech Smugglers, du relevé d'informations jusqu'à la récupération des cryopods.",
  },

  // ── Onyx, rattachée au système faute de mieux ──
  // Le dump ne nomme la facility nulle part : elle n'existe que dans le texte
  // des contrats « Jorrit Dossier », et `locationPools` n'en garde que des
  // sous-zones anonymes — « Research Wing », « Engineering Wing », « Site-B
  // Lab » — sans système ni parent, que le filtre écarte à raison.
  //
  // Le rattachement vient donc du wiki : site de recherche souterrain d'ASD,
  // dans Stanton, sans corps d'accueil — l'accès ne se fait que par marqueur
  // quantique de mission. Elle pend sous l'étoile, ce qui est inhabituel mais
  // exact : lui inventer une planète serait pire.
  {
    slug: "onyx-facility",
    name: "Onyx Facility",
    type: "outpost",
    parent: "stanton",
    description:
      "Site de recherche souterrain d'Associated Sciences & Development, fermé puis laissé à l'abandon, et depuis fréquenté par les récupérateurs — l'endroit est délabré et franchement hostile. En surface, deux hangars larges et une structure centrale ; tout le reste est sous terre. On n'y accède que par un marqueur quantique de mission. Le jeu en a dupliqué l'exemplaire une centaine de fois à travers Stanton faute d'instanciation coopérative, mais c'est un seul et même lieu.",
    services: ["asop", "hangar", "missions"],
  },
  {
    slug: "onyx-facility-lobby",
    name: "Onyx Facility — Hall",
    type: "building",
    parent: "onyx-facility",
    description:
      "L'entrée du site : un grand ascenseur hors service en son centre, un comptoir d'accueil devant, puis les terminaux ASOP et les ascenseurs qui redescendent vers les hangars.",
    services: ["asop", "hangar"],
  },
  {
    slug: "onyx-facility-engineering",
    name: "Onyx Facility — Ingénierie (secteur A)",
    type: "building",
    parent: "onyx-facility",
    description:
      "Le secteur technique : sas d'entrée, condenseurs, réacteur à carburant et cœur de puissance.",
  },
  {
    slug: "onyx-facility-research",
    name: "Onyx Facility — Recherche (secteur B)",
    type: "building",
    parent: "onyx-facility",
    description:
      "Neuf sous-niveaux, de la réception à l'atrium central, en passant par le laboratoire de xénotechnologie et d'énergie, le traitement des données et le laboratoire médical. C'est là que se tenaient les travaux du docteur Jorrit.",
  },
  {
    slug: "onyx-facility-site-b",
    name: "Onyx Facility — Site B",
    type: "building",
    parent: "onyx-facility",
    description:
      "Une annexe à part : sas d'entrée, inspection et transit du fret, bâtiment principal.",
    services: ["cargo"],
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

/**
 * La table écrite à la main, en deux temps. Les lieux ordinaires d'abord, avant
 * le dump, pour que la table fasse autorité sur les slugs qu'elle nomme. Ceux
 * qui pendent à un parent venu du dump ensuite, une fois ce parent créé.
 */
async function importCurated(
  options: Options,
  report: Report,
  phase: "early" | "late",
): Promise<void> {
  const table = CURATED.filter((entry) => !!entry.late === (phase === "late"));
  if (table.length === 0) return;

  console.log(
    phase === "late"
      ? "\nTable écrite à la main — lieux rattachés au dump"
      : "\nTable écrite à la main",
  );
  const selected = select(table, (entry) => entry.name, options);
  console.log(`  ${selected.length} lieu(x) retenu(s) sur ${table.length}`);

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

  const wantsCurated = options.source === "curated" || options.source === "all";
  if (wantsCurated) await importCurated(options, report, "early");
  if (options.source === "missions" || options.source === "all") {
    await importMissions(options, report);
  }
  // Après le dump : ces lieux-là n'ont de parent qu'une fois celui-ci passé.
  if (wantsCurated) await importCurated(options, report, "late");

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
