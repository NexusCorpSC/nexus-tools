import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId, type WithId } from "mongodb";
import db from "@/lib/db";
import { BLOB_HOST } from "@/lib/contribution-store";
import { getItemSummaries } from "@/lib/items";
import { getPlacesBySlugs } from "@/lib/places";
import { toItemSlug, type ItemSummary } from "@/types/items";
import {
  MAX_TIMELINE_BUG_TEXT_LENGTH,
  MAX_TIMELINE_BUG_TITLE_LENGTH,
  MAX_TIMELINE_DESCRIPTION_LENGTH,
  MAX_TIMELINE_GUIDE_BODY_LENGTH,
  MAX_TIMELINE_GUIDE_SECTIONS,
  MAX_TIMELINE_GUIDE_TITLE_LENGTH,
  MAX_TIMELINE_MISSIONS,
  MAX_TIMELINE_NAME_LENGTH,
  MAX_TIMELINE_PATCH_LENGTH,
  MAX_TIMELINE_POINTS,
  MAX_TIMELINE_RELATED,
  MAX_TIMELINE_REWARDS_PER_TIER,
  MAX_TIMELINE_SHORT_TEXT,
  MAX_TIMELINE_SOURCES,
  MAX_TIMELINE_SUMMARY_LENGTH,
  MAX_TIMELINE_TIERS,
  MAX_TIMELINE_TRACKS,
  OFFICIAL_SOURCE_HOSTS,
  TIMELINE_ACCESS,
  TIMELINE_BUGS_DAILY_CAP,
  TIMELINE_FIELDS,
  TIMELINE_SOURCE_KINDS,
  TIMELINE_SYSTEMS,
  countRewards,
  isTimelineBugStatus,
  isTimelineEventType,
  timelineEndTime,
  timelineStatus,
  type TimelineAccess,
  type TimelineBanner,
  type TimelineBug,
  type TimelineBugInput,
  type TimelineBugStatus,
  type TimelineEvent,
  type TimelineEventInput,
  type TimelineEventSummary,
  type TimelineGuideSection,
  type TimelineMission,
  type TimelineProgress,
  type TimelineReward,
  type TimelineSource,
  type TimelineSourceKind,
  type TimelineSystem,
  type TimelineTrack,
} from "@/types/timeline-events";

/**
 * Les évènements officiels (`types/timeline-events.ts`) : lecture, écriture
 * et validation. Les écritures du catalogue passent par les contributions
 * (`lib/contribution-catalog.ts`), qui appellent les fonctions d'ici ; bugs
 * et progression s'écrivent directement, chacun pour soi.
 */

type DbTimelineEvent = Omit<
  TimelineEvent,
  "id" | "startAt" | "endAt" | "removedAt" | "createdAt" | "updatedAt" | "guideUpdatedAt"
> & {
  _id: ObjectId;
  startAt?: Date;
  endAt?: Date;
  removedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  guideUpdatedAt?: Date;
};

type DbTimelineBug = {
  _id: ObjectId;
  eventSlug: string;
  title: string;
  description?: string;
  workaround?: string;
  status: TimelineBugStatus;
  fixedIn?: string;
  issueCouncilUrl?: string;
  userId: ObjectId;
  userName?: string;
  affectedBy: ObjectId[];
  affectedCount: number;
  createdAt: Date;
  updatedAt: Date;
};

type DbTimelineProgress = {
  _id: ObjectId;
  userId: ObjectId;
  eventSlug: string;
  points: Record<string, number>;
  updatedAt: Date;
};

export const timelineEvents = () =>
  db.db().collection<DbTimelineEvent>("timelineEvents");
const timelineBugs = () => db.db().collection<DbTimelineBug>("timelineBugs");
const timelineProgress = () =>
  db.db().collection<DbTimelineProgress>("timelineProgress");

// ─── Validation ─────────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function count(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const number =
    typeof value === "number" ? value : Number(String(value).replace(/\s/g, ""));
  if (!Number.isFinite(number) || number < 0 || number > MAX_TIMELINE_POINTS) {
    throw new Error(`${label} invalide`);
  }
  return Math.round(number);
}

