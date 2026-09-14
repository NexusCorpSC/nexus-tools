import "server-only";

import type {
  AnyBulkWriteOperation,
  Document,
  Filter,
  UpdateFilter,
} from "mongodb";
import db from "@/lib/db";
import {
  isPlaceService,
  isPlaceSort,
  isPlaceType,
  MAX_PLACE_DEPTH,
  MAX_PLACE_MARKERS,
  MAX_PLACE_NAME_LENGTH,
  MAX_PLACE_PAGE_SIZE,
  MAX_PLACE_PLANS,
  MAX_PLACE_TEXT_LENGTH,
  MAX_PLACE_TREE_NODES,
  PLACE_PAGE_SIZE,
  toPlaceSlug,
  type Place,
  type PlaceAncestor,
  type PlaceDetails,
  type PlaceFacets,
  type PlaceGroup,
  type PlaceGroupMember,
  type PlacePlan,
  type PlacePlanMarker,
  type PlacePlanOrigin,
  type PlacePlanRef,
  type PlacePlansResponse,
  isPlacePlanRef,
  MIN_PLACE_GROUP_SIZE,
  placeGroupKey,
  type PlaceService,
  type PlaceSourceName,
  type PlaceSummary,
  type PlaceTreeNode,
  type PlaceTreeResponse,
  type StoredPlacePlan,
  type PlaceType,
} from "@/types/places";

const COLLECTION = "gameLocations";

type PlaceDbModel = Place;

/**
 * `locations` appartient à l'inventaire — ce sont les endroits qu'un joueur
 * nomme pour ranger ses caisses. Le catalogue vit à côté, dans `gameLocations`,
 * et l'unicité du slug est tenue par l'index de `scripts/ensure-indexes.ts`
 * plutôt que par une lecture suivie d'une écriture, que deux créations
 * simultanées passeraient toutes les deux.
 */
function collection() {
  return db.db().collection<PlaceDbModel>(COLLECTION);
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

function text(value: unknown, maxLength = MAX_PLACE_TEXT_LENGTH): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalText(
  value: unknown,
  maxLength = MAX_PLACE_TEXT_LENGTH,
): string | undefined {
  return text(value, maxLength) || undefined;
}

/**
 * L'image d'un lieu ou d'un plan est toujours téléversée, jamais saisie : une
 * URL hors des hôtes listés dans `next.config.ts` ferait lever `next/image` au
 * rendu, et un `javascript:` s'exécuterait à chaque visite.
 */
function optionalUrl(value: unknown): string | undefined {
  const url = optionalText(value, 2048);
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutUndefined(entry)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, withoutUndefined(entry)]),
    ) as T;
  }
  return value;
}

function normalizeServices(value: unknown): PlaceService[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const services = Array.from(
    new Set(
      value
        .map((entry) => text(entry, 40))
        .filter((entry): entry is PlaceService => isPlaceService(entry)),
    ),
  );
  return services.length > 0 ? services : undefined;
}

// ─── Saisie ──────────────────────────────────────────────────────────────────

export type PlaceInput = {
  name: string;
  slug?: string;
  type: string;
  description?: string;
  imageUrl?: string;
  services?: unknown;
  shopCategory?: string;
  parentSlug?: string | null;
  source?: unknown;
};

/** Ce qu'un formulaire ou un import écrit. Les champs dérivés n'en sont pas. */
type NormalizedPlace = {
  slug: string;
  name: string;
  type: PlaceType;
  description?: string;
  imageUrl?: string;
  services?: PlaceService[];
  shopCategory?: string;
  parentSlug?: string;
  source?: Place["source"];
};

export function normalizePlaceInput(input: PlaceInput): NormalizedPlace {
  const name = text(input.name, MAX_PLACE_NAME_LENGTH);
  if (!name) throw new Error("Le nom du lieu est obligatoire");

  const type = text(input.type, 40);
  if (!isPlaceType(type)) throw new Error("Type de lieu invalide");

  const slug = toPlaceSlug(text(input.slug, MAX_PLACE_NAME_LENGTH) || name);
  if (!slug) throw new Error("Le slug est obligatoire");

  const source = input.source as Place["source"] | undefined;

  return {
    slug,
    name,
    type,
    description: optionalText(input.description),
    imageUrl: optionalUrl(input.imageUrl),
    services: normalizeServices(input.services),
    // Une catégorie ne veut rien dire ailleurs que sur un magasin, et la
    // laisser traîner sur un quartier ferait un filtre sale plus tard.
    shopCategory:
      type === "shop"
        ? optionalText(input.shopCategory, MAX_PLACE_NAME_LENGTH)
        : undefined,
    parentSlug: input.parentSlug
      ? toPlaceSlug(text(input.parentSlug, MAX_PLACE_NAME_LENGTH))
      : undefined,
    source: source?.name && source?.id ? source : undefined,
  };
}

/**
 * Borne les repères d'un plan. Un repère sans service ni cible ne veut rien
 * dire : il disparaît plutôt que de rester posé sans rien ouvrir.
 */
/**
 * Met en forme ce que l'éditeur envoie. Un élément est soit un plan possédé,
 * soit l'adresse d'un plan d'ailleurs ; c'est `sourceSlug` qui les distingue.
 *
 * `borrowedFrom` est retiré au passage : c'est un champ de lecture, rempli par
 * `resolvePlans`. Le laisser entrer figerait dans le document emprunteur une
 * copie de ce qui doit rester une référence, et le premier aller-retour par
 * l'éditeur suffirait à détacher un plan sans que personne l'ait demandé.
 */
