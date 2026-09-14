import "server-only";

import type { Document } from "bson";
import type { UpdateFilter } from "mongodb";
import db from "@/lib/db";
import { buildComparisonGroups } from "@/lib/item-comparison";
import {
  ITEM_PAGE_SIZE,
  MAX_COMPARE_ITEMS,
  MAX_ITEM_NAME_LENGTH,
  MAX_ITEM_PAGE_SIZE,
  MAX_ITEM_TEXT_LENGTH,
  EXTRACTION_FREQUENCIES,
  ITEM_SOURCES,
  MAX_ITEM_ROWS,
  RESOURCE_MARKET_SIDES,
  isItemKind,
  toItemSlug,
  type ExtractionFrequency,
  type Item,
  type ItemBlueprintLink,
  type ItemComparison,
  type ItemDetails,
  type ItemFacets,
  type ItemKind,
  type ItemSlot,
  type ItemSource,
  type ItemSourceName,
  type ItemStatistics,
  type ItemSummary,
  type ResolvedItemSlot,
  type ResourceDetails,
  type ResourceExtraction,
  type ResourceMarket,
  type ResourceMarketSide,
  type ResourceRefining,
  type VehicleDetails,
  type VehiclePlans,
  type WeaponAmmunition,
  type WeaponDetails,
  type WeaponFireMode,
  type WeaponSpread,
  type WeaponPeer,
  type WeaponStat,
  type WeaponStatScale,
} from "@/types/items";

const COLLECTION = "gameItems";
const BLUEPRINTS_COLLECTION = "blueprints";

type ItemDbModel = Item;

/**
 * The slug is what every page and every link targets, so its uniqueness is
 * enforced by the database — the indexes `scripts/ensure-indexes.ts` creates,
 * the source one included — rather than by a read-then-write check that two
 * concurrent creates could both pass.
 */
function collection() {
  return db.db().collection<ItemDbModel>(COLLECTION);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}

/**
 * Escapes regex metacharacters: these filters are publicly reachable, so an
 * unescaped `$regex` would let a caller change the matching semantics or send
 * a pathological pattern.
 */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function text(value: unknown, maxLength = MAX_ITEM_TEXT_LENGTH): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(
  value: unknown,
  maxLength = MAX_ITEM_TEXT_LENGTH,
): string | undefined {
  return text(value, maxLength) || undefined;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * A url the fiche will hand to the browser — an `<img src>`, a model the 3D
 * viewer fetches. Only http(s) survives: an administrator types these by hand,
 * and a `javascript:` or `data:` url in that field would run on every visit.
 */
function optionalUrl(value: unknown): string | undefined {
  const url = optionalText(value, 2048);
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

function normalizeStatistics(value: unknown): ItemStatistics | undefined {
  if (!value || typeof value !== "object") return undefined;

  const statistics: ItemStatistics = {};
  for (const [rawName, rawStat] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const name = text(rawName, MAX_ITEM_NAME_LENGTH);
    if (!name || !rawStat || typeof rawStat !== "object") continue;

    const { value: statValue, unit } = rawStat as {
      value?: unknown;
      unit?: unknown;
    };
    if (typeof statValue !== "string" && typeof statValue !== "number") {
      continue;
    }
    const normalizedValue =
      typeof statValue === "string"
        ? text(statValue, MAX_ITEM_NAME_LENGTH)
        : statValue;
    if (normalizedValue === "") continue;

    statistics[name] = {
      value: normalizedValue,
      ...(optionalText(unit, 24) ? { unit: text(unit, 24) } : {}),
    };
  }

  return Object.keys(statistics).length > 0 ? statistics : undefined;
}

function normalizeSlugList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const slugs = [
    ...new Set(
      value
        .map((entry) => text(entry, MAX_ITEM_NAME_LENGTH))
        .filter((entry): entry is string => !!entry),
    ),
  ];

  return slugs.length > 0 ? slugs : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

/** Keeps a list of form rows bounded and drops the ones with no content. */
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> =>
        !!entry && typeof entry === "object",
    )
    .slice(0, MAX_ITEM_ROWS);
}

function normalizeSlots(value: unknown): ItemSlot[] | undefined {
  const slots = rows(value)
    .map((row): ItemSlot | null => {
      const label = text(row.label, MAX_ITEM_NAME_LENGTH);
      if (!label) return null;

      return {
        label,
        size: optionalNumber(row.size),
        itemSlug: optionalText(row.itemSlug, MAX_ITEM_NAME_LENGTH),
        itemName: optionalText(row.itemName, MAX_ITEM_NAME_LENGTH),
        quantity: optionalNumber(row.quantity),
        note: optionalText(row.note, MAX_ITEM_NAME_LENGTH),
      };
    })
    .filter((slot): slot is ItemSlot => slot !== null);

  return slots.length > 0 ? slots : undefined;
}

/** Drops a details block that carries nothing, so the view shows its notice. */
function compact<T extends object>(details: T): T | undefined {
  const hasValue = Object.values(details).some(
    (value) => value !== undefined && value !== "",
  );
  return hasValue ? details : undefined;
}

function normalizeVehiclePlans(value: unknown): VehiclePlans | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  return compact({
    top: optionalUrl(input.top),
    side: optionalUrl(input.side),
    front: optionalUrl(input.front),
    holo: optionalUrl(input.holo),
  });
}

