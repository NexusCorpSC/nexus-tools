/**
 * Les évènements officiels de Star Citizen : ce que CIG organise en jeu
 * (évènements dynamiques, salons, Free Fly, fêtes), présentés sur `/timeline`
 * avec leur frise, et servis à l'app par la ressource `timeline-events`.
 *
 * Un évènement porte ce que l'annonce officielle dit — dates, patch, sources,
 * récompenses, contrats — et un guide que la communauté écrit section par
 * section. Tout passe par les contributions : proposer un évènement, corriger
 * ses dates ou réécrire une section du guide se relit et rapporte des points
 * comme une correction de lieu.
 *
 * À côté, deux choses que chaque joueur pose sans relecture : les bugs qu'il
 * rencontre (et « je l'ai aussi »), et sa progression dans les parcours de
 * récompenses.
 */

export const TIMELINE_EVENT_TYPES = [
  "ingame",
  "expo",
  "freefly",
  "festival",
  "economy",
] as const;

export type TimelineEventType = (typeof TIMELINE_EVENT_TYPES)[number];

export function isTimelineEventType(value: string): value is TimelineEventType {
  return (TIMELINE_EVENT_TYPES as readonly string[]).includes(value);
}

/** Les systèmes où un évènement peut se jouer, comme les filtres des lieux. */
export const TIMELINE_SYSTEMS = ["stanton", "pyro", "nyx"] as const;

export type TimelineSystem = (typeof TIMELINE_SYSTEMS)[number];

export const TIMELINE_ACCESS = ["owners", "everyone", "subscribers"] as const;

export type TimelineAccess = (typeof TIMELINE_ACCESS)[number];

export const TIMELINE_SOURCE_KINDS = [
  "commlink",
  "spectrum",
  "patchNotes",
  "faq",
  "video",
] as const;

export type TimelineSourceKind = (typeof TIMELINE_SOURCE_KINDS)[number];

/**
 * Une source officielle : seuls les domaines de RSI et de CIG. Les guides et
 * vidéos de joueurs vont dans le guide, pas ici.
 */
export const OFFICIAL_SOURCE_HOSTS = [
  "robertsspaceindustries.com",
  "cloudimperiumgames.com",
  "youtube.com",
  "youtu.be",
  "twitch.tv",
] as const;

export const MAX_TIMELINE_NAME_LENGTH = 120;
export const MAX_TIMELINE_SUMMARY_LENGTH = 140;
export const MAX_TIMELINE_DESCRIPTION_LENGTH = 8000;
export const MAX_TIMELINE_PATCH_LENGTH = 20;
export const MAX_TIMELINE_SOURCES = 12;
export const MAX_TIMELINE_TRACKS = 8;
export const MAX_TIMELINE_TIERS = 12;
export const MAX_TIMELINE_REWARDS_PER_TIER = 10;
export const MAX_TIMELINE_MISSIONS = 40;
export const MAX_TIMELINE_RELATED = 6;
export const MAX_TIMELINE_GUIDE_SECTIONS = 20;
export const MAX_TIMELINE_GUIDE_TITLE_LENGTH = 80;
export const MAX_TIMELINE_GUIDE_BODY_LENGTH = 8000;
export const MAX_TIMELINE_SHORT_TEXT = 200;
export const MAX_TIMELINE_POINTS = 10_000_000;

export const MAX_TIMELINE_BUG_TITLE_LENGTH = 120;
export const MAX_TIMELINE_BUG_TEXT_LENGTH = 1500;
/** Les bugs qu'un joueur signale par jour, tous évènements confondus. */
export const TIMELINE_BUGS_DAILY_CAP = 10;

export const TIMELINE_PAGE_SIZE = 50;

export type TimelineSource = {
  kind: TimelineSourceKind;
  title: string;
  url: string;
};

/**
 * Une récompense : un objet du catalogue (`itemSlug`), affiché avec son image
 * et relié à sa fiche, ou un simple nom quand l'objet n'en a pas.
 */
export type TimelineReward = {
  itemSlug?: string;
  name?: string;
  /** Ce que c'est, en clair : « Peinture », « Flight blades »… */
  note?: string;
};

export type TimelineTier = {
  points: number;
  rewards: TimelineReward[];
};

/** Un parcours de récompenses : « Transport », « Total »… */
export type TimelineTrack = {
  id: string;
  name: string;
  tiers: TimelineTier[];
};

/**
 * Un contrat de l'évènement : relié à sa fiche mission (`missionId`), ou
 * nommé seulement quand la fiche n'existe pas encore.
 */
export type TimelineMission = {
  missionId?: string;
  name?: string;
  track?: string;
  points?: number;
  auec?: number;
  conditions?: string;
};

export type TimelineGuideSection = {
  id: string;
  title: string;
  body: string;
};

export type TimelineBanner = {
  url: string;
  width?: number;
  height?: number;
  credit?: string;
};

