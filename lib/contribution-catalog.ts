import "server-only";
import {
  createItem,
  deleteItem,
  getItemBySlug,
  getItemsBySlugs,
  normalizeItemInput,
  restoreItemFields,
  updateItem,
  type ItemInput,
} from "@/lib/items";
import {
  createPlace,
  deletePlace,
  getPlaceBySlug,
  normalizePlaceInput,
  normalizePlacePlan,
  PlansChangedError,
  savePlacePlans,
  updatePlace,
  type PlaceInput,
} from "@/lib/places";
import {
  getMissionForEdit,
  MISSION_FIELDS,
  normalizeMissionInput,
  updateMissionCommunity,
  type MissionCommunity,
} from "@/lib/missions";
import { organizations } from "@/lib/orgs";
import {
  BLOB_HOST,
  ContributionError,
  placeMedia,
  type DbContribution,
} from "@/lib/contribution-store";
import { toItemSlug, type Item } from "@/types/items";
import {
  isDrawnPlan,
  isPlacePlanRef,
  type Place,
  type PlacePlan,
  type PlacePosition,
} from "@/types/places";
import {
  POINTS,
  RENAME_LEVEL,
  type ContributionChange,
  type ContributionKind,
  type ContributionTarget,
} from "@/types/contributions";

/**
 * Les contributions au catalogue : lieux, plans, objets.
 *
 * Chacune se prépare ici en trois temps, toujours par les fonctions de
 * `lib/places.ts` et `lib/items.ts`, avec leurs validations — il n'y a pas de
 * second chemin d'écriture :
 * - `build…` vérifie ce que l'auteur propose et le met en avant/après ;
 * - `applyCatalog` l'écrit à la publication ;
 * - `revertCatalog` remet l'état d'avant quand on l'annule.
 *
 * Une modification ne retient que les champs qu'elle change : sa publication
 * n'écrit qu'eux (`only`), et une correction faite entre-temps sur un autre
 * champ survit.
 */

/** Ce que `lib/contributions.ts` enregistre, une fois la proposition vérifiée. */
export type CatalogDraft = {
  kind: Exclude<ContributionKind, "media" | "orgCreate" | "confirm">;
  target: ContributionTarget;
  proposal: unknown;
  fields?: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changes: ContributionChange[];
  /** Ce que la publication créditera, avant la règle des corrections répétées. */
  points: number;
  preview?: { url: string; width: number; height: number };
};

// ─── Comparer et décrire ────────────────────────────────────────────────────

/**
 * La date des cours est posée par l'enregistrement, pas saisie : la comparer
 * ferait voir un changement à chaque envoi d'une fiche de ressource.
 */
const IGNORED_KEYS = new Set(["pricesUpdatedAt"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.values(value).every(isEmpty);
  return false;
}

/** Une forme stable : clés triées, champs vides et date des cours retirés. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !IGNORED_KEYS.has(key) && !isEmpty(value[key]))
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }
  return value;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmpty(a) && isEmpty(b)) return true;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function show(value: unknown): string | undefined {
  if (isEmpty(value)) return undefined;
  if (Array.isArray(value)) {
    return value
      .map((entry) =>
        isPlainObject(entry)
          ? Object.entries(entry)
              .filter(([, part]) => !isEmpty(part))
              .map(
                ([key, part]) =>
                  `${key} ${typeof part === "object" ? JSON.stringify(part) : String(part)}`,
              )
              .join(", ")
          : String(entry),
      )
      .join(" ; ");
  }
  if (isPlainObject(value)) return JSON.stringify(canonical(value));
  return String(value);
}

/** L'avant/après d'un champ, déplié d'un niveau pour les blocs d'une fiche. */
function describe(
  field: string,
  before: unknown,
  after: unknown,
): ContributionChange[] {
  if (isPlainObject(before) || isPlainObject(after)) {
    const left = isPlainObject(before) ? before : {};
    const right = isPlainObject(after) ? after : {};
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .filter((key) => !IGNORED_KEYS.has(key))
      .sort();
    return keys.flatMap((key) =>
      sameValue(left[key], right[key])
        ? []
        : [
            {
              field: `${field}.${key}`,
              before: show(left[key]),
              after: show(right[key]),
            },
          ],
    );
  }
  return sameValue(before, after)
    ? []
    : [{ field, before: show(before), after: show(after) }];
}

function describeAll(
  fields: string[],
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ContributionChange[] {
  return fields.flatMap((field) =>
    describe(field, before[field], after[field]),
  );
}

function pick<T extends object>(value: T, keys: string[]) {
  return Object.fromEntries(
    keys.map((key) => [key, (value as Record<string, unknown>)[key]]),
  );
}

/** Les erreurs de validation des fiches sont déjà écrites pour un humain. */
function validate<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw new ContributionError(
      "invalidInput",
      400,
      error instanceof Error ? error.message : undefined,
    );
  }
}