function normalizeVehicle(value: unknown): VehicleDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  return compact({
    crew: optionalNumber(input.crew),
    speedMax: optionalNumber(input.speedMax),
    speedScm: optionalNumber(input.speedScm),
    cargoScu: optionalNumber(input.cargoScu),
    mass: optionalNumber(input.mass),
    length: optionalNumber(input.length),
    width: optionalNumber(input.width),
    height: optionalNumber(input.height),
    hardpoints: normalizeSlots(input.hardpoints),
    components: normalizeSlots(input.components),
    plans: normalizeVehiclePlans(input.plans),
  });
}

function normalizeWeaponProfile(value: unknown): WeaponStat[] | undefined {
  const profile = rows(value)
    .map((row): WeaponStat | null => {
      const label = text(row.label, MAX_ITEM_NAME_LENGTH);
      const statValue = optionalNumber(row.value);
      if (!label || statValue === undefined) return null;

      return {
        label,
        value: statValue,
        unit: optionalText(row.unit, 24),
      };
    })
    .filter((stat): stat is WeaponStat => stat !== null);

  return profile.length > 0 ? profile : undefined;
}

function normalizeFireModes(value: unknown): WeaponFireMode[] | undefined {
  const modes = rows(value)
    .map((row): WeaponFireMode | null => {
      const label = text(row.label, 32);
      if (!label) return null;

      return {
        label,
        rpm: optionalNumber(row.rpm),
        dps: optionalNumber(row.dps),
        ammoPerShot: optionalNumber(row.ammoPerShot),
        pelletsPerShot: optionalNumber(row.pelletsPerShot),
        burstCount: optionalNumber(row.burstCount),
        heatPerShot: optionalNumber(row.heatPerShot),
      };
    })
    .filter((mode): mode is WeaponFireMode => mode !== null);

  return modes.length > 0 ? modes : undefined;
}

function normalizeSpread(value: unknown): WeaponSpread | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  return compact({
    min: optionalNumber(input.min),
    max: optionalNumber(input.max),
    firstShot: optionalNumber(input.firstShot),
    perShot: optionalNumber(input.perShot),
    decay: optionalNumber(input.decay),
  });
}

function normalizeAmmunition(value: unknown): WeaponAmmunition | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  return compact({
    size: optionalNumber(input.size),
    speed: optionalNumber(input.speed),
    range: optionalNumber(input.range),
    lifetime: optionalNumber(input.lifetime),
    capacity: optionalNumber(input.capacity),
    damageType: optionalText(input.damageType, 40),
    damagePerShot: optionalNumber(input.damagePerShot),
    falloffStart: optionalNumber(input.falloffStart),
    falloffPerMeter: optionalNumber(input.falloffPerMeter),
    falloffMinDamage: optionalNumber(input.falloffMinDamage),
    penetration: optionalNumber(input.penetration),
  });
}

function normalizeWeapon(value: unknown): WeaponDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  return compact({
    damageType: optionalText(input.damageType, MAX_ITEM_NAME_LENGTH),
    caliber: optionalText(input.caliber, MAX_ITEM_NAME_LENGTH),
    profile: normalizeWeaponProfile(input.profile),
    rateOfFire: optionalNumber(input.rateOfFire),
    magazine: optionalNumber(input.magazine),
    reloadTime: optionalNumber(input.reloadTime),
    mass: optionalNumber(input.mass),
    attachments: normalizeSlots(input.attachments),
    fireModes: normalizeFireModes(input.fireModes),
    spread: normalizeSpread(input.spread),
    adsSpread: normalizeSpread(input.adsSpread),
    ammunition: normalizeAmmunition(input.ammunition),
  });
}

function normalizeMarkets(value: unknown): ResourceMarket[] | undefined {
  const markets = rows(value)
    .map((row): ResourceMarket | null => {
      const location = text(row.location, MAX_ITEM_NAME_LENGTH);
      const price = optionalNumber(row.price);
      if (!location || price === undefined) return null;

      const side = text(row.side, 12);
      return {
        location,
        side: ((RESOURCE_MARKET_SIDES as readonly string[]).includes(side)
          ? side
          : "buy") as ResourceMarketSide,
        price,
        stock: optionalNumber(row.stock),
      };
    })
    .filter((market): market is ResourceMarket => market !== null);

  return markets.length > 0 ? markets : undefined;
}

function normalizeExtraction(value: unknown): ResourceExtraction[] | undefined {
  const sites = rows(value)
    .map((row): ResourceExtraction | null => {
      const location = text(row.location, MAX_ITEM_NAME_LENGTH);
      if (!location) return null;

      const frequency = text(row.frequency, 16);
      return {
        location,
        method: optionalText(row.method, MAX_ITEM_NAME_LENGTH),
        frequency: (EXTRACTION_FREQUENCIES as readonly string[]).includes(
          frequency,
        )
          ? (frequency as ExtractionFrequency)
          : undefined,
      };
    })
    .filter((site): site is ResourceExtraction => site !== null);

  return sites.length > 0 ? sites : undefined;
}

function normalizeRefining(value: unknown): ResourceRefining | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  return compact({
    process: optionalText(input.process, MAX_ITEM_NAME_LENGTH),
    yield: optionalNumber(input.yield),
    durationSeconds: optionalNumber(input.durationSeconds),
    cost: optionalNumber(input.cost),
    outputName: optionalText(input.outputName, MAX_ITEM_NAME_LENGTH),
  });
}

