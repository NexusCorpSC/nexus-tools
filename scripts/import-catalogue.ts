/**
 * Importe le catalogue des objets depuis les sources publiques du jeu.
 *
 *   npm run import:catalogue -- <rsi|scwiki|uex|all> [options]
 *
 *   --limit N          n'importer que les N premiers objets de chaque source
 *   --filter TEXTE     ne garder que les objets dont le nom contient TEXTE
 *   --types A,B        (scwiki) types du wiki à importer, voir WIKI_TYPES
 *   --update           rafraîchir les objets déjà importés (défaut : les sauter)
 *   --mirror-images    recopier les images dans le blob storage plutôt que de
 *                      pointer vers la source (BLOB_READ_WRITE_TOKEN requis)
 *   --no-fleetyards    (rsi) ne pas compléter « Où l'obtenir » avec Fleetyards
 *   --dry-run          tout calculer, n'écrire nulle part
 *
 * Sources :
 *   rsi     Matrice officielle des vaisseaux (robertsspaceindustries.com) :
 *           caractéristiques, description, image, points d'emport, composants.
 *           Fleetyards ajoute les points de vente et de location en jeu.
 *   scwiki  API du Star Citizen Wiki (données extraites du jeu, en français) :
 *           armes personnelles et de vaisseau, accessoires, armures, composants.
 *   uex     UEX Corp : ressources échangeables et leurs cours par comptoir.
 *
 * Chaque objet importé porte sa provenance (`source`) : relancer l'import ne
 * crée jamais de doublon, et `--update` met à jour ce que la source connaît en
 * gardant ce qu'un administrateur a ajouté à la main.
 */

import { put } from "@vercel/blob";
import db from "@/lib/db";
import { upsertImportedItem, type ItemInput } from "@/lib/items";
import {
  MAX_ITEM_ROWS,
  toItemSlug,
  type ItemKind,
  type ItemSlot,
  type ItemStatistics,
  type ResourceMarket,
  type WeaponStat,
} from "@/types/items";

// ─── Ligne de commande ────────────────────────────────────────────────────────

type Options = {
  source: "rsi" | "scwiki" | "uex" | "all";
  limit?: number;
  filter?: string;
  types?: string[];
  update: boolean;
  mirrorImages: boolean;
  fleetyards: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Options {
  const [source, ...rest] = argv;
  if (!["rsi", "scwiki", "uex", "all"].includes(source ?? "")) {
    console.error(
      "Usage : npm run import:catalogue -- <rsi|scwiki|uex|all> [options]",
    );
    process.exit(1);
  }

  const options: Options = {
    source: source as Options["source"],
    update: false,
    mirrorImages: false,
    fleetyards: true,
    dryRun: false,
  };

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => rest[++i];
    if (arg === "--limit") options.limit = Number(next());
    else if (arg === "--filter") options.filter = next()?.toLowerCase();
    else if (arg === "--types")
      options.types = next()
        ?.split(",")
        .map((t) => t.trim());
    else if (arg === "--update") options.update = true;
    else if (arg === "--mirror-images") options.mirrorImages = true;
    else if (arg === "--no-fleetyards") options.fleetyards = false;
    else if (arg === "--dry-run") options.dryRun = true;
    else {
      console.error(`Option inconnue : ${arg}`);
      process.exit(1);
    }
  }

  return options;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

const USER_AGENT = "nexus-tools-import/0.1 (+https://tools.services.nexus)";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A GET that retries the way a polite client should: backing off on 429/5xx. */
async function fetchJson<T>(url: string, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(90_000),
    });

    if (response.ok) return (await response.json()) as T;

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= attempts) {
      throw new Error(`${response.status} ${response.statusText} — ${url}`);
    }
    await sleep(1500 * attempt);
  }
}

// ─── Aides communes ───────────────────────────────────────────────────────────

const number = (value: unknown): number | undefined => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && value !== "" && value !== null
    ? parsed
    : undefined;
};