// ─── Lieux ──────────────────────────────────────────────────────────────────

/** Ce qu'un contributeur peut changer d'un lieu. La vignette passe par la galerie. */
const PLACE_FIELDS = [
  "name",
  "type",
  "description",
  "services",
  "shopCategory",
  "soldItems",
  "tip",
  "parentSlug",
  "position",
] as const;

/** Réservés au niveau 4 : le nom fait l'adresse, le parent fait l'arbre. */
const PLACE_RENAME_FIELDS = new Set(["name", "parentSlug"]);

export function placeToInput(place: Place): PlaceInput {
  return {
    name: place.name,
    slug: place.slug,
    type: place.type,
    description: place.description,
    imageUrl: place.imageUrl,
    services: place.services,
    shopCategory: place.shopCategory,
    soldItems: place.soldItems,
    tip: place.tip,
    parentSlug: place.parentSlug ?? null,
    position: place.position,
  };
}

/**
 * Une position se range sur un corps que le NPS connaît, ou dans l'espace :
 * sur un corps sans paramètres, l'app ne saurait pas la relire.
 */
/**
 * Un corps décrit pour le NPS, et du système du lieu : chaque système a son
 * propre repère, une position relevée ailleurs ne veut rien dire ici.
 */
async function assertPositionBody(
  position: PlacePosition | undefined,
  systemSlug: string | undefined,
) {
  if (!position?.body) return;
  const body = await getPlaceBySlug(position.body);
  if (!body?.celestial) {
    throw new ContributionError(
      "invalidInput",
      400,
      `Corps céleste inconnu : ${position.body}`,
    );
  }
  if (systemSlug && body.systemSlug && body.systemSlug !== systemSlug) {
    throw new ContributionError(
      "invalidInput",
      400,
      `${body.name} n'est pas dans le système du lieu`,
    );
  }
}

/** Un magasin ne vend que des objets du catalogue. */
async function assertSoldItems(slugs: string[] | undefined) {
  if (!slugs?.length) return;
  const found = await getItemsBySlugs(slugs);
  const known = new Set(found.map((item) => item.slug));
  const unknown = slugs.filter((slug) => !known.has(slug));
  if (unknown.length > 0) {
    throw new ContributionError(
      "invalidInput",
      400,
      `Objet inconnu : ${unknown.join(", ")}`,
    );
  }
}

/** Ce que le formulaire a envoyé de ces champs, et rien d'autre. */
function present<T>(input: unknown, keys: readonly string[]): Partial<T> {
  const raw = isPlainObject(input) ? input : {};
  return Object.fromEntries(
    keys.filter((key) => key in raw).map((key) => [key, raw[key]]),
  ) as Partial<T>;
}

function placeProposal(input: unknown): Partial<PlaceInput> {
  return present<PlaceInput>(input, PLACE_FIELDS);
}

export async function buildPlaceCreate(
  parentSlug: string,
  input: unknown,
): Promise<CatalogDraft> {
  const parent = await getPlaceBySlug(parentSlug);
  if (!parent) throw new ContributionError("placeNotFound", 404);

  const proposal = {
    ...placeProposal(input),
    parentSlug: parent.slug,
  } as PlaceInput;
  const normalized = validate(() => normalizePlaceInput(proposal));
  await assertSoldItems(normalized.soldItems);
  await assertPositionBody(
    normalized.position,
    parent.type === "star" ? parent.slug : parent.systemSlug,
  );
  // Le slug suit le nom : un contributeur n'en choisit pas, et deux lieux du
  // même nom se départagent à la relecture plutôt que par un suffixe.
  if (await getPlaceBySlug(normalized.slug)) {
    throw new ContributionError("duplicate", 409);
  }

  const after = pick(normalized, [...PLACE_FIELDS]);
  return {
    kind: "placeCreate",
    target: {
      type: "place",
      slug: normalized.slug,
      name: normalized.name,
      parent: { slug: parent.slug, name: parent.name },
    },
    proposal: { ...proposal, slug: normalized.slug },
    after,
    changes: describeAll([...PLACE_FIELDS], {}, after),
    points: POINTS.placeCreate,
  };
}