/** Accepts the history as a list, or as the comma-separated string a form sends. */
function normalizePriceHistory(value: unknown): number[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[,;\s]+/)
      : [];

  const history = raw
    .map((entry) => optionalNumber(entry))
    .filter((entry): entry is number => entry !== undefined)
    .slice(0, MAX_ITEM_ROWS);

  return history.length > 1 ? history : undefined;
}

function normalizeSource(value: unknown): ItemSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  const name = text(input.name, 24);
  const id = text(input.id, MAX_ITEM_NAME_LENGTH);
  if (!(ITEM_SOURCES as readonly string[]).includes(name) || !id) {
    return undefined;
  }

  const importedAt = text(input.importedAt, 40);
  return {
    name: name as ItemSourceName,
    id,
    url: optionalText(input.url, 2048),
    // Only a real import sets the moment; anything carrying one along keeps it.
    importedAt: Number.isNaN(Date.parse(importedAt))
      ? new Date().toISOString()
      : importedAt,
  };
}

function normalizeResource(value: unknown): ResourceDetails | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;

  const markets = normalizeMarkets(input.markets);

  return compact({
    form: optionalText(input.form, MAX_ITEM_NAME_LENGTH),
    volatile: optionalBoolean(input.volatile),
    unitVolumeScu: optionalNumber(input.unitVolumeScu),
    purityMin: optionalNumber(input.purityMin),
    purityMax: optionalNumber(input.purityMax),
    markets,
    priceHistory: normalizePriceHistory(input.priceHistory),
    refining: normalizeRefining(input.refining),
    extraction: normalizeExtraction(input.extraction),
    transportNote: optionalText(input.transportNote),
    // Prices are only as fresh as the save that entered them, so the moment is
    // stamped here rather than typed in by hand.
    pricesUpdatedAt: markets ? new Date().toISOString() : undefined,
  });
}

export type ItemInput = {
  name: string;
  slug?: string;
  kind: string;
  description?: string;
  category: string;
  subcategory?: string;
  manufacturer?: string;
  size?: number | string;
  tier?: number | string;
  imageUrl?: string;
  statistics?: unknown;
  obtention?: string;
  blueprintSlugs?: unknown;
  variantGroup?: string;
  variantName?: string;
  setId?: string;
  setName?: string;
  vehicle?: unknown;
  weapon?: unknown;
  resource?: unknown;
  source?: unknown;
};

type NormalizedItem = Omit<Item, "id" | "createdAt" | "updatedAt">;

/**
 * Validates and cleans what a form sent. Everything optional that comes back
 * empty is dropped rather than stored as `""`, so the filters and the detail
 * page only ever see meaningful values.
 */
export function normalizeItemInput(input: ItemInput): NormalizedItem {
  const name = text(input.name, MAX_ITEM_NAME_LENGTH);
  if (!name) {
    throw new Error("Le nom de l'objet est obligatoire");
  }

  const kind = text(input.kind, 24);
  if (!isItemKind(kind)) {
    throw new Error("Type d'objet invalide");
  }

  const category = text(input.category, MAX_ITEM_NAME_LENGTH);
  if (!category) {
    throw new Error("La catégorie est obligatoire");
  }

  const slug = toItemSlug(text(input.slug, MAX_ITEM_NAME_LENGTH) || name);
  if (!slug) {
    throw new Error("Le slug est obligatoire");
  }

  const setName = optionalText(input.setName, MAX_ITEM_NAME_LENGTH);
  const setId = toItemSlug(
    text(input.setId, MAX_ITEM_NAME_LENGTH) || setName || "",
  );
  const variantGroup = toItemSlug(
    text(input.variantGroup, MAX_ITEM_NAME_LENGTH),
  );

  return {
    name,
    slug,
    kind: kind as ItemKind,
    category,
    description: optionalText(input.description),
    subcategory: optionalText(input.subcategory, MAX_ITEM_NAME_LENGTH),
    manufacturer: optionalText(input.manufacturer, MAX_ITEM_NAME_LENGTH),
    size: optionalNumber(input.size),
    tier: optionalNumber(input.tier),
    imageUrl: optionalText(input.imageUrl, 2048),
    statistics: normalizeStatistics(input.statistics),
    obtention: optionalText(input.obtention),
    blueprintSlugs: normalizeSlugList(input.blueprintSlugs),
    variantGroup: variantGroup || undefined,
    variantName: optionalText(input.variantName, MAX_ITEM_NAME_LENGTH),
    setId: setId || undefined,
    setName: setId ? (setName ?? setId) : undefined,
    // Only the block matching the kind is kept: a weapon has no business
    // carrying vehicle data, and changing an object's kind changes which fiche
    // it is answering for.
    vehicle: kind === "vehicle" ? normalizeVehicle(input.vehicle) : undefined,
    weapon: kind === "weapon" ? normalizeWeapon(input.weapon) : undefined,
    resource:
      kind === "resource" ? normalizeResource(input.resource) : undefined,
    source: normalizeSource(input.source),
  };
}