function normalizePlans(value: unknown, ownerSlug?: string): StoredPlacePlan[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_PLACE_PLANS)
    .map((raw): StoredPlacePlan | null => {
      const candidate = raw as Partial<PlacePlanRef>;
      if (candidate.sourceSlug !== undefined) {
        const sourceSlug = toPlaceSlug(
          text(candidate.sourceSlug, MAX_PLACE_NAME_LENGTH),
        );
        const sourcePlanId = text(candidate.sourcePlanId, 40);
        // Un lieu ne s'emprunte pas à lui-même : il possède déjà le plan.
        if (!sourceSlug || !sourcePlanId || !candidate.id) return null;
        if (ownerSlug && sourceSlug === ownerSlug) return null;

        return {
          id: text(candidate.id, 40),
          sourceSlug,
          sourcePlanId,
        } satisfies PlacePlanRef;
      }

      const plan = raw as Partial<PlacePlan>;
      const imageUrl = optionalUrl(plan.imageUrl);
      const name = text(plan.name, MAX_PLACE_NAME_LENGTH);
      if (!imageUrl || !name || !plan.id) return null;

      const markers = (Array.isArray(plan.markers) ? plan.markers : [])
        .slice(0, MAX_PLACE_MARKERS)
        .map((rawMarker) => {
          const marker = rawMarker as Partial<PlacePlanMarker>;
          const service = text(marker.service, 40);
          const targetSlug = marker.targetSlug
            ? toPlaceSlug(text(marker.targetSlug, MAX_PLACE_NAME_LENGTH))
            : "";
          if (!marker.id) return null;
          if (!targetSlug && !isPlaceService(service)) return null;

          return withoutUndefined({
            id: text(marker.id, 40),
            x: clampFraction(marker.x),
            y: clampFraction(marker.y),
            // Une cible l'emporte sur un service : c'est elle qui ouvre un plan.
            service: targetSlug ? undefined : (service as PlaceService),
            targetSlug: targetSlug || undefined,
            label: optionalText(marker.label, MAX_PLACE_NAME_LENGTH),
            note: optionalText(marker.note, MAX_PLACE_NAME_LENGTH),
          }) as PlacePlanMarker;
        })
        .filter((marker): marker is PlacePlanMarker => marker !== null);

      return withoutUndefined({
        id: text(plan.id, 40),
        name,
        note: optionalText(plan.note, MAX_PLACE_TEXT_LENGTH),
        imageUrl,
        imageWidth: Math.max(1, Math.round(Number(plan.imageWidth) || 1)),
        imageHeight: Math.max(1, Math.round(Number(plan.imageHeight) || 1)),
        markers,
      }) as PlacePlan;
    })
    .filter((plan): plan is StoredPlacePlan => plan !== null);
}

/** Quatre décimales : le dix-millième de la largeur est déjà sous le pixel. */
function clampFraction(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(Math.min(1, Math.max(0, parsed)).toFixed(4));
}

// ─── Champs dérivés ──────────────────────────────────────────────────────────
// Tout ce que `recomputeSubtree` écrit, et que personne d'autre n'écrit.

type TreeNode = {
  slug: string;
  name: string;
  type: PlaceType;
  parentSlug?: string;
  planSize: number;
  ancestorSlugs?: string[];
  depth?: number;
  path?: string;
  parentName?: string;
  systemSlug?: string;
  systemName?: string;
  bodySlug?: string;
  bodyName?: string;
  childCount?: number;
  shopCount?: number;
  planCount?: number;
};

type Inherited = {
  ancestorSlugs: string[];
  parentName?: string;
  systemSlug?: string;
  systemName?: string;
  bodySlug?: string;
  bodyName?: string;
};

const DERIVED_KEYS = [
  "ancestorSlugs",
  "depth",
  "path",
  "parentName",
  "systemSlug",
  "systemName",
  "bodySlug",
  "bodyName",
  "childCount",
  "shopCount",
  "planCount",
] as const;

async function loadNodes(match: Filter<PlaceDbModel>): Promise<TreeNode[]> {
  return collection()
    .aggregate<TreeNode>([
      { $match: match },
      // `plans` pèse quelques kilo-octets par lieu : on n'en ramène que la
      // taille, qui est tout ce que le recalcul a besoin de savoir.
      { $addFields: { planSize: { $size: { $ifNull: ["$plans", []] } } } },
      {
        $project: {
          _id: 0,
          slug: 1,
          name: 1,
          type: 1,
          parentSlug: 1,
          planSize: 1,
          ancestorSlugs: 1,
          depth: 1,
          path: 1,
          parentName: 1,
          systemSlug: 1,
          systemName: 1,
          bodySlug: 1,
          bodyName: 1,
          childCount: 1,
          shopCount: 1,
          planCount: 1,
        },
      },
    ])
    .toArray();
}

/**
 * Le sous-arbre, niveau par niveau, en ne suivant que `parentSlug` — le seul
 * champ d'arborescence qui ne soit pas dérivé. Passer par `ancestorSlugs`
 * serait plus court d'une requête, mais un `ancestorSlugs` faux cacherait
 * précisément les lieux qu'on vient réparer.
 */
async function loadSubtree(rootSlug: string): Promise<TreeNode[]> {
  const root = await loadNodes({ slug: rootSlug });
  if (root.length === 0) return [];

  const nodes = [...root];
  let frontier = [rootSlug];
  for (let level = 0; level < MAX_PLACE_DEPTH && frontier.length > 0; level++) {
    const children = await loadNodes({ parentSlug: { $in: frontier } });
    if (children.length === 0) break;
    nodes.push(...children);
    frontier = children.map((child) => child.slug);
  }
  return nodes;
}

/** Les valeurs qu'un lieu apporte à ceux qu'il contient. */
function inheritedFor(node: TreeNode, inherited: Inherited): Inherited {
  const isStar = node.type === "star";
  const isBody = node.type === "planet" || node.type === "moon";
  return {
    ancestorSlugs: [...inherited.ancestorSlugs, node.slug],
    parentName: node.name,
    systemSlug: isStar ? node.slug : inherited.systemSlug,
    systemName: isStar ? node.name : inherited.systemName,
    bodySlug: isBody ? node.slug : inherited.bodySlug,
    bodyName: isBody ? node.name : inherited.bodyName,
  };
}

/**
 * Remonte la chaîne des parents pour savoir ce que le sous-arbre hérite. On
 * relit les documents plutôt que de faire confiance aux champs dérivés du
 * parent : c'est huit lectures au pire, et ça ne propage pas une erreur.
 */
async function ancestryOf(parentSlug?: string): Promise<Inherited> {
  if (!parentSlug) return { ancestorSlugs: [] };

  const chain: TreeNode[] = [];
  const seen = new Set<string>();
  let slug: string | undefined = parentSlug;

  while (slug && chain.length < MAX_PLACE_DEPTH && !seen.has(slug)) {
    seen.add(slug);
    const [node] = await loadNodes({ slug });
    if (!node) break;
    chain.unshift(node);
    slug = node.parentSlug;
  }

  return chain.reduce<Inherited>(
    (inherited, node) => inheritedFor(node, inherited),
    { ancestorSlugs: [] },
  );
}

type Rebuilt = { slug: string; values: Record<string, unknown> };

/**
 * Recalcule tout un sous-arbre en mémoire, puis n'écrit que ce qui a bougé.
 * Pur et idempotent : le relancer sur un arbre à moitié réparé le termine.
 * Renvoie le nombre de lieux réellement modifiés.
 */
