/**
 * A squad: one team in the middle of an operation, shared between its members
 * and read by the desktop overlay several times a minute.
 *
 * A user belongs to at most one squad, which is what lets the API leave every
 * identifier implicit — «my squad» is resolved from the session, so no request
 * ever names a squad it has no business touching.
 */

export const ANNOUNCEMENTS_MAX_LENGTH = 2000;
export const POSITION_MAX_LENGTH = 120;
export const SQUAD_NAME_MAX_LENGTH = 60;

/** Past this, the overlay stops being readable at a glance anyway. */
export const SQUAD_MAX_MEMBERS = 20;

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
  /**
   * Bumped on every write. Nothing reads it yet — it is what would let a client
   * ask «anything new since N?» without the server having to diff.
   */
  version: number;
  updatedAt: string;
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
  lieutenant?: boolean;
}