const SUMMARY_PROJECTION = {
  _id: 0,
  id: 1,
  slug: 1,
  name: 1,
  kind: 1,
  category: 1,
  subcategory: 1,
  manufacturer: 1,
  imageUrl: 1,
  tier: 1,
  variantName: 1,
  setName: 1,
} as const;

export type ItemFilters = {
  query?: string;
  kind?: string;
  category?: string;
  subcategory?: string;
  manufacturer?: string;
  setId?: string;
  variantGroup?: string;
  limit?: number;
  page?: number;
};

function buildFilter({
  query,
  kind,
  category,
  subcategory,
  manufacturer,
  setId,
  variantGroup,
}: ItemFilters): Document {
  const conditions: Document[] = [];

  if (query?.trim()) {
    const matcher = { $regex: escapeRegex(query.trim()), $options: "i" };
    conditions.push({
      $or: [
        { name: matcher },
        { description: matcher },
        { manufacturer: matcher },
        { variantName: matcher },
        { setName: matcher },
      ],
    });
  }
  if (kind && isItemKind(kind)) conditions.push({ kind });
  if (category) conditions.push({ category });
  if (subcategory) conditions.push({ subcategory });
  if (manufacturer) conditions.push({ manufacturer });
  if (setId) conditions.push({ setId });
  if (variantGroup) conditions.push({ variantGroup });

  return conditions.length > 0 ? { $and: conditions } : {};
}

/** Browse/search entry point, paginated and sorted by name. */
export async function filterItems(
  filters: ItemFilters = {},
): Promise<{ items: ItemSummary[]; total: number }> {
  const limit = Math.max(
    1,
    Math.min(MAX_ITEM_PAGE_SIZE, filters.limit ?? ITEM_PAGE_SIZE),
  );
  const page = Math.max(1, filters.page ?? 1);
  const filter = buildFilter(filters);

  const [items, total] = await Promise.all([
    collection()
      .find(filter, { projection: SUMMARY_PROJECTION })
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    collection().countDocuments(filter),
  ]);

  return { items: items as ItemSummary[], total };
}

export async function getItemBySlug(slug: string): Promise<Item | null> {
  const item = await collection().findOne({ slug }, { projection: { _id: 0 } });
  return item ?? null;
}

async function listSiblings(
  field: "variantGroup" | "setId",
  value: string,
): Promise<ItemSummary[]> {
  const siblings = await collection()
    .find({ [field]: value }, { projection: SUMMARY_PROJECTION })
    .sort({ name: 1 })
    .toArray();

  // A group of one is the item itself: nothing to show as a variant or a set.
  return siblings.length > 1 ? (siblings as ItemSummary[]) : [];
}

function toBlueprintLink(doc: Document): ItemBlueprintLink {
  return {
    slug: doc.slug,
    name: doc.name,
    category: doc.category ?? undefined,
    subcategory: doc.subcategory ?? undefined,
    imageUrl: doc.imageUrl ?? undefined,
    tier: typeof doc.tier === "number" ? doc.tier : undefined,
  };
}

const BLUEPRINT_PROJECTION = {
  _id: 0,
  slug: 1,
  name: 1,
  category: 1,
  subcategory: 1,
  imageUrl: 1,
  tier: 1,
} as const;

/**
 * Blueprints crafting this item. Declared slugs win; without any, blueprints
 * carrying exactly the same name are proposed, which covers the items imported
 * before anyone linked them by hand.
 */
export async function getBlueprintsForItem(
  item: Pick<Item, "name" | "blueprintSlugs">,
): Promise<{ blueprints: ItemBlueprintLink[]; inferred: boolean }> {
  const blueprints = db.db().collection(BLUEPRINTS_COLLECTION);

  if (item.blueprintSlugs && item.blueprintSlugs.length > 0) {
    const docs = await blueprints
      .find(
        { slug: { $in: item.blueprintSlugs } },
        { projection: BLUEPRINT_PROJECTION },
      )
      .toArray();

    return { blueprints: docs.map(toBlueprintLink), inferred: false };
  }

  const docs = await blueprints
    .find(
      { name: { $regex: `^${escapeRegex(item.name)}$`, $options: "i" } },
      { projection: BLUEPRINT_PROJECTION },
    )
    .limit(10)
    .toArray();

  return { blueprints: docs.map(toBlueprintLink), inferred: docs.length > 0 };
}

/** What a slot can hold: a vehicle or a resource is never mounted on anything. */
const MOUNTABLE_KINDS: ItemKind[] = ["item", "weapon"];

/** What has slots: vehicles (hardpoints, components) and weapons (attachments). */
const CARRIER_KINDS: ItemKind[] = ["vehicle", "weapon"];

/** The slot lists of the model, as dotted paths into a stored document. */
const SLOT_PATHS = [
  "vehicle.hardpoints",
  "vehicle.components",
  "weapon.attachments",
] as const;

/** Case- and spacing-insensitive key two names are compared on. */
function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Anchored, case-insensitive matcher for a name, tolerant to spacing. */
function nameMatcher(name: string): RegExp {
  const parts = name.trim().split(/\s+/).map(escapeRegex);
  return new RegExp(`^\\s*${parts.join("\\s+")}\\s*$`, "i");
}

/**
 * The fiche each name designates, among the objects a slot can hold. The game
 * data names one weapon several times (the base, the copy mounted on a given
 * ship, a paint); the plainest fiche — no variant, shortest slug — wins, so a
 * name always links to the same page.
 */