async function rebuild(
  nodes: TreeNode[],
  roots: TreeNode[],
  rootInherited: Inherited,
): Promise<number> {
  const byParent = new Map<string, TreeNode[]>();
  for (const node of nodes) {
    if (!node.parentSlug) continue;
    const siblings = byParent.get(node.parentSlug) ?? [];
    siblings.push(node);
    byParent.set(node.parentSlug, siblings);
  }

  const rebuilt: Rebuilt[] = [];

  /** Renvoie le nombre de magasins du sous-arbre, celui-ci compris. */
  function visit(node: TreeNode, inherited: Inherited): number {
    const isStar = node.type === "star";
    const isBody = node.type === "planet" || node.type === "moon";
    const ancestorSlugs = inherited.ancestorSlugs;

    const children = byParent.get(node.slug) ?? [];
    const childInherited = inheritedFor(node, inherited);
    let shopsBelow = 0;
    for (const child of children) shopsBelow += visit(child, childInherited);

    rebuilt.push({
      slug: node.slug,
      values: {
        ancestorSlugs,
        depth: ancestorSlugs.length,
        path: `/${[...ancestorSlugs, node.slug].join("/")}/`,
        parentName: inherited.parentName,
        systemSlug: isStar ? node.slug : inherited.systemSlug,
        systemName: isStar ? node.name : inherited.systemName,
        bodySlug: isBody ? node.slug : inherited.bodySlug,
        bodyName: isBody ? node.name : inherited.bodyName,
        childCount: children.length,
        shopCount: shopsBelow,
        planCount: node.planSize,
      },
    });

    return shopsBelow + (node.type === "shop" ? 1 : 0);
  }

  for (const root of roots) visit(root, rootInherited);

  const stored = new Map(nodes.map((node) => [node.slug, node]));
  const operations = rebuilt
    .filter(({ slug, values }) => {
      const before = stored.get(slug) as Record<string, unknown> | undefined;
      return DERIVED_KEYS.some(
        (key) => JSON.stringify(before?.[key]) !== JSON.stringify(values[key]),
      );
    })
    .map(({ slug, values }) => {
      const $set = withoutUndefined(values) as Document;
      const $unset = Object.fromEntries(
        DERIVED_KEYS.filter((key) => values[key] === undefined).map((key) => [
          key,
          "",
        ]),
      );
      return {
        updateOne: {
          filter: { slug },
          update: {
            $set,
            ...(Object.keys($unset).length > 0 ? { $unset } : {}),
          } as UpdateFilter<PlaceDbModel>,
        },
      };
    });

  if (operations.length === 0) return 0;
  await collection().bulkWrite(operations, { ordered: false });
  return operations.length;
}

/** Recalcule les champs dérivés d'un lieu et de tout ce qu'il contient. */
export async function recomputeSubtree(rootSlug: string): Promise<number> {
  const nodes = await loadSubtree(rootSlug);
  const root = nodes.find((node) => node.slug === rootSlug);
  if (!root) return 0;

  return rebuild(nodes, [root], await ancestryOf(root.parentSlug));
}

/**
 * Repart de zéro sur tout le catalogue, en ne suivant que `parentSlug`. C'est
 * ce que lance la fin d'un import — qui insère les lieux dans le désordre — et
 * c'est le bouton de réparation quand un arbre a l'air faux.
 */
