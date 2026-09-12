/**
 * A squad: one team in the middle of an operation, shared between its members
 * and read by the desktop overlay several times a minute.
 *
 * A user is normally in one squad, and «my squad» is resolved from the session:
 * no request names a squad it has no business touching. They may be in several
 * — a raid's organiser opens the extra squads of the raid and leads each until
 * somebody takes it over — in which case a request says which one it means
 * with `?squad=<id>`, and the longest-standing membership stands in when it
 * does not. Every route still refuses a squad the caller is not a member of.
 *
 * Squads group into a **raid**: several squads under one announcement, each
 * keeping its own code, leader and roles. A squad belongs to at most one raid,
 * and the pointer lives on the squad — see `raidId`.
 */

export const ANNOUNCEMENTS_MAX_LENGTH = 2000;
export const POSITION_MAX_LENGTH = 120;
export const SQUAD_NAME_MAX_LENGTH = 60;

/** Past this, the overlay stops being readable at a glance anyway. */
export const SQUAD_MAX_MEMBERS = 20;

export const ROLE_LABEL_MAX_LENGTH = 24;

/** The seven shipped ones plus a comfortable margin of invented ones. */
export const SQUAD_MAX_ROLES = 24;

export const RAID_NAME_MAX_LENGTH = 60;

/** Six squads of twenty is already more than an overlay can show. */
export const RAID_MAX_SQUADS = 6;

/**
 * The glyphs a role may wear, and nothing else.
 *
 * A closed set rather than free text: the icon is drawn by the client from its
 * own sprite, so a name it does not know renders as a hole. Refusing it here is
 * the only place that can be prevented for every client at once.
 *
 * Mirrored in `nexus-app/src/types/nexus.ts`, where each name is mapped to a
 * Lucide component. Adding one means adding it in both.
 */
export const SQUAD_ROLE_ICONS = [
  // Combat
  "crosshair",
  "target",
  "sword",
  "shield",
  "shield-half",
  "bomb",
  "flame",
  "zap",
  "skull",
  // Vol
  "navigation",
  "rocket",
  "plane",
  "compass",
  "anchor",
  "fuel",
  "gauge",
  "orbit",
  // Soutien
  "cross",
  "heart-pulse",
  "pill",
  "life-buoy",
  "battery",
  "users",
  "bell",
  "radio",
  // Métier
  "wrench",
  "hammer",
  "cog",
  "box",
  "truck",
  "hard-hat",
  "coins",
  "key",
  // Repères
  "eye",
  "search",
  "map",
  "map-pin",
  "flag",
  "star",
  "hexagon",
  "triangle",
  "diamond",
  "ghost",
] as const;

export type SquadRoleIcon = (typeof SQUAD_ROLE_ICONS)[number];

export function isSquadRoleIcon(value: unknown): value is SquadRoleIcon {
  return (
    typeof value === "string" &&
    (SQUAD_ROLE_ICONS as readonly string[]).includes(value)
  );
}

/**
 * A job inside the squad, worn by a member and shown as an icon left of their
 * name.
 *
 * Roles belong to the squad rather than to the player: everyone sees the same
 * «Boarder» with the same glyph, which is the whole point of having them.
 */
export interface SquadRole {
  /** Opaque and stable. Base roles carry the slugs below; the rest are random. */
  id: string;
  label: string;
  icon: SquadRoleIcon;
  /**
   * One of the seven every squad starts with. They can be renamed and given
   * another glyph, but never deleted — a squad with no roles at all would be a
   * dead end nobody could get out of from the overlay.
   */
  base: boolean;
}

/** What a squad starts with, and what a squad created before roles existed has. */
export const BASE_SQUAD_ROLES: readonly SquadRole[] = [
  { id: "assaut", label: "Assaut", icon: "crosshair", base: true },
  { id: "artilleur", label: "Artilleur", icon: "target", base: true },
  { id: "medic", label: "Médic", icon: "cross", base: true },
  { id: "ingenieur", label: "Ingénieur", icon: "wrench", base: true },
  { id: "pilote", label: "Pilote", icon: "navigation", base: true },
  { id: "eclaireur", label: "Éclaireur", icon: "eye", base: true },
  { id: "logistique", label: "Logistique", icon: "box", base: true },
];