function isoDate(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error(`${label} invalide`);
  return date.toISOString();
}

/** Un identifiant court, pour un parcours ou une section du guide. */
export function newTimelineId(): string {
  return randomBytes(6).toString("hex");
}

const ID = /^[a-z0-9]{6,16}$/;

function hostIs(hostname: string, allowed: string): boolean {
  return hostname === allowed || hostname.endsWith(`.${allowed}`);
}

function httpsUrl(value: unknown): URL | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) {
      return undefined;
    }
    return url;
  } catch {
    return undefined;
  }
}

/** Le chemin que `/api/timeline-events/upload` accorde, suffixe compris. */
const BANNER_PATH = /^\/timeline\/[A-Za-z0-9_-]{1,120}\.(?:jpe?g|png|webp)$/i;

/**
 * Une bannière vient du stockage du site, téléversée par le formulaire, ou
 * directement des médias de RSI : l'image de l'annonce officielle.
 */
function normalizeBanner(value: unknown): TimelineBanner | undefined {
  if (!isPlainObject(value)) return undefined;
  const url = httpsUrl(value.url);
  if (!url) return undefined;
  const fromSite =
    url.hostname === BLOB_HOST && !url.port && BANNER_PATH.test(url.pathname);
  const fromRsi = url.hostname === "media.robertsspaceindustries.com";
  if (!fromSite && !fromRsi) throw new Error("Image de bannière refusée");
  const width = count(value.width, "Largeur");
  const height = count(value.height, "Hauteur");
  return {
    url: url.toString(),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(text(value.credit, MAX_TIMELINE_SHORT_TEXT)
      ? { credit: text(value.credit, MAX_TIMELINE_SHORT_TEXT) }
      : {}),
  };
}

function normalizeSources(value: unknown): TimelineSource[] {
  const list = Array.isArray(value) ? value : [];
  const sources: TimelineSource[] = [];
  for (const entry of list.slice(0, MAX_TIMELINE_SOURCES)) {
    if (!isPlainObject(entry)) continue;
    const url = httpsUrl(entry.url);
    const title = text(entry.title, MAX_TIMELINE_SHORT_TEXT);
    if (!url && !title) continue;
    if (!url || !title) throw new Error("Une source a besoin d'un titre et d'un lien");
    if (!OFFICIAL_SOURCE_HOSTS.some((host) => hostIs(url.hostname, host))) {
      throw new Error(`Source non officielle : ${url.hostname}`);
    }
    const kind = (TIMELINE_SOURCE_KINDS as readonly string[]).includes(
      String(entry.kind),
    )
      ? (entry.kind as TimelineSourceKind)
      : "commlink";
    sources.push({ kind, title, url: url.toString() });
  }
  return sources;
}

function normalizeReward(value: unknown): TimelineReward | undefined {
  if (!isPlainObject(value)) return undefined;
  const itemSlug = text(value.itemSlug, 160);
  const name = text(value.name, MAX_TIMELINE_NAME_LENGTH);
  const note = text(value.note, 60);
  if (!itemSlug && !name) return undefined;
  return {
    ...(itemSlug ? { itemSlug } : { name }),
    ...(note ? { note } : {}),
  };
}

function normalizeTracks(value: unknown): TimelineTrack[] {
  const list = Array.isArray(value) ? value : [];
  if (list.length > MAX_TIMELINE_TRACKS) {
    throw new Error(`${MAX_TIMELINE_TRACKS} parcours au plus`);
  }
  const ids = new Set<string>();
  return list.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    const name = text(entry.name, 60);
    if (!name) throw new Error("Chaque parcours a besoin d'un nom");
    let id = typeof entry.id === "string" && ID.test(entry.id) ? entry.id : "";
    if (!id || ids.has(id)) id = newTimelineId();
    ids.add(id);
    const tiers = (Array.isArray(entry.tiers) ? entry.tiers : [])
      .slice(0, MAX_TIMELINE_TIERS)
      .flatMap((tier) => {
        if (!isPlainObject(tier)) return [];
        const points = count(tier.points, "Points d'un palier") ?? 0;
        const rewards = (Array.isArray(tier.rewards) ? tier.rewards : [])
          .slice(0, MAX_TIMELINE_REWARDS_PER_TIER)
          .map(normalizeReward)
          .filter((reward): reward is TimelineReward => !!reward);
        return [{ points, rewards }];
      })
      .sort((a, b) => a.points - b.points);
    return [{ id, name, tiers }];
  });
}

