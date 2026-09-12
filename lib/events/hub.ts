import "server-only";
import { createHash } from "node:crypto";
import type { ChangeStream, Document, ResumeToken } from "mongodb";
import db from "@/lib/db";
import type { EventTopic } from "@/types/events";
import { noteTopic, type NoteParams } from "./note";
import { squadTopic, type SquadParams } from "./squad";
import {
  CHANGE_PROJECTION,
  type ProjectedChange,
  type Topic,
  type TopicIndex,
} from "./topic";

/**
 * The hub behind `/api/events`: every open stream of this process, and the
 * one thing that watches the database for all of them.
 *
 * A change in the database has to reach the users it concerns without each
 * connection asking for it. One change stream per process — not per
 * connection — sees every write on the topics' collections, and routing to the
 * users is done here, in memory, from an index each topic maintains of what
 * each user's view depends on. The stream's own filter is fixed at open time,
 * while who is connected and what they depend on changes constantly; keeping
 * the routing on this side is what lets one cursor serve everybody without
 * ever being reopened.
 *
 * A change stream needs a replica set, which a developer's standalone `mongod`
 * is not: the first error the cursor raises says so, and the hub then falls
 * back to a ticker — one round of projected reads per second, diffed against
 * the previous round, for the users currently connected. Slower to notice, and
 * still one cheap query per topic per second whatever the number of users.
 *
 * Held on `globalThis` for the same reason `lib/db.ts` holds the client there:
 * in development the module is re-evaluated on every edit, and a change stream
 * left behind by the previous copy would go on reading for nobody.
 */

const TOPICS: { [K in EventTopic]: Topic<TopicParams[K], unknown> } = {
  squad: squadTopic,
  note: noteTopic,
};

export type TopicParams = { squad: SquadParams; note: NoteParams };

/** The topics one stream asked for, each with its parameters. */
export type TopicSelection = { [K in EventTopic]?: TopicParams[K] };

/** A view read for one topic, with the fingerprint that names it. */
export interface Snapshot {
  view: unknown;
  id: string;
}

export interface SubscriptionRequest {
  userId: string;
  topics: TopicSelection;
  /** What the route already sent, so only what changes after is pushed. */
  initial: Map<EventTopic, Snapshot>;
  send: (topic: EventTopic, snapshot: Snapshot) => void;
}

interface Subscription {
  userId: string;
  topics: TopicSelection;
  send: SubscriptionRequest["send"];
  last: Map<EventTopic, Snapshot>;
}

interface UserEntry {
  subs: Set<Subscription>;
  /** Topics with a change to re-read, waiting for the debounce. */
  dirty: Set<EventTopic>;
  timer: NodeJS.Timeout | null;
  refreshing: boolean;
}

type Watcher = { close: () => void };

interface Hub {
  users: Map<string, UserEntry>;
  /** Per topic, what each connected user's view depends on. */
  index: Map<EventTopic, TopicIndex>;
  /** Per topic, the ticker's memory of the last round. */
  previous: Map<EventTopic, Map<string, string>>;
  watcher: Watcher | null;
  closing: NodeJS.Timeout | null;
  /** Decided by the first cursor that fails for want of a replica set. */
  changeStreamsUnavailable: boolean;
}

/** How long a burst of writes is given to settle before one re-read. */
const DEBOUNCE_MS = 50;

/** How long an idle hub keeps its watcher, for the reconnect that follows a `bye`. */
const LINGER_MS = 5_000;

const TICK_MS = 1_000;

/** «The $changeStream stage is only supported on replica sets». */
const CHANGE_STREAM_NEEDS_REPLICA_SET = 40573;

/** The oplog no longer holds the resume point: start over from now. */
const CHANGE_STREAM_HISTORY_LOST = 286;

/**
 * How many times in a row a change stream may fail to open before the hub
 * gives up on it for the process. A cluster that refuses them for a reason
 * other than «not a replica set» — a tier, a role — would otherwise be
 * retried forever while every stream on this instance goes quiet.
 */
const CHANGE_STREAM_MAX_FAILURES = 3;

const HUB_KEY = Symbol.for("nexus.events.hub");

function newHub(): Hub {
  return {
    users: new Map(),
    index: new Map(),
    previous: new Map(),
    watcher: null,
    closing: null,
    changeStreamsUnavailable: false,
  };
}

function hub(): Hub {
  const holder = globalThis as typeof globalThis & { [HUB_KEY]?: Hub };
  holder[HUB_KEY] ??= newHub();
  return holder[HUB_KEY];
}

function topicNames(): EventTopic[] {
  return Object.keys(TOPICS) as EventTopic[];
}

function indexOf(state: Hub, topic: EventTopic): TopicIndex {
  let index = state.index.get(topic);
  if (!index) {
    index = new Map();
    state.index.set(topic, index);
  }
  return index;
}