export async function recomputeAllPlaces(): Promise<number> {
  const nodes = await loadNodes({});
  const known = new Set(nodes.map((node) => node.slug));
  // Un lieu dont le parent a disparu est traité comme une racine plutôt que
  // laissé de côté : mieux vaut un lieu mal rangé qu'un lieu introuvable.
  const roots = nodes.filter(
    (node) => !node.parentSlug || !known.has(node.parentSlug),
  );
  return rebuild(nodes, roots, { ancestorSlugs: [] });
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

const SUMMARY_PROJECTION = {
  _id: 0,
  id: 1,
  slug: 1,
  name: 1,
  type: 1,
  imageUrl: 1,
  services: 1,
  shopCategory: 1,
  parentSlug: 1,
  parentName: 1,
  depth: 1,
  systemSlug: 1,
  systemName: 1,
  bodySlug: 1,
  bodyName: 1,
  childCount: 1,
  shopCount: 1,
  planCount: 1,
} as const;

export type PlaceFilters = {
  query?: string;
  type?: string;
  system?: string;
  body?: string;
  service?: string;
  /** Les lieux contenus directement par celui-ci. */
  parent?: string;
  /** Tout le sous-arbre de celui-ci, lui exclu. */
  under?: string;
  sort?: string;
  limit?: number;
  page?: number;
};

function buildFilter(filters: PlaceFilters): Filter<PlaceDbModel> {
  const conditions: Filter<PlaceDbModel>[] = [];

  const query = filters.query?.trim();
  if (query) {
    const matcher = { $regex: escapeRegex(query), $options: "i" };
    conditions.push({
      $or: [
        { name: matcher },
        { description: matcher },
        { parentName: matcher },
        { systemName: matcher },
        { bodyName: matcher },
      ],
    });
  }

  if (filters.type && isPlaceType(filters.type)) {
    conditions.push({ type: filters.type });
  }
  if (filters.system) conditions.push({ systemSlug: filters.system });
  if (filters.body) conditions.push({ bodySlug: filters.body });
  if (filters.service && isPlaceService(filters.service)) {
    conditions.push({ services: filters.service });
  }
  if (filters.parent) conditions.push({ parentSlug: filters.parent });
  if (filters.under) conditions.push({ ancestorSlugs: filters.under });

  return conditions.length > 0 ? { $and: conditions } : {};
}

function buildSort(sort?: string): Document {
  const key = sort && isPlaceSort(sort) ? sort : "name";
  if (key === "children") return { childCount: -1, name: 1 };
  if (key === "plans") return { planCount: -1, name: 1 };
  return { name: 1 };
}

export async function filterPlaces(
  filters: PlaceFilters = {},
): Promise<{ places: PlaceSummary[]; total: number }> {
  const limit = Math.max(
    1,
    Math.min(MAX_PLACE_PAGE_SIZE, filters.limit ?? PLACE_PAGE_SIZE),
  );
  const page = Math.max(1, filters.page ?? 1);
  const filter = buildFilter(filters);

  const [places, total] = await Promise.all([
    collection()
      .find(filter, { projection: SUMMARY_PROJECTION })
      .sort(buildSort(filters.sort))
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    collection().countDocuments(filter),
  ]);

  return { places: places as PlaceSummary[], total };
}

/**
 * La vue arborescente : les lieux qui répondent au filtre, plus ceux qui les
 * contiennent, à afficher estompés. Deux requêtes et aucune récursion — le tri
 * sur `path` rend déjà la liste dans l'ordre de parcours de l'arbre.
 */
export async function listPlaceTree(
  filters: PlaceFilters = {},
): Promise<PlaceTreeResponse> {
  const matches = await collection()
    .find(buildFilter(filters), {
      projection: { _id: 0, slug: 1, ancestorSlugs: 1 },
    })
    .limit(MAX_PLACE_TREE_NODES)
    .toArray();

  const total = await collection().countDocuments(buildFilter(filters));
  const matched = new Set(matches.map((place) => place.slug));
  const needed = new Set(matched);
  for (const place of matches) {
    for (const ancestor of place.ancestorSlugs ?? []) needed.add(ancestor);
  }

  const nodes = await collection()
    .find({ slug: { $in: [...needed] } }, { projection: SUMMARY_PROJECTION })
    .sort({ path: 1 })
    .toArray();

  return {
    nodes: nodes.map((node) => ({
      ...(node as PlaceSummary),
      matched: matched.has(node.slug),
    })) as PlaceTreeNode[],
    total,
    truncated: total > matches.length,
  };
}

export async function getPlaceBySlug(slug: string): Promise<Place | null> {
  const place = await collection().findOne(
    { slug },
    { projection: { _id: 0 } },
  );
  return place ?? null;
}

/**
 * Les lieux que les repères d'une liste de plans ouvrent. Résolus en une
 * requête : le visualiseur en tire le nom, le type — qui décide de l'allure de
 * la pastille — et de quoi savoir si la descente mène quelque part.
 */
async function resolveMarkerTargets(
  plans: PlacePlan[] | undefined,
): Promise<PlaceSummary[]> {
  const slugs = Array.from(
    new Set(
      (plans ?? []).flatMap((plan) =>
        plan.markers
          .map((marker) => marker.targetSlug)
          .filter((slug): slug is string => !!slug),
      ),
    ),
  );
  if (slugs.length === 0) return [];

  const targets = await collection()
    .find({ slug: { $in: slugs } }, { projection: SUMMARY_PROJECTION })
    .toArray();
  return targets as PlaceSummary[];
}

/**
 * Remplace chaque emprunt par le plan de sa source, en une requête quel que
 * soit leur nombre. C'est ici, et nulle part ailleurs, que « le plan de
 * Phoenix-I » devient un plan affichable sur Phoenix-II — donc une correction
 * chez la source se voit partout dès la lecture suivante, sans rien recopier.
 *
 * Un emprunt dont la source a disparu, ou dont le plan visé n'existe plus,
 * n'est pas rendu : mieux vaut un plan de moins qu'un plan faux. L'éditeur, lui,
 * lit la forme brute et peut donc encore montrer l'emprunt cassé pour le retirer.
 */
async function resolvePlans(
  plans: StoredPlacePlan[] | undefined,
): Promise<PlacePlan[]> {
  const stored = plans ?? [];
  const refs = stored.filter(isPlacePlanRef);
  if (refs.length === 0) return stored as PlacePlan[];

  const sources = await collection()
    .find({ slug: { $in: [...new Set(refs.map((ref) => ref.sourceSlug))] } })
    .project<{ slug: string; name: string; plans?: StoredPlacePlan[] }>({
      _id: 0,
      slug: 1,
      name: 1,
      plans: 1,
    })
    .toArray();
  const bySlug = new Map(sources.map((source) => [source.slug, source]));

  return stored
    .map((plan): PlacePlan | null => {
      if (!isPlacePlanRef(plan)) return plan;

      const source = bySlug.get(plan.sourceSlug);
      // Un emprunt ne vise qu'un plan possédé : chercher parmi eux seulement
      // suffit à interdire les chaînes, sans avoir à les suivre.
      const original = source?.plans?.find(
        (candidate): candidate is PlacePlan =>
          !isPlacePlanRef(candidate) && candidate.id === plan.sourcePlanId,
      );
      if (!source || !original) return null;

      return {
        ...original,
        // L'identité locale l'emporte : c'est elle que porte l'ancre `?plan=`.
        // Le nom, lui, reste celui de la source : un libellé propre à
        // l'emprunteur serait un champ de plus à tenir à jour le jour où la
        // source se renomme, pour un gain qu'aucun cas n'a réclamé.
        id: plan.id,
        borrowedFrom: {
          slug: source.slug,
          name: source.name,
          planId: original.id,
        } satisfies PlacePlanOrigin,
      };
    })
    .filter((plan): plan is PlacePlan => plan !== null);
}

export async function getPlaceDetails(
  slug: string,
): Promise<PlaceDetails | null> {
  const place = await getPlaceBySlug(slug);
  if (!place) return null;

  const plans = await resolvePlans(place.plans);
  const [ancestors, children, shops, planTargets] = await Promise.all([
    collection()
      .find({ slug: { $in: place.ancestorSlugs ?? [] } })
      .project<PlaceAncestor>({ _id: 0, slug: 1, name: 1, type: 1 })
      .toArray(),
    collection()
      .find({ parentSlug: slug }, { projection: SUMMARY_PROJECTION })
      .sort({ name: 1 })
      .toArray(),
    // Les magasins de Lorville se tiennent dans ses quartiers, pas sous elle :
    // la fiche interroge tout le sous-arbre.
    collection()
      .find(
        { ancestorSlugs: slug, type: "shop" },
        { projection: SUMMARY_PROJECTION },
      )
      .sort({ name: 1 })
      .toArray(),
    resolveMarkerTargets(plans),
  ]);

  const ordered = (place.ancestorSlugs ?? [])
    .map((ancestorSlug) => ancestors.find((node) => node.slug === ancestorSlug))
    .filter((node): node is PlaceAncestor => !!node);

  return {
    ...place,
    plans,
    ancestors: ordered,
    children: children as PlaceSummary[],
    shops: shops as PlaceSummary[],
    planTargets,
  };
}

/** Ce qu'il faut pour afficher le plan d'un lieu voisin, et rien de plus. */
export async function getPlacePlans(
  slug: string,
): Promise<PlacePlansResponse | null> {
  const place = await collection().findOne(
    { slug },
    {
      projection: {
        _id: 0,
        slug: 1,
        name: 1,
        type: 1,
        ancestorSlugs: 1,
        plans: 1,
      },
    },
  );
  if (!place) return null;

  const plans = await resolvePlans(place.plans);
  const [ancestors, targets] = await Promise.all([
    collection()
      .find({ slug: { $in: place.ancestorSlugs ?? [] } })
      .project<PlaceAncestor>({ _id: 0, slug: 1, name: 1, type: 1 })
      .toArray(),
    resolveMarkerTargets(plans),
  ]);

  return {
    slug: place.slug,
    name: place.name,
    type: place.type,
    ancestorSlugs: place.ancestorSlugs ?? [],
    ancestors: (place.ancestorSlugs ?? [])
      .map((ancestorSlug) =>
        ancestors.find((node) => node.slug === ancestorSlug),
      )
      .filter((node): node is PlaceAncestor => !!node),
    plans,
    targets,
  };
}

// ─── Partage de plans ─────────────────────────────────────────────────────────

/**
 * Les familles de lieux qui se ressemblent assez pour partager un plan : les
 * dix Farro Data Center, les six avant-postes abandonnés de Pyro, les Lazarus
 * Complex. Le rapprochement se fait sur le nom, faute de mieux — le dump ne dit
 * nulle part que deux lieux sortent du même moule.
 *
 * Les corps célestes sont écartés : « Pyro I », « Pyro IV » et « Pyro V »
 * forment un groupe parfait pour l'algorithme et parfaitement inutile pour le
 * produit — une planète ne se relève pas au plan.
 *
 * Rien n'est décidé ici : l'écran propose, un humain rapproche.
 */
export async function listPlaceGroups(): Promise<PlaceGroup[]> {
  const places = await collection()
    .find({ type: { $nin: ["star", "planet", "moon"] } })
    .project<{
      slug: string;
      name: string;
      type: PlaceType;
      systemName?: string;
      parentName?: string;
      plans?: StoredPlacePlan[];
    }>({
      _id: 0,
      slug: 1,
      name: 1,
      type: 1,
      systemName: 1,
      parentName: 1,
      // Comme ci-dessus : l'écran n'affiche que des noms, et `sourcePlanId`
      // est ce qui permet encore de distinguer un emprunt d'un plan possédé.
      "plans.id": 1,
      "plans.name": 1,
      "plans.sourceSlug": 1,
      "plans.sourcePlanId": 1,
    })
    .sort({ name: 1 })
    .toArray();

  const byKey = new Map<string, PlaceGroupMember[]>();
  for (const place of places) {
    const key = placeGroupKey(place.name);
    if (!key) continue;

    const plans = place.plans ?? [];
    const member: PlaceGroupMember = {
      slug: place.slug,
      name: place.name,
      type: place.type,
      systemName: place.systemName,
      parentName: place.parentName,
      ownPlans: plans
        .filter((plan): plan is PlacePlan => !isPlacePlanRef(plan))
        .map((plan) => ({ id: plan.id, name: plan.name })),
      borrowed: plans.filter(isPlacePlanRef).map((ref) => ({
        id: ref.id,
        sourceSlug: ref.sourceSlug,
        sourcePlanId: ref.sourcePlanId,
      })),
    };
    byKey.set(key, [...(byKey.get(key) ?? []), member]);
  }

  const groups = [...byKey.entries()]
    .filter(([, members]) => members.length >= MIN_PLACE_GROUP_SIZE)
    .map(([key, members]) => ({ key, members }));

  // Le nom des sources empruntées, pour que l'écran dise « emprunté à X » sans
  // que chaque ligne ait à repartir en base.
  const sourceSlugs = new Set(
    groups.flatMap((group) =>
      group.members.flatMap((member) =>
        member.borrowed.map((ref) => ref.sourceSlug),
      ),
    ),
  );
  if (sourceSlugs.size > 0) {
    const sources = await collection()
      .find({ slug: { $in: [...sourceSlugs] } })
      .project<{ slug: string; name: string }>({ _id: 0, slug: 1, name: 1 })
      .toArray();
    const names = new Map(sources.map((source) => [source.slug, source.name]));
    for (const group of groups) {
      for (const member of group.members) {
        for (const ref of member.borrowed) {
          ref.sourceName = names.get(ref.sourceSlug);
        }
      }
    }
  }

  // Les grandes familles d'abord : c'est là que le partage fait gagner le plus.
  return groups.sort(
    (a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key),
  );
}

/**
 * `linked` porte les slugs, pas un compte : l'appelant s'en sert pour ne
 * revalider que les pages réellement changées, et le compte s'en déduit.
 */
/** Un lieu qui possède au moins un plan, donc capable d'en prêter un. */
export type LendablePlace = {
  slug: string;
  name: string;
  systemName?: string;
  plans: { id: string; name: string }[];
};

/**
 * Tous les plans que le catalogue peut prêter, groupes confondus.
 *
 * L'écran de liaison proposait d'abord les seuls plans du groupe courant, pour
 * ne pas noyer le cas courant. Mais deux familles voisines ne partagent pas
 * forcément un nom : « Lazarus Complex Tithonus » n'a aucun plan à lui, alors
 * que « Lazarus Complex Phoenix » en a un, et rien ne les rapproche
 * automatiquement — ce sont deux sites. Le groupe se retrouvait bloqué sans
 * recours. On expose donc tout, en laissant l'écran mettre le groupe en tête.
 */
export async function listLendablePlans(): Promise<LendablePlace[]> {
  const places = await collection()
    .find({ "plans.0": { $exists: true } })
    // On ne ramène pas les repères : douze plans à cent vingt repères par lieu
    // pèsent lourd pour une liste de choix. `plans.sourcePlanId` est projeté
    // bien qu'il ne soit jamais lu ici — sans lui `isPlacePlanRef` cesserait de
    // reconnaître un emprunt, et les plans empruntés seraient proposés au prêt.
    .project<{
      slug: string;
      name: string;
      systemName?: string;
      plans?: StoredPlacePlan[];
    }>({
      _id: 0,
      slug: 1,
      name: 1,
      systemName: 1,
      "plans.id": 1,
      "plans.name": 1,
      "plans.sourceSlug": 1,
      "plans.sourcePlanId": 1,
    })
    .sort({ name: 1 })
    .toArray();

  return places
    .map((place) => ({
      slug: place.slug,
      name: place.name,
      systemName: place.systemName,
      // Un emprunt ne se prête pas : seuls les plans possédés sont prêtables,
      // ce qui interdit les chaînes dès la liste des choix.
      plans: (place.plans ?? [])
        .filter((plan): plan is PlacePlan => !isPlacePlanRef(plan))
        .map((plan) => ({ id: plan.id, name: plan.name })),
    }))
    .filter((place) => place.plans.length > 0);
}

export type SharePlanReport = { linked: string[]; skipped: string[] };

/**
 * Fait afficher un plan par plusieurs lieux d'un coup. C'est l'opération que
 * l'écran de liaison déclenche, et la seule qui écrive des emprunts en masse.
 *
 * Idempotente : un lieu qui emprunte déjà ce plan est laissé tel quel plutôt
 * que d'en accumuler deux exemplaires. Les refus sont nommés un par un — un
 * rapport qui dit « 7 liés » sans dire lesquels manquent ne sert à rien.
 */
export async function sharePlanToPlaces(
  sourceSlug: string,
  sourcePlanId: string,
  targetSlugs: string[],
): Promise<SharePlanReport> {
  const source = await getPlaceBySlug(sourceSlug);
  if (!source) throw new Error("Lieu source introuvable");

  const owned = (source.plans ?? []).some(
    (plan) => !isPlacePlanRef(plan) && plan.id === sourcePlanId,
  );
  if (!owned) {
    throw new Error(
      `« ${source.name} » ne possède pas ce plan : on ne peut pas emprunter un emprunt`,
    );
  }

  const wanted = [...new Set(targetSlugs)].filter(
    (slug) => slug !== sourceSlug,
  );
  if (wanted.length === 0) return { linked: [], skipped: [] };

  const targets = await collection()
    .find({ slug: { $in: wanted } })
    .project<{ slug: string; name: string; plans?: StoredPlacePlan[] }>({
      _id: 0,
      slug: 1,
      name: 1,
      plans: 1,
    })
    .toArray();

  const { nanoid } = await import("nanoid");
  const report: SharePlanReport = { linked: [], skipped: [] };
  const writes: AnyBulkWriteOperation<PlaceDbModel>[] = [];

  for (const target of targets) {
    const plans = target.plans ?? [];
    const already = plans.some(
      (plan) =>
        isPlacePlanRef(plan) &&
        plan.sourceSlug === sourceSlug &&
        plan.sourcePlanId === sourcePlanId,
    );
    if (already) {
      report.skipped.push(`${target.name} (emprunte déjà ce plan)`);
      continue;
    }
    if (plans.length >= MAX_PLACE_PLANS) {
      report.skipped.push(`${target.name} (déjà ${MAX_PLACE_PLANS} plans)`);
      continue;
    }

    writes.push({
      updateOne: {
        filter: { slug: target.slug },
        update: {
          $push: {
            plans: { id: nanoid(), sourceSlug, sourcePlanId },
          },
          $inc: { planCount: 1 },
          $set: { updatedAt: new Date().toISOString() },
        },
      },
    });
    report.linked.push(target.slug);
  }

  const missing = wanted.filter(
    (slug) => !targets.some((target) => target.slug === slug),
  );
  for (const slug of missing) report.skipped.push(`${slug} (introuvable)`);

  if (writes.length > 0) await collection().bulkWrite(writes);
  return report;
}

/**
 * Retire un emprunt. Le lieu cesse simplement d'afficher le plan du voisin ;
 * la source n'est pas touchée.
 */
export async function removeBorrowedPlan(
  slug: string,
  planId: string,
): Promise<Place> {
  const place = await getPlaceBySlug(slug);
  if (!place) throw new Error("Lieu introuvable");

  const plans = (place.plans ?? []).filter(
    (plan) => !(isPlacePlanRef(plan) && plan.id === planId),
  );
  return savePlacePlans(slug, plans);
}

export async function getPlaceFacets(): Promise<PlaceFacets> {
  const [facets] = await collection()
    .aggregate<{
      types: { _id: PlaceType; count: number }[];
      systems: { _id: string; name?: string }[];
      bodies: { _id: string; name?: string; systemSlug?: string }[];
      services: { _id: PlaceService; count: number }[];
    }>([
      {
        $facet: {
          types: [
            { $group: { _id: "$type", count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          systems: [
            { $match: { systemSlug: { $nin: [null, ""] } } },
            { $group: { _id: "$systemSlug", name: { $first: "$systemName" } } },
            { $sort: { name: 1 } },
          ],
          bodies: [
            { $match: { bodySlug: { $nin: [null, ""] } } },
            {
              $group: {
                _id: "$bodySlug",
                name: { $first: "$bodyName" },
                systemSlug: { $first: "$systemSlug" },
              },
            },
            { $sort: { name: 1 } },
          ],
          services: [{ $unwind: "$services" }, { $sortByCount: "$services" }],
        },
      },
    ])
    .toArray();

  return {
    types: (facets?.types ?? []).map((entry) => ({
      value: entry._id,
      count: entry.count,
    })),
    systems: (facets?.systems ?? []).map((entry) => ({
      slug: entry._id,
      name: entry.name ?? entry._id,
    })),
    bodies: (facets?.bodies ?? []).map((entry) => ({
      slug: entry._id,
      name: entry.name ?? entry._id,
      systemSlug: entry.systemSlug,
    })),
    services: (facets?.services ?? []).map((entry) => ({
      value: entry._id,
      count: entry.count,
    })),
  };
}

// ─── Écriture ────────────────────────────────────────────────────────────────

/**
 * Un lieu ne peut pas se contenir lui-même, ni contenir celui qui le contient,
 * ni s'enfoncer indéfiniment. Vérifié avant toute écriture de `parentSlug` :
 * une boucle rendrait `recomputeSubtree` infini et l'arbre inaffichable.
 */
async function assertParentIsSound(
  slug: string,
  parentSlug: string | undefined,
): Promise<void> {
  if (!parentSlug) return;
  if (parentSlug === slug) {
    throw new Error("Un lieu ne peut pas être contenu dans lui-même");
  }

  const parent = await collection().findOne(
    { slug: parentSlug },
    { projection: { _id: 0, slug: 1, ancestorSlugs: 1, depth: 1 } },
  );
  if (!parent) {
    throw new Error(`Le lieu « ${parentSlug} » n'existe pas`);
  }
  if ((parent.ancestorSlugs ?? []).includes(slug)) {
    throw new Error(
      "Un lieu ne peut pas être contenu dans l'un des lieux qu'il contient",
    );
  }
  if ((parent.depth ?? 0) + 1 > MAX_PLACE_DEPTH) {
    throw new Error(
      `L'arborescence des lieux est limitée à ${MAX_PLACE_DEPTH} niveaux`,
    );
  }
}

function duplicateSlugError(slug: string, name: string): Error {
  return Object.assign(
    new Error(`Un lieu utilise déjà le slug « ${slug} » (${name})`),
    { code: 11000 },
  );
}

export async function createPlace(input: PlaceInput): Promise<Place> {
  const normalized = normalizePlaceInput(input);
  await assertParentIsSound(normalized.slug, normalized.parentSlug);

  const { nanoid } = await import("nanoid");
  const now = new Date().toISOString();
  const place: Place = {
    ...normalized,
    id: nanoid(),
    // Valeurs d'attente : `recomputeSubtree` les remplace juste après, et une
    // insertion qui échoue n'aura rien laissé d'à moitié calculé.
    ancestorSlugs: [],
    depth: 0,
    path: `/${normalized.slug}/`,
    childCount: 0,
    shopCount: 0,
    planCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await collection().insertOne(withoutUndefined(place) as PlaceDbModel);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const { keyPattern } = error as { keyPattern?: Record<string, unknown> };
      throw Object.assign(
        new Error(
          keyPattern && "source.id" in keyPattern
            ? `Un lieu importé porte déjà la provenance de « ${place.name} »`
            : `Un lieu utilise déjà le slug « ${place.slug} »`,
        ),
        { code: 11000, keyPattern },
      );
    }
    throw error;
  }

  await recomputeSubtree(place.slug);
  if (place.parentSlug) await refreshChildCount(place.parentSlug);

  return (await getPlaceBySlug(place.slug)) ?? place;
}

/** Recompte les enfants d'un lieu depuis la base plutôt qu'avec un `$inc`. */
async function refreshChildCount(slug: string): Promise<void> {
  const childCount = await collection().countDocuments({ parentSlug: slug });
  await collection().updateOne({ slug }, { $set: { childCount } });
}

export async function updatePlace(
  currentSlug: string,
  input: PlaceInput,
): Promise<Place> {
  const normalized = normalizePlaceInput(input);
  const before = await getPlaceBySlug(currentSlug);
  if (!before) throw new Error("Lieu introuvable");

  await assertParentIsSound(normalized.slug, normalized.parentSlug);

  const entries = Object.entries(normalized) as [
    keyof NormalizedPlace,
    unknown,
  ][];

  // Un champ vidé par le formulaire est retiré plutôt qu'écrit à `undefined`
  // (que le driver stockerait en `null`), sinon l'ancienne valeur survivrait à
  // l'édition censée l'effacer. La provenance fait exception : le formulaire ne
  // l'envoie jamais, et l'écraser transformerait un lieu importé en lieu saisi
  // à la main, que le prochain import recréerait en double.
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
      } as UpdateFilter<PlaceDbModel>,
      { returnDocument: "after", projection: { _id: 0 } },
    );
    if (!updated) throw new Error("Lieu introuvable");
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw duplicateSlugError(normalized.slug, normalized.name);
    }
    throw error;
  }

  if (normalized.slug !== currentSlug) {
    // Le slug est l'adresse de la fiche : les lieux contenus le portent dans
    // leur chaîne d'ancêtres, et des repères de plan pointent dessus.
    await collection().updateMany(
      { parentSlug: currentSlug },
      { $set: { parentSlug: normalized.slug } },
    );
    await collection().updateMany(
      { "plans.markers.targetSlug": currentSlug },
      { $set: { "plans.$[].markers.$[marker].targetSlug": normalized.slug } },
      { arrayFilters: [{ "marker.targetSlug": currentSlug }] },
    );
    // Et les lieux qui lui empruntent un plan le désignent par son slug.
    await collection().updateMany(
      { "plans.sourceSlug": currentSlug },
      { $set: { "plans.$[plan].sourceSlug": normalized.slug } },
      { arrayFilters: [{ "plan.sourceSlug": currentSlug }] },
    );
  }

  await recomputeSubtree(normalized.slug);
  if (before.parentSlug && before.parentSlug !== normalized.parentSlug) {
    await refreshChildCount(before.parentSlug);
  }
  if (normalized.parentSlug) await refreshChildCount(normalized.parentSlug);

  return (await getPlaceBySlug(normalized.slug)) as Place;
}