export async function buildPlaceEdit(
  slug: string,
  input: unknown,
  level: number,
): Promise<CatalogDraft> {
  const place = await getPlaceBySlug(slug);
  if (!place) throw new ContributionError("placeNotFound", 404);

  const current = placeToInput(place);
  const proposed = placeProposal(input);
  const proposal: PlaceInput = { ...current };
  for (const field of PLACE_FIELDS) {
    if (!(field in proposed)) continue;
    // En deçà du niveau 4, nom et parent restent ceux du lieu : la proposition
    // ne les porte pas, plutôt que d'être refusée pour eux.
    if (PLACE_RENAME_FIELDS.has(field) && level < RENAME_LEVEL) continue;
    (proposal as Record<string, unknown>)[field] = proposed[field];
  }
  proposal.slug = place.slug;
  proposal.imageUrl = place.imageUrl;

  const normalized = validate(() => normalizePlaceInput(proposal));
  await assertSoldItems(normalized.soldItems);
  if ("position" in proposed) {
    await assertPositionBody(normalized.position, place.systemSlug);
  }
  if (normalized.parentSlug && !(await getPlaceBySlug(normalized.parentSlug))) {
    throw new ContributionError("placeNotFound", 404);
  }

  const fields = PLACE_FIELDS.filter(
    (field) =>
      !sameValue((place as Record<string, unknown>)[field], normalized[field]),
  );
  if (fields.length === 0) throw new ContributionError("noChange", 400);

  const beforeValues = pick(place, fields);
  const afterValues = pick(normalized, fields);
  return {
    kind: "placeEdit",
    target: { type: "place", slug: place.slug, name: place.name },
    proposal: pick(proposal, fields),
    fields,
    before: beforeValues,
    after: afterValues,
    changes: describeAll(fields, beforeValues, afterValues),
    points: POINTS.edit,
  };
}

// ─── Plans ──────────────────────────────────────────────────────────────────

const PLAN_FILE =
  /^\/lieux\/([a-z0-9-]{1,120})\/plans\/[A-Za-z0-9_-]{1,160}\.(?:jpe?g|png|webp)$/i;

/** Les adresses d'images d'un plan : fond, aperçu rendu, calque de relevé. */
function planUrls(plan: PlacePlan): string[] {
  if (isDrawnPlan(plan)) {
    return [plan.preview?.url, plan.underlay?.url].filter(
      (url): url is string => !!url,
    );
  }
  return [plan.imageUrl];
}

/**
 * Une image de plan vient du stockage du site, sous les plans de ce lieu — ou
 * c'est déjà celle du plan repris. Le refus ou l'annulation ne la suppriment
 * pas : un plan publié peut l'avoir partagée.
 */
function assertPlanUrls(slug: string, plan: PlacePlan, existing?: PlacePlan) {
  const known = new Set(existing ? planUrls(existing) : []);
  for (const raw of planUrls(plan)) {
    if (known.has(raw)) continue;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new ContributionError("invalidInput", 400);
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== BLOB_HOST ||
      url.port ||
      /[?#]/.test(raw) ||
      PLAN_FILE.exec(url.pathname)?.[1] !== slug
    ) {
      throw new ContributionError("invalidInput", 400);
    }
  }
}

function planSummary(plan: PlacePlan | undefined) {
  if (!plan) return {};
  return isDrawnPlan(plan)
    ? {
        name: plan.name,
        note: plan.note,
        kind: "drawn",
        levels: plan.levels.length,
        rooms: plan.levels.reduce((sum, level) => sum + level.rooms.length, 0),
        markers: plan.markers.length,
      }
    : {
        name: plan.name,
        note: plan.note,
        kind: "image",
        image: plan.imageUrl,
        markers: plan.markers.length,
      };
}