function previousOf(state: Hub, topic: EventTopic): Map<string, string> {
  let previous = state.previous.get(topic);
  if (!previous) {
    previous = new Map();
    state.previous.set(topic, previous);
  }
  return previous;
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export function fingerprint(topic: EventTopic, view: unknown): string {
  const digest = createHash("sha1").update(JSON.stringify(view)).digest("hex");
  return `${topic}:${digest.slice(0, 16)}`;
}

async function read<K extends EventTopic>(
  topic: K,
  userId: string,
  params: TopicParams[K],
): Promise<Snapshot> {
  const view = await TOPICS[topic].snapshot(userId, params);
  return { view, id: fingerprint(topic, view) };
}

/** Every requested topic, read once — what a stream sends first. */
export async function readSnapshots(
  userId: string,
  topics: TopicSelection,
): Promise<Map<EventTopic, Snapshot>> {
  const entries = await Promise.all(
    topicNames()
      .filter((topic) => topics[topic] !== undefined)
      .map(async (topic) => {
        const params = topics[topic] as TopicParams[typeof topic];
        return [topic, await read(topic, userId, params)] as const;
      }),
  );

  return new Map(entries);
}

/* ------------------------------------------------------------------ */
/* Subscribing                                                         */
/* ------------------------------------------------------------------ */

/**
 * The user's index for each topic: the union over their streams, since one
 * account may hold several (the site and the app) with different parameters.
 */
function reindex(state: Hub, userId: string) {
  const entry = state.users.get(userId);

  for (const topic of topicNames()) {
    const index = indexOf(state, topic);

    if (!entry) {
      index.delete(userId);
      continue;
    }

    const merged: Record<string, Set<string>> = {};
    let subscribed = false;

    for (const sub of entry.subs) {
      const snapshot = sub.last.get(topic);
      if (!snapshot) continue;
      subscribed = true;

      const ids = TOPICS[topic].index(userId, snapshot.view);
      for (const [name, set] of Object.entries(ids)) {
        const target = (merged[name] ??= new Set());
        for (const id of set) target.add(id);
      }
    }

    if (subscribed) index.set(userId, merged);
    else index.delete(userId);
  }
}

export function subscribe(request: SubscriptionRequest): () => void {
  const state = hub();

  const sub: Subscription = {
    userId: request.userId,
    topics: request.topics,
    send: request.send,
    last: new Map(request.initial),
  };

  let entry = state.users.get(sub.userId);
  if (!entry) {
    entry = { subs: new Set(), dirty: new Set(), timer: null, refreshing: false };
    state.users.set(sub.userId, entry);
  }
  entry.subs.add(sub);
  reindex(state, sub.userId);

  if (state.closing) {
    clearTimeout(state.closing);
    state.closing = null;
  }
  if (!state.watcher) openWatcher(state);

  let done = false;

  return () => {
    if (done) return;
    done = true;

    const current = state.users.get(sub.userId);
    if (!current) return;

    current.subs.delete(sub);

    if (current.subs.size === 0) {
      if (current.timer) clearTimeout(current.timer);
      state.users.delete(sub.userId);
    }
    reindex(state, sub.userId);

    if (state.users.size === 0 && !state.closing) {
      state.closing = setTimeout(() => {
        state.closing = null;
        if (state.users.size === 0) closeWatcher(state);
      }, LINGER_MS);
    }
  };
}

/* ------------------------------------------------------------------ */
/* Refreshing                                                          */
/* ------------------------------------------------------------------ */

function markDirty(state: Hub, userId: string, topic: EventTopic) {
  const entry = state.users.get(userId);
  if (!entry) return;

  entry.dirty.add(topic);

  if (entry.refreshing || entry.timer) return;

  entry.timer = setTimeout(() => {
    entry.timer = null;
    void refresh(state, userId);
  }, DEBOUNCE_MS);
}

function markAllDirty(state: Hub) {
  for (const userId of state.users.keys()) {
    for (const topic of topicNames()) markDirty(state, userId, topic);
  }
}

/**
 * Re-reads the dirty topics for every stream of one user, and sends what
 * changed. Loops while writes keep landing during the read, so nothing that
 * arrived mid-way is left for a next event that may never come.
 */
async function refresh(state: Hub, userId: string) {
  const entry = state.users.get(userId);
  if (!entry || entry.refreshing) return;

  entry.refreshing = true;

  try {
    while (entry.dirty.size > 0 && state.users.get(userId) === entry) {
      const topics = [...entry.dirty];
      entry.dirty.clear();

      for (const sub of entry.subs) {
        for (const topic of topics) {
          const params = sub.topics[topic];
          if (params === undefined) continue;

          try {
            const snapshot = await read(topic, userId, params);

            if (snapshot.id !== sub.last.get(topic)?.id) {
              sub.last.set(topic, snapshot);
              sub.send(topic, snapshot);
            }
          } catch (error) {
            console.warn({ error, topic, message: "Event feed: could not re-read a view" });
          }
        }
      }

      reindex(state, userId);
    }
  } finally {
    entry.refreshing = false;
  }
}

/* ------------------------------------------------------------------ */
/* Watching                                                            */
/* ------------------------------------------------------------------ */

function dispatch(state: Hub, change: ProjectedChange) {
  for (const topic of topicNames()) {
    if (!TOPICS[topic].collections.includes(change.collection)) continue;

    const index = state.index.get(topic);
    if (!index || index.size === 0) continue;

    for (const userId of TOPICS[topic].affected(change, index)) {
      markDirty(state, userId, topic);
    }
  }
}

function openWatcher(state: Hub) {
  if (state.changeStreamsUnavailable) openTicker(state);
  else openChangeStream(state);
}

function closeWatcher(state: Hub) {
  state.watcher?.close();
  state.watcher = null;
  state.previous.clear();
}

function mongoCode(error: unknown): number | undefined {
  return (error as { code?: number } | null)?.code;
}

function needsReplicaSet(error: unknown): boolean {
  if (mongoCode(error) === CHANGE_STREAM_NEEDS_REPLICA_SET) return true;

  const message = (error as { message?: string } | null)?.message ?? "";
  return /replica set/i.test(message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** What the change stream is asked for: only the topics' collections, only the fields routing reads. */
function changePipeline(): Document[] {
  const collections = new Set<string>();
  for (const topic of topicNames()) {
    for (const collection of TOPICS[topic].collections) collections.add(collection);
  }

  return [
    {
      $match: {
        "ns.coll": { $in: [...collections] },
        operationType: { $in: ["insert", "update", "replace", "delete"] },
      },
    },
    { $project: CHANGE_PROJECTION },
  ];
}

function project(event: Document): ProjectedChange | null {
  const id = event.documentKey?._id;
  const collection = event.ns?.coll;
  if (id === undefined || typeof collection !== "string") return null;

  return {
    collection,
    operationType: event.operationType,
    id: String(id),
    fullDocument: event.fullDocument ?? null,
    updatedFields: event.updateDescription?.updatedFields,
  };
}

/**
 * Opens the change stream and makes it the hub's watcher.
 *
 * The watcher is put on the hub *here*, before the loop starts, and not by
 * the caller once this returns: the loop checks that it is still the one on
 * record before every attempt, and its first check runs synchronously — an
 * assignment made after the return would come too late, and the loop would
 * quit before opening anything, without a word.
 */
function openChangeStream(state: Hub) {
  let closed = false;
  let stream: ChangeStream | null = null;

  const watcher: Watcher = {
    close() {
      closed = true;
      void stream?.close().catch(() => undefined);
    },
  };

  state.watcher = watcher;

  void (async () => {
    let resumeAfter: ResumeToken | undefined;
    let delay = 1_000;
    let failures = 0;

    while (!closed && state.watcher === watcher) {
      stream = db.db().watch(changePipeline(), {
        fullDocument: "updateLookup",
        ...(resumeAfter ? { resumeAfter } : {}),
      });

      try {
        for await (const event of stream) {
          resumeAfter = stream.resumeToken;
          delay = 1_000;
          failures = 0;

          const change = project(event as Document);
          if (change) dispatch(state, change);
        }
      } catch (error) {
        if (closed || state.watcher !== watcher) break;

        if (mongoCode(error) === CHANGE_STREAM_HISTORY_LOST) {
          resumeAfter = undefined;
          markAllDirty(state);
          continue;
        }

        failures += 1;

        if (needsReplicaSet(error) || failures >= CHANGE_STREAM_MAX_FAILURES) {
          console.warn({
            code: mongoCode(error),
            message: `Event feed: change streams unavailable (${
              (error as { message?: string } | null)?.message ?? "unknown error"
            }); reading the database every second instead`,
          });
          state.changeStreamsUnavailable = true;
          openTicker(state);
          markAllDirty(state);
          break;
        }

        console.warn({
          code: mongoCode(error),
          message: `Event feed: change stream failed (${
            (error as { message?: string } | null)?.message ?? "unknown error"
          }), reopening`,
        });

        await sleep(delay);
        delay = Math.min(delay * 2, 10_000);
      } finally {
        await stream.close().catch(() => undefined);
        stream = null;
      }
    }
  })();
}

/** Opens the ticker and makes it the hub's watcher. */
function openTicker(state: Hub) {
  let ticking = false;

  const timer = setInterval(() => {
    if (ticking) return;
    ticking = true;

    void (async () => {
      for (const topic of topicNames()) {
        const index = state.index.get(topic);
        if (!index || index.size === 0) continue;

        try {
          const hit = await TOPICS[topic].tick(index, previousOf(state, topic));
          for (const userId of hit) markDirty(state, userId, topic);
        } catch (error) {
          console.warn({ error, topic, message: "Event feed: tick failed" });
        }
      }
    })().finally(() => {
      ticking = false;
    });
  }, TICK_MS);

  state.watcher = {
    close() {
      clearInterval(timer);
    },
  };
}