/**
 * Supprimer un lieu qui en contient d'autres orphelinerait tout un sous-arbre :
 * on refuse, et l'administrateur déplace ou supprime le contenu d'abord.
 */
export async function deletePlace(slug: string): Promise<boolean> {
  const place = await getPlaceBySlug(slug);
  if (!place) return false;

  const childCount = await collection().countDocuments({ parentSlug: slug });
  if (childCount > 0) {
    throw new Error(
      `« ${place.name} » contient ${childCount} lieu${childCount > 1 ? "x" : ""} : videz-le avant de le supprimer`,
    );
  }

  // Ses plans sont peut-être affichés ailleurs. Les emporter ferait disparaître
  // un plan chez des lieux que personne n'a touchés.
  const borrowers = await borrowersOf(slug);
  if (borrowers.length > 0) {
    const names = borrowers.map((borrower) => borrower.name);
    throw new Error(
      `${andList(names)} emprunte${names.length > 1 ? "nt" : ""} un plan de « ${place.name} » : détachez-les avant de le supprimer`,
    );
  }

  const { deletedCount } = await collection().deleteOne({ slug });
  if (!deletedCount) return false;

  // Les repères qui l'ouvraient n'ouvrent plus rien : ils partent avec lui.
  await collection().updateMany({ "plans.markers.targetSlug": slug }, {
    $pull: { "plans.$[].markers": { targetSlug: slug } },
  } as UpdateFilter<PlaceDbModel>);
  if (place.parentSlug) await refreshChildCount(place.parentSlug);

  return true;
}

