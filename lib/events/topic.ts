import "server-only";
import type { EventTopic } from "@/types/events";

/**
 * What a topic of the event stream has to provide.
 *
 * The hub (`hub.ts`) owns the connections, the one change stream, and the
 * routing of database events to the users they concern; a topic only knows
 * how to read its view for one user, and which documents that view depends
 * on. Adding a topic is writing one of these and listing it in `TOPICS`.
 */

/**
 * A change event, projected down to what routing needs.
 *
 * The change stream is opened once for every topic's collections, so the
 * projection is the union of what each topic asks for; a topic reads the
 * fields it declared and ignores the rest.
 */
export interface ProjectedChange {
  collection: string;
  operationType: "insert" | "update" | "replace" | "delete";
  /** The document's `_id`, as a string. */
  id: string;
  /** Present on inserts and, thanks to `updateLookup`, on updates — unless the document is already gone. */
  fullDocument?: Record<string, unknown> | null;
  updatedFields?: Record<string, unknown>;
}

/**
 * What one user's view depends on, as the topic last read it: ids of the
 * documents whose change should trigger a re-read. Keyed by the topic's own
 * names (`squads`, `raids`, …).
 */
export type TopicIndexEntry = Record<string, Set<string>>;

/** Every subscribed user's index for this topic. */
export type TopicIndex = Map<string, TopicIndexEntry>;

export interface Topic<Params, View> {
  name: EventTopic;
  /** The collections whose changes may concern this topic. */
  collections: readonly string[];
  /** The view one user sees, as `GET` would answer it. */
  snapshot(userId: string, params: Params): Promise<View>;
  /** The documents that view depends on, so the next change can be routed. */
  index(userId: string, view: View): TopicIndexEntry;
  /** Change-stream mode: the users a change concerns. */
  affected(change: ProjectedChange, index: TopicIndex): Set<string>;
  /**
   * Ticker mode: read whatever the subscribed users depend on, diff it against
   * `previous` (updated in place), and answer with the users concerned.
   */
  tick(index: TopicIndex, previous: Map<string, string>): Promise<Set<string>>;
}

/** Fields the change stream must project for the topic to route on. */
export const CHANGE_PROJECTION = {
  _id: 1,
  operationType: 1,
  "ns.coll": 1,
  documentKey: 1,
  "fullDocument.raidId": 1,
  "fullDocument.members.userId": 1,
  "fullDocument.userId": 1,
  "updateDescription.updatedFields.raidId": 1,
} as const;