async function findMountableByName(
  names: Iterable<string>,
): Promise<Map<string, ItemSummary>> {
  const wanted = [...new Set([...names].map(nameKey).filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const found = (await collection()
    .find(
      {
        kind: { $in: MOUNTABLE_KINDS },
        name: { $in: wanted.map(nameMatcher) },
      },
      { projection: SUMMARY_PROJECTION },
    )
    .toArray()) as ItemSummary[];

  const rank = (item: ItemSummary) =>
    `${item.variantName ? 1 : 0}${String(item.slug.length).padStart(4, "0")}${item.slug}`;

  const byName = new Map<string, ItemSummary>();
  for (const item of found.sort((a, b) => rank(a).localeCompare(rank(b)))) {
    const key = nameKey(item.name);
    if (!byName.has(key)) byName.set(key, item);
  }
  return byName;
}

/**
 * Resolves the objects mounted in a set of slots, so a vehicle's armament and
 * components link to the fiches of the items they carry. A slot that names
 * its object without pointing to a fiche — the ship matrix names what a hull
 * carries, never our slugs — is matched on that name, so the link appears as
 * soon as the fiche exists, whichever side was created first. A slug that
 * points nowhere is left alone: an explicit link an administrator chose must
 * not be silently redirected to whatever fiche shares the name.
 */
async function resolveSlots(
  ...groups: (ItemSlot[] | undefined)[]
): Promise<ResolvedItemSlot[][]> {
  const slots = groups.flatMap((group) => group ?? []);
  const slugs = [
    ...new Set(
      slots
        .map((slot) => slot.itemSlug)
        .filter((slug): slug is string => !!slug),
    ),
  ];

  const mounted =
    slugs.length > 0
      ? await collection()
          .find({ slug: { $in: slugs } }, { projection: SUMMARY_PROJECTION })
          .toArray()
      : [];

  const bySlug = new Map(
    (mounted as ItemSummary[]).map((item) => [item.slug, item]),
  );

  const byName = await findMountableByName(
    slots
      .filter((slot) => !slot.itemSlug)
      .map((slot) => slot.itemName)
      .filter((name): name is string => !!name),
  );

  return groups.map((group) =>
    (group ?? []).map((slot) => ({
      ...slot,
      mounted: slot.itemSlug
        ? bySlug.get(slot.itemSlug)
        : slot.itemName
          ? byName.get(nameKey(slot.itemName))
          : undefined,
    })),
  );
}

/**
 * Objects carrying this one in a slot — the vehicles a weapon or component
 * ships on, the weapons an accessory fits. Matched by slug, and by name when
 * this fiche is the one its name designates (see `findMountableByName`), so
 * the list mirrors what the slots themselves link to.
 */
async function getMountedOn(item: Item): Promise<ItemSummary[]> {
  if (!MOUNTABLE_KINDS.includes(item.kind)) return [];

  const byName = await findMountableByName([item.name]);
  const designated = byName.get(nameKey(item.name))?.slug === item.slug;
  const matcher = nameMatcher(item.name);

  const references: Document[] = SLOT_PATHS.flatMap((path) => [
    { [`${path}.itemSlug`]: item.slug },
    ...(designated ? [{ [`${path}.itemName`]: matcher }] : []),
  ]);

  const carriers = await collection()
    .find(
      {
        kind: { $in: CARRIER_KINDS },
        slug: { $ne: item.slug },
        $or: references,
      },
      { projection: SUMMARY_PROJECTION },
    )
    .sort({ name: 1 })
    .limit(MAX_ITEM_ROWS)
    .toArray();
  return carriers as ItemSummary[];
}

export type SlotLinkReport = {
  /** Objects whose slots gained at least one link. */
  items: number;
  /** Slots linked. */
  slots: number;
};

function slotsAt(doc: Document, path: string): ItemSlot[] | undefined {
  const [block, key] = path.split(".");
  const slots = doc[block]?.[key];
  return Array.isArray(slots) ? (slots as ItemSlot[]) : undefined;
}

/**
 * Writes the name matches down: every slot naming an object without a slug
 * gets the slug of the fiche its name designates. The pages already resolve
 * names on the fly; persisting the link shows it in the admin form and keeps
 * it if the fiche is later renamed. Run after an import, whichever side of
 * the link it brought.
 */
export async function linkSlotsByName(): Promise<SlotLinkReport> {
  // `$in: [null]` also matches a missing key: the admin form and the import
  // both drop an empty slug, but older documents may carry it as `null`.
  const unlinked = {
    $elemMatch: { itemName: { $exists: true }, itemSlug: { $in: [null, ""] } },
  };
  const docs = await collection()
    .find(
      { $or: SLOT_PATHS.map((path) => ({ [path]: unlinked })) },
      { projection: { _id: 0, slug: 1, vehicle: 1, weapon: 1 } },
    )
    .toArray();

  const byName = await findMountableByName(
    docs.flatMap((doc) =>
      SLOT_PATHS.flatMap((path) =>
        (slotsAt(doc, path) ?? [])
          .map((slot) => slot.itemName)
          .filter((name): name is string => !!name),
      ),
    ),
  );

  const report: SlotLinkReport = { items: 0, slots: 0 };
  for (const doc of docs) {
    const $set: Document = {};
    let linked = 0;
    for (const path of SLOT_PATHS) {
      const slots = slotsAt(doc, path);
      if (!slots) continue;
      const next = slots.map((slot) => {
        if (slot.itemSlug || !slot.itemName) return slot;
        const match = byName.get(nameKey(slot.itemName));
        if (!match || match.slug === doc.slug) return slot;
        linked++;
        return { ...slot, itemSlug: match.slug };
      });
      if (next.some((slot, index) => slot !== slots[index])) $set[path] = next;
    }
    if (linked > 0) {
      await collection().updateOne({ slug: doc.slug }, { $set });
      report.items++;
      report.slots += linked;
    }
  }
  return report;
}

/**
 * Carries the links of the stored slots over to the incoming ones: a source
 * replaces a slot list whole, but a slug set on a slot — by an administrator
 * or by the linking pass — survives as long as the source still names the
 * same object in a slot of the same label.
 */
function carrySlotLinks(incoming: ItemSlot[], stored: ItemSlot[]): ItemSlot[] {
  const linked = new Map(
    stored
      .filter((slot) => slot.itemSlug && slot.itemName)
      .map((slot) => [
        `${nameKey(slot.label)}|${nameKey(slot.itemName!)}`,
        slot.itemSlug!,
      ]),
  );
  return incoming.map((slot) => {
    if (slot.itemSlug || !slot.itemName) return slot;
    const itemSlug = linked.get(
      `${nameKey(slot.label)}|${nameKey(slot.itemName)}`,
    );
    return itemSlug ? { ...slot, itemSlug } : slot;
  });
}

/**
 * Blueprints consuming this object as a material. Matched on the name, which
 * is how a recipe names its components — a resource is rarely linked by hand.
 */
async function getBlueprintsConsuming(
  name: string,
): Promise<ItemBlueprintLink[]> {
  const matcher = { $regex: `^${escapeRegex(name)}$`, $options: "i" };

  const docs = await db
    .db()
    .collection(BLUEPRINTS_COLLECTION)
    .find(
      { "recipe.components.options": { $elemMatch: { name: matcher } } },
      { projection: { ...BLUEPRINT_PROJECTION, "recipe.components": 1 } },
    )
    .limit(12)
    .toArray();

  return docs.map((doc) => {
    const options = (
      (doc.recipe?.components ?? []) as {
        options?: { name?: string; quantity?: number }[];
      }[]
    ).flatMap((component) => component.options ?? []);
    const used = options.find(
      (option) => option.name?.toLowerCase() === name.toLowerCase(),
    );

    return { ...toBlueprintLink(doc), quantity: used?.quantity };
  });
}

/**
 * Rescales a weapon's profile against the weapons it shares a category with:
 * the class maximum fills the bar, the class average marks the tick. Computing
 * both here rather than storing them keeps the comparison honest as the
 * catalogue grows.
 */
async function getWeaponComparison(
  item: Item,
): Promise<{ profile: WeaponStatScale[]; peers: WeaponPeer[] }> {
  const profile = item.weapon?.profile;
  if (!profile || profile.length === 0) return { profile: [], peers: [] };

  const siblings = (await collection()
    .find(
      {
        kind: "weapon",
        category: item.category,
        ...(item.subcategory ? { subcategory: item.subcategory } : {}),
        "weapon.profile": { $exists: true },
      },
      { projection: { _id: 0, slug: 1, name: 1, weapon: 1 } },
    )
    .limit(80)
    .toArray()) as unknown as Pick<Item, "slug" | "name" | "weapon">[];

  const valuesByLabel = new Map<string, number[]>();
  for (const sibling of siblings) {
    for (const stat of sibling.weapon?.profile ?? []) {
      const values = valuesByLabel.get(stat.label) ?? [];
      values.push(stat.value);
      valuesByLabel.set(stat.label, values);
    }
  }

  const scaled = profile.map((stat) => {
    const values = valuesByLabel.get(stat.label) ?? [stat.value];
    const average =
      values.length > 1
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : undefined;

    return {
      ...stat,
      max: Math.max(stat.value, ...values) || 1,
      average,
      comparable: values.length > 1,
    };
  });

  // The comparison chart ranks the class on the first stat of the profile,
  // which is the headline figure the fiche leads with.
  const headline = profile[0].label;
  const peers = siblings
    .map((sibling) => {
      const stat = sibling.weapon?.profile?.find(
        (entry) => entry.label === headline,
      );
      return stat
        ? {
            slug: sibling.slug,
            name: sibling.name,
            value: stat.value,
            isCurrent: sibling.slug === item.slug,
          }
        : null;
    })
    .filter((peer): peer is WeaponPeer => peer !== null)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  return { profile: scaled, peers: peers.length > 1 ? peers : [] };
}

/** Everything the detail page shows: the item, its blueprints, variants and set. */
export async function getItemDetails(
  slug: string,
): Promise<ItemDetails | null> {
  const item = await getItemBySlug(slug);
  if (!item) return null;

  const [
    { blueprints, inferred },
    consumedBy,
    variants,
    setItems,
    [hardpoints, components, attachments],
    weaponComparison,
    mountedOn,
  ] = await Promise.all([
    getBlueprintsForItem(item),
    getBlueprintsConsuming(item.name),
    item.variantGroup ? listSiblings("variantGroup", item.variantGroup) : [],
    item.setId ? listSiblings("setId", item.setId) : [],
    resolveSlots(
      item.vehicle?.hardpoints,
      item.vehicle?.components,
      item.weapon?.attachments,
    ),
    getWeaponComparison(item),
    getMountedOn(item),
  ]);

  return {
    ...item,
    blueprints,
    blueprintsInferred: inferred,
    consumedBy,
    variants,
    setItems,
    hardpoints,
    components,
    attachments,
    weaponProfile: weaponComparison.profile,
    weaponPeers: weaponComparison.peers,
    mountedOn,
  };
}

/** Les fiches demandées, dans l'ordre des slugs — les inconnues sont sautées. */
export async function getItemsBySlugs(slugs: string[]): Promise<Item[]> {
  if (slugs.length === 0) return [];

  const found = (await collection()
    .find({ slug: { $in: slugs } }, { projection: { _id: 0 } })
    .limit(slugs.length)
    .toArray()) as unknown as Item[];

  const bySlug = new Map(found.map((item) => [item.slug, item]));

  return slugs
    .map((slug) => bySlug.get(slug))
    .filter((item): item is Item => item !== undefined);
}

function toSummary(item: Item): ItemSummary {
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    kind: item.kind,
    category: item.category,
    subcategory: item.subcategory,
    manufacturer: item.manufacturer,
    imageUrl: item.imageUrl,
    tier: item.tier,
    variantName: item.variantName,
    setName: item.setName,
  };
}

/**
 * Une comparaison multi-colonnes, verrouillée sur le type du premier objet
 * demandé : un lien partagé peut mélanger un vaisseau et un bouclier, la vue
 * écarte alors ce qui ne se compare pas plutôt que d'échouer.
 */
export async function getItemComparison(
  slugs: string[],
): Promise<ItemComparison | null> {
  const found = await getItemsBySlugs(slugs.slice(0, MAX_COMPARE_ITEMS));
  if (found.length === 0) return null;

  const kind = found[0].kind;
  const kept = found.filter((item) => item.kind === kind);

  return {
    items: kept.map(toSummary),
    kind,
    category: found[0].category,
    subcategory: found[0].subcategory,
    groups: buildComparisonGroups(kept),
    missing: slugs.filter((slug) => !found.some((item) => item.slug === slug)),
    rejected: found.filter((item) => item.kind !== kind).map(toSummary),
  };
}

export async function getItemFacets(): Promise<ItemFacets> {
  const [facets] = await collection()
    .aggregate<{
      categories: { _id: string; subcategories: (string | null)[] }[];
      manufacturers: { _id: string }[];
      variantGroups: { _id: string; name?: string | null }[];
      sets: { _id: string; name?: string | null }[];
    }>([
      {
        $facet: {
          categories: [
            { $match: { category: { $nin: [null, ""] } } },
            {
              $group: {
                _id: "$category",
                subcategories: { $addToSet: "$subcategory" },
              },
            },
            { $sort: { _id: 1 } },
          ],
          manufacturers: [
            { $match: { manufacturer: { $nin: [null, ""] } } },
            { $group: { _id: "$manufacturer" } },
            { $sort: { _id: 1 } },
          ],
          variantGroups: [
            { $match: { variantGroup: { $nin: [null, ""] } } },
            { $group: { _id: "$variantGroup" } },
            { $sort: { _id: 1 } },
          ],
          sets: [
            { $match: { setId: { $nin: [null, ""] } } },
            { $group: { _id: "$setId", name: { $first: "$setName" } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ])
    .toArray();

  return {
    categories: (facets?.categories ?? []).map((entry) => ({
      category: entry._id,
      subcategories: entry.subcategories
        .filter((sub): sub is string => !!sub)
        .sort((a, b) => a.localeCompare(b)),
    })),
    manufacturers: (facets?.manufacturers ?? []).map((entry) => entry._id),
    variantGroups: (facets?.variantGroups ?? []).map((entry) => ({
      id: entry._id,
      name: entry._id,
    })),
    sets: (facets?.sets ?? []).map((entry) => ({
      id: entry._id,
      name: entry.name ?? entry._id,
    })),
  };
}

/**
 * Drops every `undefined`, at any depth. The driver would otherwise store them
 * as `null`, and a `null` speed reads back as a real zero on the fiche.
 */
function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutUndefined(entry)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, withoutUndefined(entry)]),
    ) as T;
  }
  return value;
}

export async function createItem(input: ItemInput): Promise<Item> {
  const normalized = normalizeItemInput(input);

  const { nanoid } = await import("nanoid");
  const now = new Date().toISOString();
  const item: Item = {
    ...normalized,
    id: nanoid(),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await collection().insertOne(withoutUndefined(item) as ItemDbModel);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const { keyPattern } = error as { keyPattern?: Record<string, unknown> };
      throw Object.assign(
        new Error(
          keyPattern && "source.id" in keyPattern
            ? `Un objet importé porte déjà la provenance de « ${item.name} »`
            : `Un objet utilise déjà le slug « ${item.slug} »`,
        ),
        { code: 11000, keyPattern },
      );
    }
    throw error;
  }

  return item;
}