/**
 * Pose la vignette d'un lieu, et rien d'autre. Passer par `updatePlace`
 * obligerait à lui repasser toute la fiche, et un champ oublié en chemin
 * serait effacé — l'import d'images n'a pas à connaître le reste.
 *
 * Une URL refusée lève, elle ne rend pas `false` : le booléen ne répond qu'à
 * « le lieu existait-il ? ». Les confondre ferait passer un bogue d'appelant
 * pour un slug manquant, et c'est le mauvais endroit où aller chercher.
 */
export async function setPlaceImage(
  slug: string,
  imageUrl: string,
): Promise<boolean> {
  const url = optionalUrl(imageUrl);
  if (!url) throw new Error(`URL d'image invalide : ${imageUrl}`);

  const { matchedCount } = await collection().updateOne(
    { slug },
    { $set: { imageUrl: url, updatedAt: new Date().toISOString() } },
  );
  return matchedCount > 0;
}

/** Les lieux qui empruntent un plan à celui-ci, avec les plans qu'ils visent. */
async function borrowersOf(
  slug: string,
): Promise<{ name: string; planIds: string[] }[]> {
  const borrowers = await collection()
    .find({ "plans.sourceSlug": slug })
    .project<{ slug: string; name: string; plans?: StoredPlacePlan[] }>({
      _id: 0,
      slug: 1,
      name: 1,
      plans: 1,
    })
    .toArray();

  return borrowers
    .filter((borrower) => borrower.slug !== slug)
    .map((borrower) => ({
      name: borrower.name,
      planIds: (borrower.plans ?? [])
        .filter(isPlacePlanRef)
        .filter((ref) => ref.sourceSlug === slug)
        .map((ref) => ref.sourcePlanId),
    }));
}

