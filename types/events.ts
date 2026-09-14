/**
 * The event stream: one `text/event-stream` connection per client, carrying
 * every topic the caller asked for. Served by `GET /api/events`, fed by
 * `lib/events/hub.ts`.
 *
 * ```
 * GET /api/events?topics=squad,note,plan&squad=<id>
 *
 * retry: 1000
 * event: squad.view   id: squad:<fingerprint>   data: <SquadView>   ← snapshot on connect
 * event: note         id: note:<fingerprint>    data: <Note>        ← snapshot on connect
 * event: plan.feed    id: plan:<fingerprint>    data: <PlanFeed>    ← snapshot on connect
 * : ping                                                             ← every 20 s
 * event: squad.view / note / plan.feed                               ← on every change
 * event: bye          data: {"reason":"rollover"}                    ← before maxDuration
 * ```
 *
 * Every topic sends its snapshot on every connection: there is no
 * `Last-Event-ID`, because one id cannot describe the state of several topics,
 * and a snapshot per topic every few minutes costs nothing worth a resume
 * protocol. A topic's event is sent only when its fingerprint changes.
 *
 * `topics` is a comma-separated subset of `EVENT_TOPICS`; absent, every topic
 * is served. `squad` is the squad topic's parameter, with the meaning it has on
 * `GET /api/squads` — and the plan topic's too, since which squad a reader is
 * looking at is also what decides whether their plans are the squad's or the
 * raid's.
 */

export const EVENTS_PATH = "/api/events";

export const EVENT_TOPICS = ["squad", "note", "plan"] as const;

export type EventTopic = (typeof EVENT_TOPICS)[number];

/** The SSE event name each topic's payload travels under. */
export const EVENT_NAMES: Record<EventTopic, string> = {
  squad: "squad.view",
  note: "note",
  plan: "plan.feed",
};

/** Sent once by the server before it closes a stream on purpose. */
export type ByeEvent = { reason: "rollover" };

export function isEventTopic(value: string): value is EventTopic {
  return (EVENT_TOPICS as readonly string[]).includes(value);
}