function normalizeMissions(value: unknown): TimelineMission[] {
  const list = Array.isArray(value) ? value : [];
  if (list.length > MAX_TIMELINE_MISSIONS) {
    throw new Error(`${MAX_TIMELINE_MISSIONS} contrats au plus`);
  }
  return list.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    const missionId =
      typeof entry.missionId === "string" && ObjectId.isValid(entry.missionId)
        ? entry.missionId
        : undefined;
    const name = text(entry.name, MAX_TIMELINE_NAME_LENGTH);
    if (!missionId && !name) return [];
    const mission: TimelineMission = missionId ? { missionId } : { name };
    const track = text(entry.track, 60);
    const points = count(entry.points, "Points d'un contrat");
    const auec = count(entry.auec, "Paiement d'un contrat");
    const conditions = text(entry.conditions, MAX_TIMELINE_SHORT_TEXT);
    if (track) mission.track = track;
    if (points !== undefined) mission.points = points;
    if (auec !== undefined) mission.auec = auec;
    if (conditions) mission.conditions = conditions;
    return [mission];
  });
}

/**
 * Vérifie et met en forme ce qu'un formulaire envoie. Le slug suit le nom à la
 * création ; ensuite il ne bouge plus, l'adresse de la page en dépend.
 */
export function normalizeTimelineInput(input: unknown): TimelineEventInput {
  const raw = isPlainObject(input) ? input : {};
  const name = text(raw.name, MAX_TIMELINE_NAME_LENGTH);
  if (!name || name.length < 2) throw new Error("Le nom est obligatoire");
  const slug = toItemSlug(text(raw.slug, 160) ?? name);
  if (!slug || slug === "nouveau") {
    throw new Error("Le nom ne donne pas d'adresse valide");
  }
  const type = String(raw.type ?? "");
  if (!isTimelineEventType(type)) throw new Error("Type d'évènement invalide");
  const summary = text(raw.summary, MAX_TIMELINE_SUMMARY_LENGTH);
  if (!summary) throw new Error("Le résumé est obligatoire");

  const systems = (Array.isArray(raw.systems) ? raw.systems : [])
    .map(String)
    .filter((system): system is TimelineSystem =>
      (TIMELINE_SYSTEMS as readonly string[]).includes(system),
    );
  const access: TimelineAccess = (
    TIMELINE_ACCESS as readonly string[]
  ).includes(String(raw.access))
    ? (raw.access as TimelineAccess)
    : "owners";

  const startAt = isoDate(raw.startAt, "Date de début");
  const endAt = isoDate(raw.endAt, "Date de fin");
  if (startAt && endAt && new Date(endAt) < new Date(startAt)) {
    throw new Error("La fin précède le début");
  }
  if (endAt && !startAt) throw new Error("Une date de fin sans date de début");

  const sources = normalizeSources(raw.sources);
  if (sources.length === 0) {
    throw new Error("Au moins une source officielle est demandée");
  }

  const relatedSlugs = [
    ...new Set(
      (Array.isArray(raw.relatedSlugs) ? raw.relatedSlugs : [])
        .map((entry) => text(entry, 160))
        .filter((entry): entry is string => !!entry && entry !== slug),
    ),
  ].slice(0, MAX_TIMELINE_RELATED);

  const result: TimelineEventInput = {
    name,
    slug,
    type,
    systems: [...new Set(systems)],
    summary,
    access,
    permanentRewards: raw.permanentRewards !== false,
    sources,
    tracks: normalizeTracks(raw.tracks),
    missions: normalizeMissions(raw.missions),
  };
  const placeSlug = text(raw.placeSlug, 160);
  const description = text(raw.description, MAX_TIMELINE_DESCRIPTION_LENGTH);
  const patch = text(raw.patch, MAX_TIMELINE_PATCH_LENGTH);
  const banner = normalizeBanner(raw.banner);
  if (placeSlug) result.placeSlug = placeSlug;
  if (description) result.description = description;
  if (startAt) result.startAt = startAt;
  if (endAt) {
    result.endAt = endAt;
    if (raw.endTimeUnknown === true) result.endTimeUnknown = true;
  }
  if (patch) result.patch = patch;
  if (relatedSlugs.length > 0) result.relatedSlugs = relatedSlugs;
  if (banner) result.banner = banner;
  return result;
}