function andList(names: string[]): string {
  return names.length > 2
    ? `${names.slice(0, 2).join(", ")} et ${names.length - 2} autre${names.length > 3 ? "s" : ""}`
    : names.join(" et ");
}

/**
 * Deux vérifications qu'on ne peut pas faire dans un normaliseur pur, parce
 * qu'elles regardent les autres lieux.
 *
 * Un emprunt doit viser un plan qui existe et qui est possédé : on refuse
 * plutôt que d'écrire une référence morte, qui ne se verrait qu'à l'affichage,
 * sous la forme d'un plan manquant sans explication.
 *
 * Et une source ne retire pas un plan que d'autres affichent. C'est le prix de
 * la référence : sans ce garde-fou, corriger ses propres plans ferait
 * silencieusement disparaître celui de dix voisins.
 */
async function assertPlansAreSafe(
  slug: string,
  plans: StoredPlacePlan[],
): Promise<void> {
  const refs = plans.filter(isPlacePlanRef);
  if (refs.length > 0) {
    const sources = await collection()
      .find({ slug: { $in: [...new Set(refs.map((ref) => ref.sourceSlug))] } })
      .project<{ slug: string; plans?: StoredPlacePlan[] }>({
        _id: 0,
        slug: 1,
        plans: 1,
      })
      .toArray();
    const bySlug = new Map(sources.map((source) => [source.slug, source]));

    for (const ref of refs) {
      const owned = bySlug
        .get(ref.sourceSlug)
        ?.plans?.some(
          (candidate) =>
            !isPlacePlanRef(candidate) && candidate.id === ref.sourcePlanId,
        );
      if (!owned) {
        throw new Error(
          `Le plan emprunté à « ${ref.sourceSlug} » n'existe plus, ou n'est lui-même qu'un emprunt`,
        );
      }
    }
  }

  const kept = new Set(
    plans.filter((plan) => !isPlacePlanRef(plan)).map((plan) => plan.id),
  );
  const orphaned = (await borrowersOf(slug)).filter((borrower) =>
    borrower.planIds.some((planId) => !kept.has(planId)),
  );
  if (orphaned.length > 0) {
    const names = orphaned.map((borrower) => borrower.name);
    throw new Error(
      `${andList(names)} affiche${names.length > 1 ? "nt" : ""} un de ces plans : détachez-les avant de le retirer`,
    );
  }
}