export interface SquadMember {
  userId: string;
  /**
   * Copied in when the member joins rather than joined on read.
   *
   * The overlay polls this document every couple of seconds; resolving names
   * against `users` each time would turn an indexed `findOne` into an
   * aggregation. The copy is refreshed whenever the member writes to their own
   * row, which catches a rename without costing anything.
   */
  name: string;
  /** Decides succession: the longest-standing member takes over. */
  joinedAt: string;
  ready: boolean;
  /** «actif» when true, «éliminé» when false. */
  alive: boolean;
  position: string;
  /**
   * The id of one of the squad's `roles`, or `""` for none.
   *
   * Not a foreign key anything enforces: deleting a role clears it from the
   * members wearing it, and a client that reads one it cannot resolve shows no
   * role rather than failing.
   */
  role: string;
  /**
   * Commands the squad alongside the leader, with exactly the same powers —
   * including appointing further lieutenants and handing over the leadership.
   *
   * A rank rather than a second leader: the squad still has one `leaderId`, so
   * succession and «who is in charge» stay answerable by one field.
   */
  lieutenant: boolean;
}

export interface Squad {
  id: string;
  name: string;
  /** Short, spoken out loud, shared to let others in. Stable for the squad. */
  code: string;
  leaderId: string;
  announcements: string;
  members: SquadMember[];
  roles: SquadRole[];
  /** The raid this squad was linked into, or `null` when it runs alone. */
  raidId: string | null;
  /**
   * Bumped on every write. Nothing reads it yet — it is what would let a client
   * ask «anything new since N?» without the server having to diff.
   */
  version: number;
  updatedAt: string;
}

/**
 * Several squads under one announcement.
 *
 * The raid holds no members of its own: its roster is whichever squads point at
 * it, and each of them keeps its code, its leader and its roles. That is the
 * whole model — a raid is a grouping, not a bigger squad.
 */
export interface Raid {
  id: string;
  name: string;
  /** Handed out to link a squad in, the same way a squad code lets a player in. */
  code: string;
  announcement: string;
  /**
   * The squad that runs the raid: whoever commands it renames the raid, writes
   * its announcement and unlinks the others.
   *
   * A squad rather than a user, so the rank a player already holds in their own
   * squad is the only one there is — and so a raid survives its founder logging
   * off, exactly as a squad survives its leader.
   */
  leadSquadId: string;
  updatedAt: string;
}

/** A raid with the squads that make it up, longest-standing first. */
export interface RaidView extends Raid {
  squads: Squad[];
}

/**
 * One of the squads the caller is in, as much of it as a switcher needs.
 *
 * Not the whole squad: a raid's organiser may be in half a dozen, and every
 * member polls this view every couple of seconds. The raid's own `squads`
 * already carry the full rows of the ones that matter on screen.
 */
export interface SquadMembership {
  id: string;
  name: string;
  code: string;
  raidId: string | null;
}

/**
 * What every squad route answers: where the caller stands, in one object.
 *
 * `squad` is the one the request named — or, when it named none, the caller's
 * longest-standing membership. `raid` is present whenever that squad is linked
 * into one, and carries every sub-squad — the overlay draws the whole raid from
 * a single poll. `memberships` lists every squad the caller is in, longest-
 * standing first, so a client can offer to switch between them.
 */
export interface SquadView {
  squad: Squad | null;
  raid: RaidView | null;
  memberships: SquadMembership[];
}

/**
 * What a member may change about themselves, and what commanding the squad lets
 * you change about anyone.
 *
 * `lieutenant` is the odd one out: it is never something a member reports about
 * themselves, so the route refuses it from anyone who does not command — see
 * `app/api/squads/members/[userId]/route.ts`.
 */
export interface SquadMemberPatch {
  ready?: boolean;
  alive?: boolean;
  position?: string;
  role?: string;
  lieutenant?: boolean;
}