function planPreview(plan: PlacePlan) {
  if (isDrawnPlan(plan)) return plan.preview;
  return {
    url: plan.imageUrl,
    width: plan.imageWidth,
    height: plan.imageHeight,
  };
}

/** Ce qu'un plan vaut à sa première publication ; un relevé vide ne vaut rien. */
export function planValue(plan: PlacePlan): number {
  if (!isDrawnPlan(plan)) return POINTS.planImage;
  return plan.levels.some((level) => level.rooms.length > 0)
    ? POINTS.planDrawn
    : 0;
}

export async function buildPlan(
  slug: string,
  input: unknown,
): Promise<CatalogDraft> {
  const place = await getPlaceBySlug(slug);
  if (!place) throw new ContributionError("placeNotFound", 404);

  const plan = normalizePlacePlan(input, place.slug);
  if (!plan) throw new ContributionError("invalidInput", 400);

  const stored = place.plans ?? [];
  const existingEntry = stored.find((entry) => entry.id === plan.id);
  // Un emprunt se reprend chez sa source, pas chez l'emprunteur.
  if (existingEntry && isPlacePlanRef(existingEntry)) {
    throw new ContributionError("notAllowed", 403);
  }
  const existing = existingEntry as PlacePlan | undefined;
  assertPlanUrls(place.slug, plan, existing);
  if (existing && sameValue(existing, plan)) {
    throw new ContributionError("noChange", 400);
  }

  return {
    kind: "plan",
    target: {
      type: "place",
      slug: place.slug,
      name: place.name,
      planId: plan.id,
    },
    proposal: plan,
    before: existing ? { plan: existing } : undefined,
    after: { plan },
    changes: describe("plan", planSummary(existing), planSummary(plan)),
    // Décidé à la publication : la valeur d'un plan ne se touche qu'une fois.
    points: 0,
    preview: planPreview(plan),
  };
}

// ─── Objets ─────────────────────────────────────────────────────────────────

/** Ce qu'un contributeur peut changer d'un objet. L'image et la provenance non. */
const ITEM_FIELDS = [
  "name",
  "kind",
  "description",
  "category",
  "subcategory",
  "manufacturer",
  "size",
  "tier",
  "statistics",
  "obtention",
  "blueprintSlugs",
  "variantGroup",
  "variantName",
  "setId",
  "setName",
  "vehicle",
  "weapon",
  "resource",
] as const;

/** Réservés au niveau 4 : le nom fait l'adresse, le type fait la fiche. */
const ITEM_RENAME_FIELDS = new Set(["name", "kind"]);

export function itemToInput(item: Item): ItemInput {
  const rest: Partial<Item> = { ...item };
  delete rest.id;
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest as ItemInput;
}

function itemProposal(input: unknown): Partial<ItemInput> {
  return present<ItemInput>(input, ITEM_FIELDS);
}

export async function buildItemCreate(input: unknown): Promise<CatalogDraft> {
  const proposal = itemProposal(input) as ItemInput;
  const normalized = validate(() => normalizeItemInput(proposal));
  if (await getItemBySlug(normalized.slug)) {
    throw new ContributionError("duplicate", 409);
  }

  const after = pick(normalized, [...ITEM_FIELDS]);
  return {
    kind: "itemCreate",
    target: {
      type: "item",
      slug: normalized.slug,
      name: normalized.name,
    },
    proposal: { ...proposal, slug: toItemSlug(normalized.slug) },
    after,
    changes: describeAll([...ITEM_FIELDS], {}, after),
    points: POINTS.itemCreate,
  };
}