export function normalizeGuideSection(
  value: unknown,
): TimelineGuideSection | null {
  if (!isPlainObject(value)) return null;
  const title = text(value.title, MAX_TIMELINE_GUIDE_TITLE_LENGTH);
  if (!title) throw new Error("Une section du guide a besoin d'un titre");
  const body = text(value.body, MAX_TIMELINE_GUIDE_BODY_LENGTH) ?? "";
  const id =
    typeof value.id === "string" && ID.test(value.id) ? value.id : newTimelineId();
  return { id, title, body };
}

// ─── Lecture ────────────────────────────────────────────────────────────────

function iso(date: Date | undefined): string | undefined {
  return date ? date.toISOString() : undefined;
}

function toTimelineEvent(doc: WithId<DbTimelineEvent>): TimelineEvent {
  const { _id, startAt, endAt, removedAt, createdAt, updatedAt, guideUpdatedAt, ...rest } =
    doc;
  return {
    ...rest,
    id: String(_id),
    guide: rest.guide ?? [],
    sources: rest.sources ?? [],
    tracks: rest.tracks ?? [],
    missions: rest.missions ?? [],
    systems: rest.systems ?? [],
    ...(startAt ? { startAt: iso(startAt) } : {}),
    ...(endAt ? { endAt: iso(endAt) } : {}),
    ...(removedAt ? { removedAt: iso(removedAt) } : {}),
    ...(guideUpdatedAt ? { guideUpdatedAt: iso(guideUpdatedAt) } : {}),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

export function toTimelineSummary(
  event: TimelineEvent,
  now: Date = new Date(),
): TimelineEventSummary {
  return {
    id: event.id,
    slug: event.slug,
    name: event.name,
    type: event.type,
    systems: event.systems,
    summary: event.summary,
    startAt: event.startAt,
    endAt: event.endAt,
    endTimeUnknown: event.endTimeUnknown,
    patch: event.patch,
    banner: event.banner,
    status: timelineStatus(event, now),
    guideSections: event.guide.length,
    rewardCount: countRewards(event.tracks),
  };
}

export async function getTimelineEvent(
  slug: string,
  options: { includeRemoved?: boolean } = {},
): Promise<TimelineEvent | null> {
  const doc = await timelineEvents().findOne({
    slug,
    ...(options.includeRemoved ? {} : { removedAt: { $exists: false } }),
  });
  return doc ? toTimelineEvent(doc) : null;
}

/**
 * Tous les évènements listés, du plus récent au plus ancien ; ceux qui n'ont
 * pas encore de date d'abord. Il y en a quelques dizaines par an : la page
 * filtre et regroupe en mémoire plutôt qu'en requêtes.
 */
export async function listTimelineEvents(): Promise<TimelineEventSummary[]> {
  const docs = await timelineEvents()
    .find(
      { removedAt: { $exists: false } },
      { projection: { description: 0, missions: 0, "guide.body": 0 } },
    )
    .toArray();
  const now = new Date();
  return docs
    .map((doc) =>
      toTimelineSummary(
        toTimelineEvent({ ...doc, missions: [] } as WithId<DbTimelineEvent>),
        now,
      ),
    )
    .sort((a, b) => {
      if (!a.startAt !== !b.startAt) return a.startAt ? 1 : -1;
      return (b.startAt ?? "").localeCompare(a.startAt ?? "");
    });
}

/** Les évènements en cours, celui qui finit le plus tôt d'abord : le bandeau d'accueil. */
export async function listLiveTimelineEvents(): Promise<
  TimelineEventSummary[]
> {
  const now = new Date();
  // Une fin sans heure court jusqu'au soir : on relit large, puis on filtre.
  const docs = await timelineEvents()
    .find(
      {
        removedAt: { $exists: false },
        startAt: { $lte: now },
        $or: [
          { endAt: { $exists: false } },
          { endAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
        ],
      },
      { projection: { description: 0, missions: 0, "guide.body": 0 } },
    )
    .toArray();
  return docs
    .map((doc) =>
      toTimelineSummary(
        toTimelineEvent({ ...doc, missions: [] } as WithId<DbTimelineEvent>),
        now,
      ),
    )
    .filter((event) => event.status === "live")
    .sort((a, b) => timelineEndTime(a) - timelineEndTime(b));
}

/** Les évènements qui existent parmi ces slugs, par slug : les liés d'un évènement. */
export async function getTimelineNames(
  slugs: string[],
): Promise<Record<string, { name: string; status: TimelineEventSummary["status"] }>> {
  if (slugs.length === 0) return {};
  const docs = await timelineEvents()
    .find(
      { slug: { $in: slugs }, removedAt: { $exists: false } },
      { projection: { slug: 1, name: 1, startAt: 1, endAt: 1, endTimeUnknown: 1 } },
    )
    .toArray();
  return Object.fromEntries(
    docs.map((doc) => [
      doc.slug,
      {
        name: doc.name,
        status: timelineStatus({
          startAt: iso(doc.startAt),
          endAt: iso(doc.endAt),
          endTimeUnknown: doc.endTimeUnknown,
        }),
      },
    ]),
  );
}

export type TimelineRefs = {
  items: Record<string, ItemSummary>;
  missions: Record<string, string>;
  place?: { slug: string; name: string };
  related: Record<string, { name: string; status: TimelineEventSummary["status"] }>;
};

/** Ce que les récompenses, contrats, lieu et liés d'un évènement désignent. */
export async function resolveTimelineRefs(
  event: Pick<TimelineEventInput, "tracks" | "missions" | "placeSlug" | "relatedSlugs">,
): Promise<TimelineRefs> {
  const itemSlugs = [
    ...new Set(
      event.tracks.flatMap((track) =>
        track.tiers.flatMap((tier) =>
          tier.rewards.flatMap((reward) =>
            reward.itemSlug ? [reward.itemSlug] : [],
          ),
        ),
      ),
    ),
  ];
  const missionIds = [
    ...new Set(
      event.missions.flatMap((mission) =>
        mission.missionId ? [mission.missionId] : [],
      ),
    ),
  ];
  const [items, missions, places, related] = await Promise.all([
    getItemSummaries(itemSlugs),
    getMissionTitles(missionIds),
    event.placeSlug ? getPlacesBySlugs([event.placeSlug]) : Promise.resolve([]),
    getTimelineNames(event.relatedSlugs ?? []),
  ]);
  return {
    items: Object.fromEntries(items.map((item) => [item.slug, item])),
    missions,
    place: places[0] ? { slug: places[0].slug, name: places[0].name } : undefined,
    related,
  };
}

export async function getMissionTitles(
  ids: string[],
): Promise<Record<string, string>> {
  const valid = ids.filter((id) => ObjectId.isValid(id));
  if (valid.length === 0) return {};
  const docs = await db
    .db()
    .collection<{ _id: ObjectId; title: string }>("missions")
    .find(
      { _id: { $in: valid.map((id) => new ObjectId(id)) } },
      { projection: { title: 1 } },
    )
    .toArray();
  return Object.fromEntries(docs.map((doc) => [String(doc._id), doc.title]));
}

/**
 * Qui a écrit l'évènement et son guide : les auteurs de ses contributions
 * publiées, du plus actif au moins actif.
 */
export async function listTimelineAuthors(
  slug: string,
): Promise<{ userId: string; name: string; count: number }[]> {
  const rows = await db
    .db()
    .collection("contributions")
    .aggregate<{ _id: ObjectId; name?: string; count: number }>([
      {
        $match: {
          "target.type": "timelineEvent",
          "target.slug": slug,
          status: "published",
        },
      },
      {
        $group: {
          _id: "$userId",
          name: { $last: "$userName" },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 12 },
    ])
    .toArray();
  return rows.map((row) => ({
    userId: String(row._id),
    name: row.name ?? "—",
    count: row.count,
  }));
}

// ─── Écriture (par les contributions) ───────────────────────────────────────

function toDbFields(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    out[key] =
      (key === "startAt" || key === "endAt") && typeof value === "string"
        ? new Date(value)
        : value;
  }
  return out;
}

export class TimelineSlugTakenError extends Error {
  constructor() {
    super("Un évènement porte déjà ce nom");
  }
}

export async function createTimelineEvent(
  input: TimelineEventInput,
  guide: TimelineGuideSection[] = [],
): Promise<TimelineEvent> {
  const normalized = normalizeTimelineInput(input);
  const now = new Date();
  const doc = {
    _id: new ObjectId(),
    ...(toDbFields(normalized) as Omit<DbTimelineEvent, "_id">),
    guide,
    createdAt: now,
    updatedAt: now,
  } as DbTimelineEvent;
  try {
    await timelineEvents().insertOne(doc);
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new TimelineSlugTakenError();
    }
    throw error;
  }
  return toTimelineEvent(doc);
}

export async function deleteTimelineEvent(slug: string): Promise<boolean> {
  const { deletedCount } = await timelineEvents().deleteOne({ slug });
  return deletedCount > 0;
}

/** Retire un évènement de la vue publique, ou l'y remet. Rien n'est effacé. */
export async function setTimelineEventRemoved(
  slug: string,
  removed: boolean,
): Promise<boolean> {
  const { matchedCount } = await timelineEvents().updateOne(
    { slug },
    removed
      ? { $set: { removedAt: new Date(), updatedAt: new Date() } }
      : { $unset: { removedAt: "" }, $set: { updatedAt: new Date() } },
  );
  return matchedCount > 0;
}

/** `guide.<id>` : une section du guide, que chaque contribution touche seule. */
export function guideField(id: string): string {
  return `guide.${id}`;
}

export function guideSectionId(field: string): string | null {
  return field.startsWith("guide.") ? field.slice("guide.".length) : null;
}

/**
 * Écrit ces champs, et seulement eux. Une section du guide se remplace, se
 * retire (valeur `null`) ou s'ajoute en fin de guide, sans toucher aux autres :
 * deux joueurs qui réécrivent deux sections ne s'écrasent pas.
 *
 * Le guide se relit puis se réécrit : si l'évènement a bougé entre les deux,
 * on recommence plutôt que de perdre une section publiée en même temps.
 */
export async function updateTimelineFields(
  slug: string,
  values: Record<string, unknown>,
  fields: string[],
): Promise<boolean> {
  const plain = fields.filter((field) =>
    (TIMELINE_FIELDS as readonly string[]).includes(field),
  );
  const sections = fields
    .map(guideSectionId)
    .filter((id): id is string => id !== null);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const doc = await timelineEvents().findOne({ slug });
    if (!doc) return false;

    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ""> = {};
    for (const field of plain) {
      const value = values[field];
      if (value === undefined || value === null) $unset[field] = "";
      else $set[field] = toDbFields({ [field]: value })[field];
    }

    if (sections.length > 0) {
      let guide = [...(doc.guide ?? [])];
      for (const id of sections) {
        const value = values[guideField(id)] as TimelineGuideSection | null;
        const index = guide.findIndex((section) => section.id === id);
        if (!value) {
          guide = guide.filter((section) => section.id !== id);
        } else if (index >= 0) {
          guide[index] = value;
        } else if (guide.length < MAX_TIMELINE_GUIDE_SECTIONS) {
          guide.push(value);
        } else {
          throw new Error(`${MAX_TIMELINE_GUIDE_SECTIONS} sections au plus`);
        }
      }
      $set.guide = guide;
      $set.guideUpdatedAt = new Date();
    }

    $set.updatedAt = new Date();
    const { matchedCount } = await timelineEvents().updateOne(
      { _id: doc._id, updatedAt: doc.updatedAt },
      {
        $set,
        ...(Object.keys($unset).length > 0 ? { $unset } : {}),
      },
    );
    if (matchedCount > 0) return true;
  }
  throw new Error("L'évènement a changé pendant l'écriture, réessayez");
}

// ─── Bugs ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

export class TimelineBugError extends Error {
  constructor(
    readonly code: "notFound" | "forbidden" | "invalid" | "tooMany",
    message?: string,
  ) {
    super(message ?? code);
  }
}

function toTimelineBug(doc: DbTimelineBug, viewer?: ObjectId): TimelineBug {
  return {
    id: String(doc._id),
    eventSlug: doc.eventSlug,
    title: doc.title,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.workaround ? { workaround: doc.workaround } : {}),
    status: doc.status,
    ...(doc.fixedIn ? { fixedIn: doc.fixedIn } : {}),
    ...(doc.issueCouncilUrl ? { issueCouncilUrl: doc.issueCouncilUrl } : {}),
    userId: String(doc.userId),
    ...(doc.userName ? { userName: doc.userName } : {}),
    affected: doc.affectedCount,
    mine: !!viewer && doc.affectedBy.some((id) => id.equals(viewer)),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function normalizeBugInput(
  input: unknown,
  partial: boolean,
): Partial<Omit<DbTimelineBug, "_id">> {
  const raw = isPlainObject(input) ? input : {};
  const out: Partial<Omit<DbTimelineBug, "_id">> = {};
  if (!partial || "title" in raw) {
    const title = text(raw.title, MAX_TIMELINE_BUG_TITLE_LENGTH);
    if (!title) throw new TimelineBugError("invalid", "Le titre est obligatoire");
    out.title = title;
  }
  for (const key of ["description", "workaround"] as const) {
    if (!partial || key in raw) {
      out[key] = text(raw[key], MAX_TIMELINE_BUG_TEXT_LENGTH);
    }
  }
  if (!partial || "status" in raw) {
    const status = String(raw.status ?? "open");
    out.status = isTimelineBugStatus(status) ? status : "open";
  }
  if (!partial || "fixedIn" in raw) {
    out.fixedIn = text(raw.fixedIn, MAX_TIMELINE_PATCH_LENGTH);
  }
  if (!partial || "issueCouncilUrl" in raw) {
    const url = httpsUrl(raw.issueCouncilUrl);
    if (raw.issueCouncilUrl && (!url || !hostIs(url.hostname, "robertsspaceindustries.com"))) {
      throw new TimelineBugError(
        "invalid",
        "Le lien doit mener à l'Issue Council de RSI",
      );
    }
    out.issueCouncilUrl = url?.toString();
  }
  return out;
}

export async function listTimelineBugs(
  eventSlug: string,
  viewer?: ObjectId,
): Promise<TimelineBug[]> {
  const docs = await timelineBugs()
    .find({ eventSlug })
    .sort({ affectedCount: -1, createdAt: -1 })
    .limit(200)
    .toArray();
  return docs.map((doc) => toTimelineBug(doc, viewer));
}

export async function countTimelineBugs(eventSlug: string): Promise<number> {
  return timelineBugs().countDocuments({ eventSlug });
}

export async function createTimelineBug(
  eventSlug: string,
  author: { id: ObjectId; name?: string },
  input: TimelineBugInput,
): Promise<TimelineBug> {
  if (!(await getTimelineEvent(eventSlug))) {
    throw new TimelineBugError("notFound");
  }
  const today = await timelineBugs().countDocuments({
    userId: author.id,
    createdAt: { $gte: new Date(Date.now() - DAY_MS) },
  });
  if (today >= TIMELINE_BUGS_DAILY_CAP) throw new TimelineBugError("tooMany");

  const now = new Date();
  const doc: DbTimelineBug = {
    _id: new ObjectId(),
    eventSlug,
    ...(normalizeBugInput(input, false) as Pick<DbTimelineBug, "title" | "status">),
    userId: author.id,
    ...(author.name ? { userName: author.name } : {}),
    // Qui le signale l'a, forcément.
    affectedBy: [author.id],
    affectedCount: 1,
    createdAt: now,
    updatedAt: now,
  };
  for (const key of Object.keys(doc) as (keyof DbTimelineBug)[]) {
    if (doc[key] === undefined) delete doc[key];
  }
  await timelineBugs().insertOne(doc);
  return toTimelineBug(doc, author.id);
}

/** « Je l'ai aussi », ou plus. Idempotent dans les deux sens. */
export async function setTimelineBugAffected(
  bugId: string,
  userId: ObjectId,
  affected: boolean,
): Promise<TimelineBug> {
  if (!ObjectId.isValid(bugId)) throw new TimelineBugError("notFound");
  const _id = new ObjectId(bugId);
  if (affected) {
    await timelineBugs().updateOne(
      { _id, affectedBy: { $ne: userId } },
      { $push: { affectedBy: userId }, $inc: { affectedCount: 1 } },
    );
  } else {
    await timelineBugs().updateOne(
      { _id, affectedBy: userId },
      { $pull: { affectedBy: userId }, $inc: { affectedCount: -1 } },
    );
  }
  const doc = await timelineBugs().findOne({ _id });
  if (!doc) throw new TimelineBugError("notFound");
  return toTimelineBug(doc, userId);
}

/** Son auteur ou un modérateur corrige un bug : statut, contournement, patch du correctif. */
export async function updateTimelineBug(
  bugId: string,
  actor: { id: ObjectId; moderator: boolean },
  input: unknown,
): Promise<TimelineBug> {
  if (!ObjectId.isValid(bugId)) throw new TimelineBugError("notFound");
  const _id = new ObjectId(bugId);
  const doc = await timelineBugs().findOne({ _id });
  if (!doc) throw new TimelineBugError("notFound");
  if (!actor.moderator && !doc.userId.equals(actor.id)) {
    throw new TimelineBugError("forbidden");
  }
  const changes = normalizeBugInput(input, true);
  const $set: Record<string, unknown> = { updatedAt: new Date() };
  const $unset: Record<string, ""> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) $unset[key] = "";
    else $set[key] = value;
  }
  await timelineBugs().updateOne(
    { _id },
    { $set, ...(Object.keys($unset).length > 0 ? { $unset } : {}) },
  );
  const updated = await timelineBugs().findOne({ _id });
  return toTimelineBug(updated!, actor.id);
}