/** Ce qu'un formulaire envoie, et ce qu'une contribution écrit. */
export type TimelineEventInput = {
  name: string;
  slug: string;
  type: TimelineEventType;
  systems: TimelineSystem[];
  placeSlug?: string;
  summary: string;
  description?: string;
  access: TimelineAccess;
  permanentRewards: boolean;
  /** ISO 8601, en UTC. */
  startAt?: string;
  endAt?: string;
  /** CIG n'a annoncé que le jour de fin, pas l'heure. */
  endTimeUnknown?: boolean;
  patch?: string;
  relatedSlugs?: string[];
  banner?: TimelineBanner;
  sources: TimelineSource[];
  tracks: TimelineTrack[];
  missions: TimelineMission[];
};

/** Les champs qu'une correction peut changer, dans l'ordre du formulaire. */
export const TIMELINE_FIELDS = [
  "name",
  "type",
  "systems",
  "placeSlug",
  "summary",
  "startAt",
  "endAt",
  "endTimeUnknown",
  "patch",
  "relatedSlugs",
  "banner",
  "description",
  "access",
  "permanentRewards",
  "sources",
  "tracks",
  "missions",
] as const;

export type TimelineField = (typeof TIMELINE_FIELDS)[number];

export type TimelineEvent = TimelineEventInput & {
  id: string;
  guide: TimelineGuideSection[];
  /** Retiré par un modérateur : gardé, restaurable, mais plus listé. */
  removedAt?: string;
  createdAt: string;
  updatedAt: string;
  guideUpdatedAt?: string;
};

/** Ce qu'une ligne de liste ou de frise affiche. */
export type TimelineEventSummary = Pick<
  TimelineEvent,
  | "id"
  | "slug"
  | "name"
  | "type"
  | "systems"
  | "summary"
  | "startAt"
  | "endAt"
  | "endTimeUnknown"
  | "patch"
  | "banner"
> & {
  status: TimelineStatus;
  guideSections: number;
  rewardCount: number;
};

/**
 * Ce qu'un évènement est maintenant, d'après ses dates :
 * - `announced` : pas encore de date de début ;
 * - `upcoming`, `live`, `ended`.
 * Sans date de fin, un évènement commencé reste en cours.
 */
export type TimelineStatus = "announced" | "upcoming" | "live" | "ended";

export function timelineStatus(
  event: Pick<TimelineEventInput, "startAt" | "endAt" | "endTimeUnknown">,
  now: Date = new Date(),
): TimelineStatus {
  if (!event.startAt) return "announced";
  const start = new Date(event.startAt).getTime();
  if (now.getTime() < start) return "upcoming";
  if (!event.endAt) return "live";
  return now.getTime() < timelineEndTime(event) ? "live" : "ended";
}

/**
 * La fin effective : sans heure annoncée, l'évènement court jusqu'à la fin du
 * jour de fin (UTC) plutôt que de passer « terminé » à minuit le matin même.
 */
export function timelineEndTime(
  event: Pick<TimelineEventInput, "endAt" | "endTimeUnknown">,
): number {
  if (!event.endAt) return Number.POSITIVE_INFINITY;
  const end = new Date(event.endAt);
  if (event.endTimeUnknown) {
    end.setUTCHours(23, 59, 59, 999);
  }
  return end.getTime();
}

/** Les filtres du hub `/timeline`, que l'outil MCP de recherche reprend. */
export type TimelineSearch = {
  q?: string;
  type?: string;
  system?: string;
  /** `missing` : les évènements dont le guide reste à écrire. */
  guide?: string;
};

export function matchesTimelineSearch(
  event: TimelineEventSummary,
  search: TimelineSearch,
): boolean {
  if (search.type && event.type !== search.type) return false;
  if (
    search.system &&
    !event.systems.includes(search.system as TimelineSystem)
  ) {
    return false;
  }
  if (search.guide === "missing" && event.guideSections > 0) return false;
  const query = search.q?.trim().toLowerCase();
  if (query) {
    const haystack = [event.name, event.summary, event.patch ?? ""]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

export function countRewards(tracks: TimelineTrack[]): number {
  return tracks.reduce(
    (sum, track) =>
      sum + track.tiers.reduce((count, tier) => count + tier.rewards.length, 0),
    0,
  );
}

// ─── Bugs et progression ────────────────────────────────────────────────────

export const TIMELINE_BUG_STATUSES = ["open", "workaround", "fixed"] as const;

export type TimelineBugStatus = (typeof TIMELINE_BUG_STATUSES)[number];

export function isTimelineBugStatus(value: string): value is TimelineBugStatus {
  return (TIMELINE_BUG_STATUSES as readonly string[]).includes(value);
}

export type TimelineBug = {
  id: string;
  eventSlug: string;
  title: string;
  description?: string;
  workaround?: string;
  status: TimelineBugStatus;
  fixedIn?: string;
  issueCouncilUrl?: string;
  userId: string;
  userName?: string;
  /** Les joueurs qui l'ont aussi, l'auteur compris. */
  affected: number;
  /** Le joueur qui lit l'a aussi. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TimelineBugInput = {
  title: string;
  description?: string;
  workaround?: string;
  status?: TimelineBugStatus;
  fixedIn?: string;
  issueCouncilUrl?: string;
};

/** Les points d'un joueur, par parcours (`TimelineTrack.id`). */
export type TimelineProgress = {
  eventSlug: string;
  points: Record<string, number>;
  updatedAt?: string;
};