export async function buildItemEdit(
  slug: string,
  input: unknown,
  level: number,
): Promise<CatalogDraft> {
  const item = await getItemBySlug(slug);
  if (!item) throw new ContributionError("itemNotFound", 404);

  const current = itemToInput(item);
  const proposed = itemProposal(input);
  const proposal: ItemInput = { ...current };
  for (const field of ITEM_FIELDS) {
    if (!(field in proposed)) continue;
    if (ITEM_RENAME_FIELDS.has(field) && level < RENAME_LEVEL) continue;
    (proposal as Record<string, unknown>)[field] = proposed[field];
  }
  proposal.slug = item.slug;
  proposal.imageUrl = item.imageUrl;
  proposal.source = item.source;

  const normalized = validate(() => normalizeItemInput(proposal));
  const fields = ITEM_FIELDS.filter(
    (field) =>
      !sameValue((item as Record<string, unknown>)[field], normalized[field]),
  );
  if (fields.length === 0) throw new ContributionError("noChange", 400);

  const beforeValues = pick(item, fields);
  const afterValues = pick(normalized, fields);
  // Remplir un bloc vide, c'est compléter une section ; le reste corrige.
  const completes = fields.some((field) => isEmpty(beforeValues[field]));
  return {
    kind: "itemEdit",
    target: { type: "item", slug: item.slug, name: item.name },
    proposal: pick(proposal, fields),
    fields,
    before: beforeValues,
    after: afterValues,
    changes: describeAll(fields, beforeValues, afterValues),
    points: completes ? POINTS.section : POINTS.edit,
  };
}

// ─── Publier et annuler ─────────────────────────────────────────────────────

// ─── Missions ───────────────────────────────────────────────────────────────

/**
 * Les lieux d'une mission et son astuce. Pas de renommage : le titre vient du
 * jeu, et le prochain import le réécrirait de toute façon.
 */
export async function buildMissionEdit(
  id: string,
  input: unknown,
): Promise<CatalogDraft> {
  const mission = await getMissionForEdit(id);
  if (!mission) throw new ContributionError("missionNotFound", 404);

  const raw = isPlainObject(input) ? input : {};
  const proposal = present<MissionCommunity>(raw, MISSION_FIELDS);
  const normalized = validate(() =>
    normalizeMissionInput({
      ...pick(mission, [...MISSION_FIELDS]),
      ...proposal,
    }),
  );
  for (const slug of normalized.placeSlugs ?? []) {
    if (!(await getPlaceBySlug(slug))) {
      throw new ContributionError("placeNotFound", 404);
    }
  }

  const fields = MISSION_FIELDS.filter(
    (field) => !sameValue(mission[field], normalized[field]),
  );
  if (fields.length === 0) throw new ContributionError("noChange", 400);

  const before = pick(mission, fields);
  const after = pick(normalized, fields);
  return {
    kind: "missionEdit",
    target: { type: "mission", slug: mission.id, name: mission.title },
    proposal: after,
    fields,
    before,
    after,
    changes: describeAll(fields, before, after),
    points: POINTS.edit,
  };
}

function applyError(error: unknown): ContributionError {
  if (error instanceof ContributionError) return error;
  return new ContributionError(
    "applyFailed",
    409,
    error instanceof Error ? error.message : undefined,
  );
}

/**
 * L'« avant » d'une correction, relu au moment de publier : la fiche a pu
 * changer depuis l'envoi. Sans ça, l'annulation remettrait une valeur que
 * quelqu'un d'autre avait déjà remplacée, et son travail serait perdu.
 */
export async function currentBefore(
  contribution: DbContribution,
): Promise<Pick<DbContribution, "before" | "changes"> | null> {
  const { target } = contribution;
  const after = contribution.after ?? {};
  const fields = contribution.fields ?? [];

  switch (contribution.kind) {
    case "placeEdit":
    case "itemEdit": {
      const entry =
        contribution.kind === "placeEdit"
          ? await getPlaceBySlug(target.slug)
          : await getItemBySlug(target.slug);
      if (!entry) return null;
      const before = pick(entry, fields);
      return { before, changes: describeAll(fields, before, after) };
    }
    case "missionEdit": {
      const mission = await getMissionForEdit(target.slug);
      if (!mission) return null;
      const before = pick(mission, fields);
      return { before, changes: describeAll(fields, before, after) };
    }
    case "plan": {
      const place = await getPlaceBySlug(target.slug);
      if (!place) return null;
      const existing = place.plans?.find(
        (entry) => entry.id === target.planId,
      ) as PlacePlan | undefined;
      return {
        before: existing ? { plan: existing } : undefined,
        changes: describe(
          "plan",
          planSummary(existing),
          planSummary(after.plan as PlacePlan),
        ),
      };
    }
    default:
      return null;
  }
}

