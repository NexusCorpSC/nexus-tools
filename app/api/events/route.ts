import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  readSnapshots,
  subscribe,
  type Snapshot,
  type TopicSelection,
} from "@/lib/events/hub";
import { requestedSquad } from "@/app/api/squads/caller";
import {
  EVENT_NAMES,
  EVENT_TOPICS,
  isEventTopic,
  type ByeEvent,
  type EventTopic,
} from "@/types/events";

/**
 * GET /api/events?topics=squad,note&squad=<id>
 *
 * One stream per client, every topic on it. The protocol is documented in
 * `types/events.ts`; what happens between two events is `lib/events/hub.ts`.
 *
 * The function stays up for as long as the stream is open, so it is bounded:
 * shortly before `maxDuration` the server says `bye` and closes, and the client
 * reconnects at once — each topic sends its snapshot again, which is the whole
 * resume protocol. On Vercel this needs Fluid compute for a 300 s ceiling;
 * lower `maxDuration` if the plan's limit is lower, everything else follows.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** A comment keeps proxies and browsers from giving up on a quiet stream. */
const HEARTBEAT_MS = 20_000;

/** Close before the platform does, so the client hears it coming. */
const LIFETIME_MS = (maxDuration - 20) * 1_000;

const encoder = new TextEncoder();

function event(name: string, id: string | null, data: unknown): string {
  const lines = [`event: ${name}`];
  if (id) lines.push(`id: ${id}`);
  // `JSON.stringify` never emits a raw newline, so one `data:` line carries it.
  lines.push(`data: ${JSON.stringify(data)}`);
  return `${lines.join("\n")}\n\n`;
}

function topicEvent(topic: EventTopic, snapshot: Snapshot): string {
  return event(EVENT_NAMES[topic], snapshot.id, snapshot.view);
}

/**
 * `topics=` parsed, or the reason it could not be.
 *
 * Only an *absent* parameter means every topic, as the protocol says. An
 * empty one is a request for nothing, which is a mistake on the caller's side
 * — and answering it with everything would hide that mistake behind a stream
 * the caller never meant to hold.
 */
function readTopics(
  request: NextRequest,
): { topics: EventTopic[] } | { error: string } {
  const raw = request.nextUrl.searchParams.get("topics");
  if (raw === null) return { topics: [...EVENT_TOPICS] };

  const topics: EventTopic[] = [];
  for (const name of raw.split(",").map((part) => part.trim())) {
    if (!isEventTopic(name)) return { error: `Unknown topic \`${name}\`` };
    if (!topics.includes(name)) topics.push(name);
  }

  if (topics.length === 0) return { error: "`topics` must name at least one topic" };

  return { topics };
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id!;

  const wanted = readTopics(request);
  if ("error" in wanted) {
    return NextResponse.json({ error: wanted.error }, { status: 400 });
  }

  const selection: TopicSelection = {};
  for (const topic of wanted.topics) {
    switch (topic) {
      case "squad":
        selection.squad = { squadId: requestedSquad(request) };
        break;
      case "note":
        selection.note = {};
        break;
      case "plan":
        // The same parameter as the squad topic, and for the same reason: which
        // squad a reader is looking at decides whether the plans they see are
        // their squad's or their raid's.
        selection.plan = { squadId: requestedSquad(request) };
        break;
    }
  }

  // Read before the stream exists, and subscribed synchronously once it does:
  // no write can fall between the snapshot and the subscription.
  const initial = await readSnapshots(userId, selection);

  let cleanup: () => void = () => undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: () => void = () => undefined;

      const send = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          // The client is gone and nobody told us: this is how we find out.
          cleanup();
          return false;
        }
      };

      const heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      const lifetime = setTimeout(() => {
        const bye: ByeEvent = { reason: "rollover" };
        send(event("bye", null, bye));
        cleanup();
      }, LIFETIME_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;

        clearInterval(heartbeat);
        clearTimeout(lifetime);
        unsubscribe();

        try {
          controller.close();
        } catch {
          // Already closed by the other side.
        }
      };

      send("retry: 1000\n\n");

      for (const [topic, snapshot] of initial) {
        send(topicEvent(topic, snapshot));
      }

      unsubscribe = subscribe({
        userId,
        topics: selection,
        initial,
        send: (topic, snapshot) => void send(topicEvent(topic, snapshot)),
      });

      request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
