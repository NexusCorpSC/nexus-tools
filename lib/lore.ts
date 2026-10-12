import "server-only";
import type { Filter } from "mongodb";
import db from "@/lib/db";
import {
  LORE_PAGE_SIZE,
  LORE_SEARCH_LIMIT,
  type LoreArticle,
  type StarmapEntry,
} from "@/types/lore";

/**
 * La lecture du lore importé par `npm run import:game-data -- lore` : les
 * articles de la Galactapedia (`loreArticles`) et la starmap de RSI
 * (`starmap`). Les fiches disparues de la source (`removedAt`) ne sont plus
 * montrées.
 */

const articles = () => db.db().collection<LoreArticle>("loreArticles");
const starmap = () => db.db().collection<StarmapEntry>("starmap");

const LIVE = { removedAt: { $exists: false } } as const;

/** Un texte cherché tel quel : la recherche est publique. */
const escapeRegex = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type LoreArticleSummary = {
  id: string;
  title: string;
  type?: string;
  categories: string[];
  excerpt: string;
  rsiUrl: string;
  thumbnailUrl?: string;
};

const EXCERPT_LENGTH = 280;

/** Le texte sans la syntaxe des liens Markdown : « [Nyx](…) » → « Nyx ». */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(markdown: string, length = EXCERPT_LENGTH): string {
  const text = plainText(markdown);
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : length)}…`;
}

const SUMMARY_PROJECTION = {
  _id: 0,
  wikiId: 1,
  title: 1,
  type: 1,
  categories: 1,
  body: 1,
  rsiUrl: 1,
  thumbnailUrl: 1,
} as const;

type SummaryDoc = Pick<
  LoreArticle,
  | "wikiId"
  | "title"
  | "type"
  | "categories"
  | "body"
  | "rsiUrl"
  | "thumbnailUrl"
>;

function toSummary(doc: SummaryDoc): LoreArticleSummary {
  return {
    id: doc.wikiId,
    title: doc.title,
    type: doc.type,
    categories: doc.categories ?? [],
    excerpt: excerpt(doc.body ?? ""),
    rsiUrl: doc.rsiUrl,
    thumbnailUrl: doc.thumbnailUrl,
  };
}

export type LoreSearch = {
  query: string;
  category?: string;
  limit?: number;
};

/**
 * Les articles qui parlent de `query`, les plus pertinents d'abord (index
 * texte : le titre compte plus que les tags, puis le texte). Quand l'index
 * ne trouve rien — un mot coupé, un nom propre mal orthographié — le titre
 * est cherché tel quel.
 */
export async function searchLore({
  query,
  category,
  limit = LORE_SEARCH_LIMIT.default,
}: LoreSearch): Promise<LoreArticleSummary[]> {
  const size = Math.min(Math.max(limit, 1), LORE_SEARCH_LIMIT.max);
  const scope: Filter<LoreArticle> = {
    ...LIVE,
    ...(category ? { categories: category } : {}),
  };
  const found = await articles()
    .find(
      { ...scope, $text: { $search: query } },
      { projection: { ...SUMMARY_PROJECTION, score: { $meta: "textScore" } } },
    )
    .sort({ score: { $meta: "textScore" } })
    .limit(size)
    .toArray();
  if (found.length > 0) return found.map(toSummary);

  const byTitle = await articles()
    .find(
      { ...scope, title: { $regex: escapeRegex(query.trim()), $options: "i" } },
      { projection: SUMMARY_PROJECTION },
    )
    .sort({ title: 1 })
    .limit(size)
    .toArray();
  return byTitle.map(toSummary);
}

export type LoreBrowse = {
  query?: string;
  category?: string;
  /** À partir de 1. */
  page?: number;
};

/**
 * Une page de la Galactapedia, pour le site et l'app : les articles qui
 * parlent de `query` par pertinence, ou ceux d'une catégorie (ou tous) par
 * titre.
 */
export async function browseLore({
  query,
  category,
  page = 1,
}: LoreBrowse): Promise<{
  results: LoreArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const pageSize = LORE_PAGE_SIZE;
  const current = Math.max(1, Math.floor(page) || 1);
  const skip = (current - 1) * pageSize;
  const scope: Filter<LoreArticle> = {
    ...LIVE,
    ...(category ? { categories: category } : {}),
  };
  const words = query?.trim();
  const done = async (filter: Filter<LoreArticle>, byScore: boolean) => {
    const [docs, total] = await Promise.all([
      articles()
        .find(filter, {
          projection: byScore
            ? { ...SUMMARY_PROJECTION, score: { $meta: "textScore" } }
            : SUMMARY_PROJECTION,
        })
        .sort(byScore ? { score: { $meta: "textScore" } } : { title: 1 })
        .skip(skip)
        .limit(pageSize)
        .toArray(),
      articles().countDocuments(filter),
    ]);
    return { results: docs.map(toSummary), total, page: current, pageSize };
  };
  if (!words) return done(scope, false);
  const byText = await done({ ...scope, $text: { $search: words } }, true);
  if (byText.total > 0) return byText;
  return done(
    { ...scope, title: { $regex: escapeRegex(words), $options: "i" } },
    false,
  );
}

/**
 * Le texte d'un article avec ses liens vers d'autres articles de la
 * Galactapedia pointés vers nos fiches, quand l'article cité est en base.
 */
export function rewriteLoreLinks(
  body: string,
  known: Iterable<string>,
  path: (id: string) => string,
): string {
  const ids = new Set(known);
  return body.replace(
    /\]\((https?:\/\/robertsspaceindustries\.com)?\/galactapedia\/article\/([A-Za-z0-9]{10})[^)\s]*\)/g,
    (match, _host, id: string) => (ids.has(id) ? `](${path(id)})` : match),
  );
}

/** Les catégories de la Galactapedia, avec leur nombre d'articles. */
export async function listLoreCategories(): Promise<
  { name: string; count: number }[]
> {
  const rows = await articles()
    .aggregate<{ _id: string; count: number }>([
      { $match: LIVE },
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ])
    .toArray();
  return rows.map((row) => ({ name: row._id, count: row.count }));
}

export type StarmapRef = Pick<
  StarmapEntry,
  "code" | "kind" | "name" | "systemCode" | "placeSlug"
>;

export type LoreArticleDetails = LoreArticle & {
  /** Les articles que celui-ci cite et qui sont en base. */
  linked: { id: string; title: string }[];
  /** Les systèmes et corps de la starmap qu'il décrit. */
  starmap: StarmapRef[];
};

/** Un article par son identifiant RSI ou par son slug. */
export async function getLoreArticle(
  idOrSlug: string,
): Promise<LoreArticleDetails | null> {
  const key = idOrSlug.trim();
  const doc = await articles().findOne(
    { $or: [{ wikiId: key }, { slug: key.toLowerCase() }] },
    { projection: { _id: 0 } },
  );
  if (!doc) return null;
  const [linked, entries] = await Promise.all([
    doc.linkedIds?.length
      ? articles()
          .find(
            { wikiId: { $in: doc.linkedIds }, ...LIVE },
            { projection: { _id: 0, wikiId: 1, title: 1 } },
          )
          .toArray()
      : Promise.resolve([]),
    starmap()
      .find(
        { articleId: doc.wikiId, ...LIVE },
        {
          projection: {
            _id: 0,
            code: 1,
            kind: 1,
            name: 1,
            systemCode: 1,
            placeSlug: 1,
          },
        },
      )
      .toArray(),
  ]);
  const titles = new Map(linked.map((entry) => [entry.wikiId, entry.title]));
  return {
    ...doc,
    linked: (doc.linkedIds ?? [])
      .filter((id) => titles.has(id))
      .map((id) => ({ id, title: titles.get(id)! })),
    starmap: entries,
  };
}

export type StarSystemDetails = StarmapEntry & {
  article?: LoreArticleSummary;
  bodies: (StarmapEntry & { articleTitle?: string })[];
};

/** Ce qui compte dans un système : pas ses points de saut, déjà listés. */
const BODY_TYPES = [
  "STAR",
  "PLANET",
  "SATELLITE",
  "MANMADE",
  "ASTEROID_BELT",
  "ASTEROID_FIELD",
  "POI",
  "BLACKHOLE",
];

/** Un système par son code (`STANTON`) ou son nom (« Stanton »). */
export async function getStarSystem(
  codeOrName: string,
): Promise<StarSystemDetails | null> {
  const key = codeOrName.trim().replace(/\s+system$/i, "");
  const system = await starmap().findOne(
    {
      kind: "system",
      ...LIVE,
      $or: [
        { code: key.toUpperCase() },
        { name: { $regex: `^${escapeRegex(key)}$`, $options: "i" } },
      ],
    },
    { projection: { _id: 0 } },
  );
  if (!system) return null;
  const bodies = await starmap()
    .find(
      {
        systemCode: system.code,
        kind: "body",
        type: { $in: BODY_TYPES },
        ...LIVE,
      },
      { projection: { _id: 0, importedAt: 0, systemCode: 0, kind: 0 } },
    )
    .toArray();
  const articleIds = [
    system.articleId,
    ...bodies.map((b) => b.articleId),
  ].filter((id): id is string => !!id);
  const linked = await articles()
    .find({ wikiId: { $in: articleIds } }, { projection: SUMMARY_PROJECTION })
    .toArray();
  const byId = new Map(linked.map((doc) => [doc.wikiId, doc]));
  const order = (entry: StarmapEntry) => BODY_TYPES.indexOf(entry.type);
  return {
    ...system,
    article:
      system.articleId && byId.has(system.articleId)
        ? toSummary(byId.get(system.articleId)!)
        : undefined,
    bodies: bodies
      .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
      .map((body) => ({
        ...body,
        articleTitle: body.articleId
          ? byId.get(body.articleId)?.title
          : undefined,
      })),
  };
}

/** Les systèmes de la starmap, pour une liste ou un choix. */
export async function listStarSystems(): Promise<
  Pick<
    StarmapEntry,
    "code" | "name" | "status" | "affiliations" | "placeSlug"
  >[]
> {
  return starmap()
    .find(
      { kind: "system", ...LIVE },
      {
        projection: {
          _id: 0,
          code: 1,
          name: 1,
          status: 1,
          affiliations: 1,
          placeSlug: 1,
        },
      },
    )
    .sort({ name: 1 })
    .toArray();
}

export type PlaceLore = {
  starmap?: Pick<
    StarmapEntry,
    | "code"
    | "kind"
    | "designation"
    | "subType"
    | "description"
    | "affiliations"
    | "sensor"
  >;
  article?: LoreArticleSummary;
};

/**
 * Le lore d'un lieu du catalogue : sa fiche de la starmap, rattachée par
 * l'import, et l'article de la Galactapedia qui en parle. Une ville ou un
 * avant-poste n'est pas sur la starmap : son article se retrouve par le
 * titre (« Lorville », « Crusader (Stanton II) »).
 */
export async function getPlaceLore(place: {
  slug: string;
  name: string;
}): Promise<PlaceLore | null> {
  const entry = await starmap().findOne(
    { placeSlug: place.slug, ...LIVE },
    { projection: { _id: 0 } },
  );
  const name = escapeRegex(place.name.trim());
  const doc = entry?.articleId
    ? await articles().findOne(
        { wikiId: entry.articleId, ...LIVE },
        { projection: SUMMARY_PROJECTION },
      )
    : await articles().findOne(
        {
          ...LIVE,
          template: { $in: ["PlanetMoonSpaceStationPlatform", "StarSystem"] },
          title: {
            $regex: `^${name}(\\s+system)?(\\s*\\([^)]*\\))?$`,
            $options: "i",
          },
        },
        { projection: SUMMARY_PROJECTION },
      );
  if (!entry && !doc) return null;
  return {
    starmap: entry
      ? {
          code: entry.code,
          kind: entry.kind,
          designation: entry.designation,
          subType: entry.subType,
          description: entry.description,
          affiliations: entry.affiliations,
          sensor: entry.sensor,
        }
      : undefined,
    article: doc ? toSummary(doc) : undefined,
  };
}