/**
 * Réécrit les plans d'un lieu à partir de ceux qu'il a maintenant, sans
 * écraser un plan publié en même temps par quelqu'un d'autre : si le lieu a
 * bougé entre la lecture et l'écriture, on relit et on recommence.
 */
export async function updatePlans(
  slug: string,
  change: (stored: NonNullable<Place["plans"]>) => NonNullable<Place["plans"]>,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const place = await getPlaceBySlug(slug);
    if (!place) throw new ContributionError("placeNotFound", 404);
    try {
      await savePlacePlans(place.slug, change(place.plans ?? []), {
        expectedUpdatedAt: place.updatedAt ?? null,
      });
      return;
    } catch (error) {
      if (!(error instanceof PlansChangedError)) throw error;
    }
  }
  throw new ContributionError(
    "applyFailed",
    409,
    new PlansChangedError().message,
  );
}

/** Écrit une contribution publiée. Lève si la fiche a changé au point de ne plus l'accepter. */
export async function applyCatalog(
  contribution: DbContribution,
): Promise<void> {
  const { target } = contribution;
  const proposal = (contribution.proposal ?? {}) as Record<string, unknown>;
  const fields = contribution.fields ?? [];

  try {
    switch (contribution.kind) {
      case "placeCreate": {
        await createPlace(proposal as PlaceInput);
        return;
      }
      case "placeEdit": {
        const place = await getPlaceBySlug(target.slug);
        if (!place) throw new ContributionError("placeNotFound", 404);
        await updatePlace(
          place.slug,
          { ...placeToInput(place), ...proposal, slug: place.slug },
          { only: fields as (keyof PlaceInput)[] },
        );
        return;
      }
      case "plan": {
        const plan = proposal as unknown as PlacePlan;
        await updatePlans(target.slug, (stored) =>
          stored.some((entry) => entry.id === plan.id)
            ? stored.map((entry) => (entry.id === plan.id ? plan : entry))
            : [...stored, plan],
        );
        return;
      }
      case "itemCreate": {
        await createItem(proposal as unknown as ItemInput);
        return;
      }
      case "itemEdit": {
        const item = await getItemBySlug(target.slug);
        if (!item) throw new ContributionError("itemNotFound", 404);
        await updateItem(
          item.slug,
          { ...itemToInput(item), ...proposal, slug: item.slug },
          { only: fields as (keyof ItemInput)[] },
        );
        return;
      }
      case "missionEdit": {
        if (
          !(await updateMissionCommunity(
            target.slug,
            proposal as MissionCommunity,
            fields,
          ))
        ) {
          throw new ContributionError("missionNotFound", 404);
        }
        return;
      }
      case "orgCreate": {
        // Validée, l'organisation peut passer publique : ses éditeurs le
        // décident, la validation ne l'expose pas d'elle-même.
        const { matchedCount } = await organizations().updateOne(
          { _id: target.slug },
          { $set: { validation: { status: "validated", at: new Date() } } },
        );
        if (matchedCount === 0) throw new ContributionError("notFound", 404);
        return;
      }
      case "media":
      case "confirm":
        return;
    }
  } catch (error) {
    throw applyError(error);
  }
}

/**
 * Ce qui a changé sur la fiche depuis la publication, sur les champs que la
 * contribution avait touchés : ce qu'elle avait publié, et ce qu'il y a
 * maintenant. Annuler écraserait alors le travail d'un autre. Vide quand la
 * voie est libre.
 */