export async function updateItem(
  currentSlug: string,
  input: ItemInput,
): Promise<Item> {
  const normalized = normalizeItemInput(input);

  const entries = Object.entries(normalized) as [
    keyof NormalizedItem,
    unknown,
  ][];

  // A field the form left empty is removed rather than written as `undefined`
  // (which the driver would store as `null`), otherwise the old value would
  // survive an edit meant to clear it — and `$set` and `$unset` cannot both
  // carry the same path. Provenance is the exception: the admin form never
  // sends it, and an edit must not turn an imported object into a hand-made
  // one that the next import would then duplicate.
  const $set: Document = withoutUndefined(
    Object.fromEntries(entries.filter(([, value]) => value !== undefined)),
  ) as Document;
  const $unset: Document = Object.fromEntries(
    entries
      .filter(([key, value]) => value === undefined && key !== "source")
      .map(([key]) => [key, ""]),
  );

  try {
    const updated = await collection().findOneAndUpdate(
      { slug: currentSlug },
      {
        $set: { ...$set, updatedAt: new Date().toISOString() },
        ...(Object.keys($unset).length > 0 ? { $unset } : {}),
      } as UpdateFilter<ItemDbModel>,
      { returnDocument: "after", projection: { _id: 0 } },
    );

    if (!updated) {
      throw new Error("Objet introuvable");
    }

    return updated as Item;
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new Error(`Un objet utilise déjà le slug « ${normalized.slug} »`);
    }
    throw error;
  }
}