/** Les plans sont remplacés en bloc : l'éditeur envoie toujours l'état complet. */
export async function savePlacePlans(
  slug: string,
  plans: unknown,
): Promise<Place> {
  const normalized = normalizePlans(plans, slug);
  await assertPlansAreSafe(slug, normalized);

  const updated = await collection().findOneAndUpdate(
    { slug },
    {
      $set: {
        plans: normalized,
        planCount: normalized.length,
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after", projection: { _id: 0 } },
  );
  if (!updated) throw new Error("Lieu introuvable");

  return updated as Place;
}

// ─── Import ──────────────────────────────────────────────────────────────────

export async function findPlaceBySource(
  name: PlaceSourceName,
  id: string,
): Promise<Place | null> {
  const place = await collection().findOne(
    { "source.name": name, "source.id": id },
    { projection: { _id: 0 } },
  );
  return place ?? null;
}

export type ImportPlaceOutcome = {
  action: "created" | "updated" | "skipped";
  place: Place;
};

/**
 * Crée le lieu qu'un import a trouvé, ou rafraîchit celui qu'un import
 * précédent avait créé sous la même provenance. À la mise à jour, le slug ne
 * bouge pas — c'est l'adresse de la fiche — et la description, les services,
 * l'image et les plans ne sont jamais écrasés : la source n'en sait rien, un
 * administrateur si.
 */
export async function upsertImportedPlace(
  input: PlaceInput,
  options: { update?: boolean; slugFallbacks?: string[] } = {},
): Promise<ImportPlaceOutcome> {
  const source = input.source as Place["source"] | undefined;
  if (!source?.name || !source?.id) {
    throw new Error("Un lieu importé doit porter sa provenance");
  }

  const existing = await findPlaceBySource(source.name, source.id);
  if (existing) {
    if (!options.update) return { action: "skipped", place: existing };

    const normalized = normalizePlaceInput({ ...input, slug: existing.slug });
    const updated = await updatePlace(existing.slug, {
      ...input,
      slug: existing.slug,
      description: existing.description ?? normalized.description,
      imageUrl: existing.imageUrl ?? normalized.imageUrl,
      services: existing.services ?? normalized.services,
      source: existing.source,
    });
    return { action: "updated", place: updated };
  }

  const base = toPlaceSlug(
    text(input.slug, MAX_PLACE_NAME_LENGTH) || input.name,
  );
  const candidates = [
    base,
    ...(options.slugFallbacks ?? []).map((hint) =>
      toPlaceSlug(`${base} ${hint}`),
    ),
    ...[2, 3, 4, 5].map((suffix) => `${base}-${suffix}`),
  ];

  let lastError: unknown;
  for (const slug of candidates) {
    if (!slug) continue;
    try {
      const place = await createPlace({
        ...input,
        slug,
        source: { ...source, importedAt: new Date().toISOString() },
      });
      return { action: "created", place };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? duplicateSlugError(base, input.name);
}