/** "550 rpm" → 550, "50 m" → 50 ; undefined when there is no digit. */
const leadingNumber = (value: unknown): number | undefined => {
  const match = String(value ?? "")
    .replace(",", ".")
    .match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

/**
 * Copies an illustration into the blob storage under the same path the admin
 * upload uses, so the fiche stops depending on the source keeping its urls.
 */
async function mirrorImage(url: string, slug: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`image ${response.status} — ${url}`);

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const extension =
    { "image/png": "png", "image/webp": "webp" }[contentType] ?? "jpg";
  const blob = await put(
    `items/${slug}/image.${extension}`,
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

type Candidate = {
  input: ItemInput;
  slugFallbacks?: string[];
};

type Report = {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
};

/** Writes what a source produced, one object at a time, and tallies the outcome. */
async function persist(
  candidates: Candidate[],
  options: Options,
  report: Report,
): Promise<void> {
  for (const { input, slugFallbacks } of candidates) {
    const label = `${input.kind.padEnd(8)} ${input.name}`;

    if (options.dryRun) {
      console.log(`  · ${label}`);
      continue;
    }

    try {
      if (options.mirrorImages && input.imageUrl) {
        const slug = toItemSlug(input.slug ?? input.name);
        input.imageUrl = await mirrorImage(input.imageUrl, slug);
      }

      const outcome = await upsertImportedItem(input, {
        update: options.update,
        slugFallbacks,
      });
      report[outcome.action]++;
      const mark = { created: "+", updated: "~", skipped: "=" }[outcome.action];
      console.log(`  ${mark} ${label}  → /items/${outcome.item.slug}`);
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

// ─── RSI — matrice officielle des vaisseaux ───────────────────────────────────

type RsiComponent = {
  name: string;
  mounts: number;
  quantity: number;
  size: string;
};

type RsiShip = {
  id: number;
  name: string;
  url: string;
  type: string;
  focus: string;
  size: string | null;
  description: string;
  production_status: string;
  manufacturer: { name: string; code: string };
  length: number;
  beam: number;
  height: number;
  mass: number;
  cargocapacity: number;
  min_crew: number;
  max_crew: number;
  scm_speed: number;
  afterburner_speed: number;
  media: { source_url: string; images: Record<string, string> }[];
  compiled: Record<string, Record<string, RsiComponent[]>>;
};

const RSI_URL = "https://robertsspaceindustries.com";

const RSI_TYPES: Record<string, string> = {
  combat: "Combat",
  transport: "Transport",
  transporter: "Transport",
  exploration: "Exploration",
  industrial: "Industrie",
  support: "Soutien",
  competition: "Course",
  multi: "Polyvalent",
  "multi-role": "Polyvalent",
  starter: "Débutant",
  destroyer: "Destroyer",
  ground: "Terrestre",
};

const RSI_SIZES: Record<string, string> = {
  vehicle: "Véhicule",
  snub: "Snub",
  small: "Petit",
  medium: "Moyen",
  large: "Grand",
  capital: "Capital",
};

const RSI_STATUS: Record<string, string> = {
  "flight-ready": "Prêt au vol",
  "in-concept": "En concept",
  "in-production": "En production",
};

/** Hardpoint groups of the matrix, with the slot label the fiche shows. */
const RSI_HARDPOINTS: Record<string, string> = {
  weapons: "Arme",
  turrets: "Tourelle",
  missiles: "Missiles",
  utility_items: "Utilitaire",
};

const RSI_COMPONENTS: Record<string, string> = {
  power_plants: "Générateur",
  coolers: "Refroidisseur",
  shield_generators: "Bouclier",
  quantum_drives: "Quantum Drive",
  jump_modules: "Module de saut",
  radar: "Radar",
};

function rsiSlots(ship: RsiShip, groups: Record<string, string>): ItemSlot[] {
  const slots: ItemSlot[] = [];
  for (const category of Object.values(ship.compiled ?? {})) {
    for (const [group, components] of Object.entries(category)) {
      const label = groups[group];
      if (!label) continue;
      for (const component of components ?? []) {
        if (!component?.name) continue;
        const quantity = (component.mounts || 1) * (component.quantity || 1);
        slots.push({
          label,
          size: number(component.size),
          itemName: component.name,
          quantity: quantity > 1 ? quantity : undefined,
        });
      }
    }
  }
  return slots.slice(0, MAX_ITEM_ROWS);
}

function rsiImage(ship: RsiShip): string | undefined {
  const media = ship.media?.[0];
  if (!media) return undefined;
  return (
    media.images?.slideshow_wide ??
    media.images?.post_section_header ??
    media.images?.store_small ??
    media.source_url ??
    undefined
  );
}

type Availability = { sale: string[]; rental: string[] };

/**
 * Fleetyards knows where a ship is sold and rented in game, which the official
 * matrix does not. Matched on the RSI id it keeps for every model.
 */
async function loadFleetyards(): Promise<Map<number, Availability>> {
  type Model = {
    rsiId: number | null;
    availability?: {
      soldAt?: { price: number; location: string }[];
      rentalAt?: { price: number; location: string; timeRange?: string }[];
    };
  };

  const byRsiId = new Map<number, Availability>();
  for (let page = 1; page <= 10; page++) {
    const { items } = await fetchJson<{ items: Model[] }>(
      `https://api.fleetyards.net/v1/models?perPage=240&page=${page}`,
    );
    if (!items?.length) break;

    for (const model of items) {
      if (!model.rsiId) continue;
      const sale = (model.availability?.soldAt ?? [])
        .sort((a, b) => a.price - b.price)
        .slice(0, 3)
        .map(
          (s) =>
            `Vente : ${s.location} — ${Math.round(s.price).toLocaleString("fr-FR")} aUEC`,
        );
      const rental = (model.availability?.rentalAt ?? [])
        .sort((a, b) => a.price - b.price)
        .slice(0, 3)
        .map(
          (r) =>
            `Location : ${r.location} — ${Math.round(r.price).toLocaleString("fr-FR")} aUEC${r.timeRange ? ` / ${r.timeRange}` : ""}`,
        );
      if (sale.length || rental.length)
        byRsiId.set(model.rsiId, { sale, rental });
    }
    if (items.length < 240) break;
  }
  return byRsiId;
}

async function importRsi(options: Options, report: Report): Promise<void> {
  console.log("\nRSI — matrice des vaisseaux");
  const { data } = await fetchJson<{ data: RsiShip[] }>(
    `${RSI_URL}/ship-matrix/index`,
  );
  const ships = select(data, (ship) => ship.name, options);
  console.log(`  ${ships.length} vaisseau(x) retenu(s) sur ${data.length}`);

  const availability = options.fleetyards
    ? await loadFleetyards().catch((error) => {
        console.warn(
          `  Fleetyards indisponible (${(error as Error).message}) — pas de points de vente`,
        );
        return new Map<number, Availability>();
      })
    : new Map<number, Availability>();

  const candidates: Candidate[] = ships.map((ship) => {
    const type = (ship.type ?? "").toLowerCase();
    const isGround = type === "ground";
    const where = availability.get(ship.id);

    const statistics: ItemStatistics = {
      ...(ship.focus ? { Rôle: { value: ship.focus } } : {}),
      ...(ship.size
        ? { Taille: { value: RSI_SIZES[ship.size.toLowerCase()] ?? ship.size } }
        : {}),
      ...(ship.production_status
        ? {
            Statut: {
              value:
                RSI_STATUS[ship.production_status] ?? ship.production_status,
            },
          }
        : {}),
      ...(ship.min_crew && ship.min_crew !== ship.max_crew
        ? { "Équipage minimum": { value: ship.min_crew } }
        : {}),
    };

    const input: ItemInput = {
      name: ship.name,
      kind: "vehicle",
      category: isGround ? "Véhicule terrestre" : "Vaisseau",
      subcategory: RSI_TYPES[type] ?? ship.type ?? undefined,
      manufacturer: ship.manufacturer?.name,
      description: ship.description?.trim() || undefined,
      imageUrl: rsiImage(ship),
      statistics,
      obtention: where
        ? [...where.sale, ...where.rental].join("\n")
        : undefined,
      vehicle: {
        crew: number(ship.max_crew),
        speedMax: number(ship.afterburner_speed),
        speedScm: number(ship.scm_speed),
        cargoScu: number(ship.cargocapacity),
        mass: number(ship.mass),
        length: number(ship.length),
        width: number(ship.beam),
        height: number(ship.height),
        hardpoints: rsiSlots(ship, RSI_HARDPOINTS),
        components: rsiSlots(ship, RSI_COMPONENTS),
      },
      source: {
        name: "rsi",
        id: String(ship.id),
        url: `${RSI_URL}${ship.url}`,
      },
    };

    return { input, slugFallbacks: [ship.manufacturer?.code ?? "rsi"] };
  });

  await persist(candidates, options, report);
}

// ─── Star Citizen Wiki — armes, armures, composants ───────────────────────────

type WikiItem = {
  uuid: string;
  name: string;
  class_name: string;
  description: string | null;
  description_data?: { name: string; value: string }[];
  size?: number | null;
  mass?: number | null;
  is_base_variant?: boolean;
  manufacturer?: { name?: string; code?: string } | null;
  type: string;
  type_label?: string;
  sub_type_label?: string;
  images?: { original_url?: string; thumbnail_url?: string }[];
  web_url?: string;
  shops?: unknown[];
  personal_weapon?: {
    class?: string;
    type?: string;
    magazine_size?: number;
    damage_per_shot?: number;
    rpm?: number;
    effective_range?: number;
    modes?: { damage_per_second?: number; rpm?: number }[];
  } | null;
};

type WikiPage = { data: WikiItem[]; links?: { next?: string | null } };

const WIKI_URL = "https://api.star-citizen.wiki/api/v2";

/** Wiki item types worth a fiche, with the kind and the category they land in. */
const WIKI_TYPES: Record<
  string,
  { kind: ItemKind; category: string; subcategory?: string }
> = {
  WeaponPersonal: { kind: "weapon", category: "Arme personnelle" },
  WeaponGun: { kind: "weapon", category: "Arme de vaisseau" },
  WeaponAttachment: { kind: "item", category: "Accessoire d'arme" },
  Char_Armor_Helmet: {
    kind: "item",
    category: "Armure",
    subcategory: "Casque",
  },
  Char_Armor_Torso: { kind: "item", category: "Armure", subcategory: "Torse" },
  Char_Armor_Arms: { kind: "item", category: "Armure", subcategory: "Bras" },
  Char_Armor_Legs: { kind: "item", category: "Armure", subcategory: "Jambes" },
  Char_Armor_Undersuit: {
    kind: "item",
    category: "Armure",
    subcategory: "Combinaison",
  },
  Char_Armor_Backpack: {
    kind: "item",
    category: "Armure",
    subcategory: "Sac à dos",
  },
  PowerPlant: {
    kind: "item",
    category: "Composant de vaisseau",
    subcategory: "Générateur",
  },
  Cooler: {
    kind: "item",
    category: "Composant de vaisseau",
    subcategory: "Refroidisseur",
  },
  Shield: {
    kind: "item",
    category: "Composant de vaisseau",
    subcategory: "Bouclier",
  },
  QuantumDrive: {
    kind: "item",
    category: "Composant de vaisseau",
    subcategory: "Quantum Drive",
  },
};

/** Attachment slots as the wiki names them, with the label the fiche shows. */
const WIKI_ATTACHMENTS: Record<string, string> = {
  optics: "Optique",
  barrel: "Canon",
  underbarrel: "Sous-canon",
  magazine: "Chargeur",
  top: "Rail supérieur",
  bottom: "Sous-canon",
};

/** Header stats the description opens with, which the fiche shows elsewhere. */
const WIKI_HEADER_HANDLED = new Set(["Type d'article", "Fabricant", "Classe"]);

/** …and the ones a weapon fiche already shows as readouts or profile bars. */
const WIKI_WEAPON_HEADER_HANDLED = new Set([
  ...WIKI_HEADER_HANDLED,
  "Capacité du chargeur",
  "Cadence de tir",
  "Portée effective",
]);

const HEADER_LINE = /^([^:\n]{2,48}) : (.+)$/;

/**
 * The wiki description opens with `Clé : valeur` blocks — the in-game
 * infobox — before the prose. Both halves are useful, separately: the header
 * feeds the structured fields, the prose becomes the description.
 */
function splitWikiDescription(description: string | null | undefined): {
  header: Record<string, string>;
  prose: string | undefined;
} {
  const header: Record<string, string> = {};
  const paragraphs = (description ?? "").split(/\n\s*\n/);
  let index = 0;

  for (; index < paragraphs.length; index++) {
    const lines = paragraphs[index]
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0 || !lines.every((line) => HEADER_LINE.test(line)))
      break;
    for (const line of lines) {
      const [, key, value] = line.match(HEADER_LINE)!;
      header[key.trim()] = value.trim();
    }
  }

  const prose = paragraphs.slice(index).join("\n\n").trim();
  return { header, prose: prose || undefined };
}

function wikiData(item: WikiItem, name: string): string | undefined {
  return item.description_data?.find((entry) => entry.name === name)?.value;
}

function wikiAttachments(item: WikiItem): ItemSlot[] | undefined {
  const raw = wikiData(item, "Attachments");
  if (!raw) return undefined;

  const slots = raw
    .split(",")
    .map((entry): ItemSlot | null => {
      const match = entry.trim().match(/^([A-Za-z ]+?)\s*(?:\(S(\d+)\))?$/);
      if (!match) return null;
      const label =
        WIKI_ATTACHMENTS[match[1].trim().toLowerCase()] ?? match[1].trim();
      return { label, size: match[2] ? Number(match[2]) : undefined };
    })
    .filter((slot): slot is ItemSlot => slot !== null);

  return slots.length > 0 ? slots : undefined;
}

function wikiWeapon(item: WikiItem, header: Record<string, string>) {
  const weapon = item.personal_weapon;
  if (!weapon) return undefined;

  const dps = Math.max(
    0,
    ...(weapon.modes ?? []).map((mode) => mode.damage_per_second ?? 0),
  );
  const profile: WeaponStat[] = [
    ...(dps > 0 ? [{ label: "DPS", value: Math.round(dps) }] : []),
    ...(weapon.damage_per_shot
      ? [{ label: "Dégâts par tir", value: weapon.damage_per_shot }]
      : []),
    ...(leadingNumber(wikiData(item, "Effective Range"))
      ? [
          {
            label: "Portée efficace",
            value: leadingNumber(wikiData(item, "Effective Range"))!,
            unit: "m",
          },
        ]
      : []),
  ];

  return {
    damageType: header["Classe"] ?? weapon.class,
    rateOfFire:
      leadingNumber(wikiData(item, "Rate Of Fire")) ?? number(weapon.rpm),
    magazine:
      leadingNumber(wikiData(item, "Magazine Size")) ??
      number(weapon.magazine_size),
    mass: number(item.mass),
    profile,
    attachments: wikiAttachments(item),
  };
}

/** "arctic01" → "Arctic 01": the variant token of a class name, made readable. */
function prettyToken(token: string): string {
  return token
    .replace(/([a-z])(\d)/gi, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function wikiCandidate(item: WikiItem): Candidate {
  const target = WIKI_TYPES[item.type];
  const { header, prose } = splitWikiDescription(item.description);

  // Variants share the base item's class name plus one token: the group is
  // the base name, and the token names the variant.
  const segments = item.class_name?.split("_") ?? [];
  const isVariant = item.is_base_variant === false && segments.length > 2;
  const variantGroup = isVariant
    ? segments.slice(0, -1).join("_")
    : item.class_name;
  const variantToken = isVariant ? segments[segments.length - 1] : undefined;

  const handled =
    target.kind === "weapon" ? WIKI_WEAPON_HEADER_HANDLED : WIKI_HEADER_HANDLED;
  const statistics: ItemStatistics = Object.fromEntries(
    Object.entries(header)
      .filter(([key]) => !handled.has(key))
      .map(([key, value]) => [key, { value }]),
  );

  const input: ItemInput = {
    name: item.name,
    kind: target.kind,
    category: target.category,
    subcategory:
      target.subcategory ??
      header["Type d'article"] ??
      item.personal_weapon?.type ??
      item.sub_type_label ??
      undefined,
    manufacturer: item.manufacturer?.name ?? header["Fabricant"],
    size: number(item.size),
    description: prose,
    imageUrl: item.images?.[0]?.original_url ?? undefined,
    statistics,
    variantGroup: variantGroup || undefined,
    variantName: variantToken ? prettyToken(variantToken) : undefined,
    weapon: target.kind === "weapon" ? wikiWeapon(item, header) : undefined,
    source: { name: "scwiki", id: item.uuid, url: item.web_url },
  };

  return {
    input,
    slugFallbacks: [variantToken, item.manufacturer?.code].filter(
      (s): s is string => !!s,
    ),
  };
}

async function importScWiki(options: Options, report: Report): Promise<void> {
  const types = options.types ?? Object.keys(WIKI_TYPES);
  const unknown = types.filter((type) => !WIKI_TYPES[type]);
  if (unknown.length) {
    console.error(
      `Types wiki inconnus : ${unknown.join(", ")}. Connus : ${Object.keys(WIKI_TYPES).join(", ")}`,
    );
    process.exit(1);
  }

  for (const type of types) {
    console.log(`\nStar Citizen Wiki — ${type}`);
    const items: WikiItem[] = [];
    let url: string | null | undefined =
      `${WIKI_URL}/items?filter%5Btype%5D=${type}&limit=100&locale=fr_FR&include=shops`;

    // Following `links.next` rather than counting pages: the API decides how
    // many there are. Stops early once --limit is satisfied.
    while (url) {
      const page: WikiPage = await fetchJson<WikiPage>(url);
      items.push(...page.data);
      url = page.links?.next;
      if (options.limit && !options.filter && items.length >= options.limit)
        break;
      if (url) await sleep(250);
    }

    const selected = select(items, (item) => item.name, options);
    console.log(`  ${selected.length} objet(s) retenu(s) sur ${items.length}`);
    await persist(selected.map(wikiCandidate), options, report);
  }
}

// ─── UEX — ressources et cours ────────────────────────────────────────────────

type UexCommodity = {
  id: number;
  name: string;
  code: string;
  kind: string;
  wiki?: string | null;
  is_visible: number;
  is_temporary: number;
  is_raw: number;
  is_refined: number;
  is_illegal: number;
  is_volatile_qt: number;
  is_volatile_time: number;
};

type UexPrice = {
  id_commodity: number;
  terminal_name: string;
  price_buy: number;
  price_sell: number;
  scu_buy: number;
  scu_sell_stock: number;
};

const UEX_URL = "https://api.uexcorp.space/2.0";

const UEX_KINDS: Record<string, string> = {
  metal: "Métal",
  mineral: "Minéral",
  gas: "Gaz",
  halogen: "Halogène",
  agricultural: "Agricole",
  medical: "Médical",
  medicine: "Médical",
  food: "Alimentaire",
  drug: "Drogue",
  vice: "Vice",
  scrap: "Ferraille",
  waste: "Déchets",
  fuel: "Carburant",
  alloy: "Alliage",
  explosive: "Explosif",
  ammunition: "Munitions",
  "non-metal": "Non-métal",
  "raw materials": "Matières premières",
  "man-made": "Manufacturé",
  natural: "Naturel",
  chemical: "Chimique",
  electronics: "Électronique",
  organic: "Organique",
  organics: "Organique",
};

/**
 * UEX speaks from the player's side: `price_sell` is what a terminal pays for
 * the commodity, `price_buy` what it charges. The fiche speaks from the
 * counter's side — "buy" is a counter buying — so the two are swapped here.
 */
function uexMarkets(rows: UexPrice[]): ResourceMarket[] {
  const buying = rows
    .filter((row) => row.price_sell > 0 && row.terminal_name)
    .map(
      (row): ResourceMarket => ({
        location: row.terminal_name,
        side: "buy",
        price: row.price_sell,
        stock: row.scu_sell_stock > 0 ? row.scu_sell_stock : undefined,
      }),
    )
    .sort((a, b) => b.price - a.price);

  const selling = rows
    .filter((row) => row.price_buy > 0 && row.terminal_name)
    .map(
      (row): ResourceMarket => ({
        location: row.terminal_name,
        side: "sell",
        price: row.price_buy,
        stock: row.scu_buy > 0 ? row.scu_buy : undefined,
      }),
    )
    .sort((a, b) => a.price - b.price);

  return [...buying, ...selling].slice(0, MAX_ITEM_ROWS);
}

async function importUex(options: Options, report: Report): Promise<void> {
  console.log("\nUEX — ressources");
  const [{ data: commodities }, { data: prices }] = await Promise.all([
    fetchJson<{ data: UexCommodity[] }>(`${UEX_URL}/commodities`),
    fetchJson<{ data: UexPrice[] }>(`${UEX_URL}/commodities_prices_all`),
  ]);

  const pricesByCommodity = new Map<number, UexPrice[]>();
  for (const row of prices) {
    const list = pricesByCommodity.get(row.id_commodity) ?? [];
    list.push(row);
    pricesByCommodity.set(row.id_commodity, list);
  }

  const tradeable = commodities.filter(
    (c) =>
      c.is_visible && !c.is_temporary && c.kind?.toLowerCase() !== "temporary",
  );
  const selected = select(tradeable, (c) => c.name, options);
  console.log(
    `  ${selected.length} ressource(s) retenue(s) sur ${tradeable.length}`,
  );

  const candidates: Candidate[] = selected.map((commodity) => {
    const form = commodity.is_raw
      ? "Brut"
      : commodity.is_refined
        ? "Raffiné"
        : undefined;
    const kind = commodity.kind?.trim() ?? "";

    const input: ItemInput = {
      name: commodity.name,
      kind: "resource",
      category: UEX_KINDS[kind.toLowerCase()] ?? (kind || "Ressource"),
      subcategory: form,
      statistics: commodity.is_illegal
        ? { Légalité: { value: "Illégal" } }
        : undefined,
      // Raw ore and its refined form are two objects of one family.
      variantGroup: commodity.code
        ? `uex-${commodity.code.toLowerCase()}`
        : undefined,
      variantName: form,
      resource: {
        form,
        volatile: Boolean(
          commodity.is_volatile_qt || commodity.is_volatile_time,
        ),
        markets: uexMarkets(pricesByCommodity.get(commodity.id) ?? []),
      },
      source: {
        name: "uex",
        id: String(commodity.id),
        url: commodity.wiki ?? undefined,
      },
    };

    return {
      input,
      slugFallbacks: [commodity.code, "uex"].filter(Boolean) as string[],
    };
  });

  await persist(candidates, options, report);
}

// ─── Programme ────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report: Report = { created: 0, updated: 0, skipped: 0, failed: 0 };

  if (options.mirrorImages && !process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("--mirror-images demande BLOB_READ_WRITE_TOKEN");
    process.exit(1);
  }

  console.log(
    `Import ${options.source}${options.dryRun ? " (simulation)" : ""}${options.update ? " avec mise à jour" : ""}`,
  );

  if (options.source === "rsi" || options.source === "all")
    await importRsi(options, report);
  if (options.source === "scwiki" || options.source === "all")
    await importScWiki(options, report);
  if (options.source === "uex" || options.source === "all")
    await importUex(options, report);

  if (!options.dryRun) {
    console.log(
      `\nTerminé : ${report.created} créé(s), ${report.updated} mis à jour, ${report.skipped} déjà présent(s), ${report.failed} en erreur.`,
    );
  }

  await db.close();
  process.exitCode = report.failed > 0 ? 2 : 0;
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