export async function revertConflicts(
  contribution: DbContribution,
): Promise<ContributionChange[]> {
  const { target } = contribution;
  const after = contribution.after ?? {};
  const fields = contribution.fields ?? [];
  const gone: ContributionChange[] = [
    { field: "*", before: target.name, after: undefined },
  ];

  switch (contribution.kind) {
    case "placeEdit": {
      const place = await getPlaceBySlug(target.slug);
      if (!place) return gone;
      return describeAll(fields, after, place as Record<string, unknown>);
    }
    case "itemEdit": {
      const item = await getItemBySlug(target.slug);
      if (!item) return gone;
      return describeAll(fields, after, item as Record<string, unknown>);
    }
    case "missionEdit": {
      const mission = await getMissionForEdit(target.slug);
      if (!mission) return gone;
      return describeAll(fields, after, mission as Record<string, unknown>);
    }
    case "placeCreate": {
      // Supprimer le lieu emporterait ce que d'autres y ont mis depuis.
      const place = await getPlaceBySlug(target.slug);
      if (!place) return gone;
      const fields = Object.keys(after);
      const added: ContributionChange[] = [];
      const plans = place.plans?.length ?? 0;
      if (plans > 0) {
        added.push({ field: "plan", before: undefined, after: String(plans) });
      }
      const images = await placeMedia().countDocuments({
        placeSlug: place.slug,
        status: "published",
      });
      if (images > 0) {
        added.push({
          field: "images",
          before: undefined,
          after: String(images),
        });
      }
      return [
        ...describeAll(fields, after, place as Record<string, unknown>),
        ...added,
      ];
    }
    case "itemCreate": {
      const item = await getItemBySlug(target.slug);
      if (!item) return gone;
      return describeAll(
        Object.keys(after),
        after,
        item as Record<string, unknown>,
      );
    }
    case "plan": {
      const place = await getPlaceBySlug(target.slug);
      const current = place?.plans?.find((entry) => entry.id === target.planId);
      if (!current) return gone;
      return sameValue(current, after.plan)
        ? []
        : describe(
            "plan",
            planSummary(after.plan as PlacePlan),
            planSummary(current as PlacePlan),
          );
    }
    default:
      return [];
  }
}

/** Remet l'état d'avant une contribution publiée. */
export async function revertCatalog(
  contribution: DbContribution,
): Promise<void> {
  const { target } = contribution;
  const before = contribution.before ?? {};
  const fields = contribution.fields ?? [];

  try {
    switch (contribution.kind) {
      case "placeCreate": {
        if (!(await deletePlace(target.slug))) {
          throw new ContributionError("placeNotFound", 404);
        }
        return;
      }
      case "placeEdit": {
        const place = await getPlaceBySlug(target.slug);
        if (!place) throw new ContributionError("placeNotFound", 404);
        await updatePlace(
          place.slug,
          { ...placeToInput(place), ...before, slug: place.slug },
          { only: fields as (keyof PlaceInput)[] },
        );
        return;
      }
      case "plan": {
        const previous = before.plan as PlacePlan | undefined;
        await updatePlans(target.slug, (stored) =>
          previous
            ? stored.map((entry) =>
                entry.id === previous.id ? previous : entry,
              )
            : stored.filter((entry) => entry.id !== target.planId),
        );
        return;
      }
      case "itemCreate": {
        if (!(await deleteItem(target.slug))) {
          throw new ContributionError("itemNotFound", 404);
        }
        return;
      }
      case "itemEdit": {
        if (!(await restoreItemFields(target.slug, before))) {
          throw new ContributionError("itemNotFound", 404);
        }
        return;
      }
      case "missionEdit": {
        if (
          !(await updateMissionCommunity(
            target.slug,
            before as MissionCommunity,
            fields,
          ))
        ) {
          throw new ContributionError("missionNotFound", 404);
        }
        return;
      }
      case "orgCreate": {
        // L'organisation reste à ses membres, mais quitte la vue publique :
        // c'était la validation qui l'y autorisait.
        await organizations().updateOne(
          { _id: target.slug },
          {
            $set: {
              public: false,
              validation: { status: "rejected", at: new Date() },
            },
          },
        );
        return;
      }
      case "media":
      case "confirm":
        return;
    }
  } catch (error) {
    const failure = applyError(error);
    throw failure.code === "applyFailed"
      ? new ContributionError("revertFailed", 409, failure.detail)
      : failure;
  }
}

/** Un plan qui valait déjà quelque chose avant cette contribution : un relevé existant, corrigé. */
export function improvesValuedPlan(contribution: DbContribution): boolean {
  const previous = contribution.before?.plan as PlacePlan | undefined;
  return previous !== undefined && planValue(previous) > 0;
}

/** La clé du bonus d'un plan : un plan ne rapporte sa valeur qu'une fois. */
export function planKey(contribution: DbContribution): string {
  return `${contribution.target.slug}:${contribution.target.planId}`;
}