export async function deleteTimelineBug(
  bugId: string,
  actor: { id: ObjectId; moderator: boolean },
): Promise<void> {
  if (!ObjectId.isValid(bugId)) throw new TimelineBugError("notFound");
  const _id = new ObjectId(bugId);
  const doc = await timelineBugs().findOne({ _id });
  if (!doc) throw new TimelineBugError("notFound");
  if (!actor.moderator && !doc.userId.equals(actor.id)) {
    throw new TimelineBugError("forbidden");
  }
  await timelineBugs().deleteOne({ _id });
}

// ─── Progression ────────────────────────────────────────────────────────────

export async function getTimelineProgress(
  userId: ObjectId,
  eventSlug: string,
): Promise<TimelineProgress> {
  const doc = await timelineProgress().findOne({ userId, eventSlug });
  return {
    eventSlug,
    points: doc?.points ?? {},
    ...(doc ? { updatedAt: doc.updatedAt.toISOString() } : {}),
  };
}

/**
 * Les points qu'un joueur a recopiés du mobiGlas, par parcours. Seuls les
 * parcours de l'évènement sont gardés : un parcours retiré depuis disparaît à
 * la prochaine saisie.
 */
export async function saveTimelineProgress(
  userId: ObjectId,
  eventSlug: string,
  input: unknown,
): Promise<TimelineProgress | null> {
  const event = await getTimelineEvent(eventSlug);
  if (!event) return null;
  const raw = isPlainObject(input) ? input : {};
  const points: Record<string, number> = {};
  for (const track of event.tracks) {
    const value = count(raw[track.id], "Points");
    if (value !== undefined) points[track.id] = value;
  }
  const now = new Date();
  await timelineProgress().updateOne(
    { userId, eventSlug },
    { $set: { points, updatedAt: now } },
    { upsert: true },
  );
  return { eventSlug, points, updatedAt: now.toISOString() };
}