export async function findItemBySource(
  name: ItemSourceName,
  id: string,
): Promise<Item | null> {
  const item = await collection().findOne(
    { "source.name": name, "source.id": id },
    { projection: { _id: 0 } },
  );
  return item ?? null;
}

export type ImportOutcome = {
  action: "created" | "updated" | "skipped";
  item: Item;
};

/**
 * Creates the object an import found, or refreshes the one a previous import
 * created from the same source id. Refreshing merges over the stored document,
 * so what an administrator added by hand and the source does not know about
 * (blueprint links, an ensemble, a note) survives the sync — while the blocks
 * the source does provide are rewritten with its latest data.
 *
 * A slug already taken by another object gets the fallbacks in turn, then a
 * counter: two sources naming things alike must never silently share a page.
 */
export async function upsertImportedItem(
  input: ItemInput,
  {
    update = false,
    slugFallbacks = [],
  }: { update?: boolean; slugFallbacks?: string[] } = {},
): Promise<ImportOutcome> {
  const source = normalizeSource(input.source);
  if (!source) {
    throw new Error("Un objet importé doit porter sa provenance");
  }

  const existing = await findItemBySource(source.name, source.id);

  if (existing) {
    if (!update) {
      return { action: "skipped", item: existing };
    }

    // Only what the source actually provides is refreshed: a key it leaves
    // undefined must not erase a stored value (a spread would) — and that
    // holds one level down too, inside the kind-specific block, so a spread
    // an administrator typed survives a source that knows nothing of it.
    // Lists inside the block (slots, prices) are replaced whole: there is no
    // sensible way to merge two of them. And the two prose fields are the
    // ones an administrator rewrites — once filled, the source never
    // overwrites them.
    const provided = defined(input);
    for (const block of ["vehicle", "weapon", "resource"] as const) {
      const incoming = provided[block];
      const stored = existing[block];
      if (incoming && typeof incoming === "object" && stored) {
        provided[block] = { ...stored, ...defined(incoming as object) };
      }
    }
    for (const path of SLOT_PATHS) {
      const incoming = slotsAt(provided as Document, path);
      const stored = slotsAt(existing as Document, path);
      if (incoming && stored) {
        const [block, key] = path.split(".");
        (provided as Document)[block][key] = carrySlotLinks(incoming, stored);
      }
    }

    const item = await updateItem(existing.slug, {
      ...existing,
      ...provided,
      description: existing.description ?? provided.description,
      obtention: existing.obtention ?? provided.obtention,
      // The slug is the page's address: an update never moves it.
      slug: existing.slug,
    } as ItemInput);
    return { action: "updated", item };
  }

  const base = toItemSlug(text(input.slug, MAX_ITEM_NAME_LENGTH) || input.name);
  const candidates = [
    base,
    ...slugFallbacks.map((hint) => toItemSlug(`${base} ${hint}`)),
    ...[2, 3, 4, 5].map((n) => `${base}-${n}`),
  ];

  for (const slug of candidates) {
    try {
      const item = await createItem({ ...input, slug });
      return { action: "created", item };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      // Another run of the import got there first: the object exists now.
      // Trying more slugs would only fail the same way.
      if (isSourceConflict(error)) {
        const created = await findItemBySource(source.name, source.id);
        if (created) return { action: "skipped", item: created };
      }
    }
  }

  throw new Error(`Aucun slug libre pour « ${input.name} »`);
}

/** The keys of an object that carry a value, as a fresh partial. */
function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

/** A duplicate-key error raised by the provenance index, not the slug one. */
function isSourceConflict(error: unknown): boolean {
  const pattern = (error as { keyPattern?: Record<string, unknown> })
    .keyPattern;
  return !!pattern && "source.id" in pattern;
}

export async function deleteItem(slug: string): Promise<boolean> {
  const result = await collection().deleteOne({ slug });
  return result.deletedCount > 0;
}
