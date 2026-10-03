import { NextRequest, NextResponse } from "next/server";
import {
  createOrgEvent,
  listOrgEvents,
  parseOrgEventInput,
} from "@/lib/org-events";
import { readJson, readerId, refusal, resolveAuthor } from "./caller";

type Params = { params: Promise<{ orgId: string }> };

/** Par défaut, le calendrier part d'un jour en arrière : ce qui vient de finir y est encore. */
const DEFAULT_LOOKBACK_MS = 24 * 3_600_000;

function readDateParam(value: string | null): Date | null | false {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? false : new Date(parsed);
}

/**
 * GET /api/orgs/:orgId/events?from=<ISO>&to=<ISO>
 * The organization's events overlapping `[from, to[`, earliest first. `from`
 * defaults to a day ago, `to` to no bound.
 *
 * Members see every event; anyone else, signed in or not, sees the public ones
 * only.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { orgId } = await params;
  const sp = request.nextUrl.searchParams;

  const from = readDateParam(sp.get("from"));
  const to = readDateParam(sp.get("to"));
  if (from === false || to === false) {
    return NextResponse.json(
      { error: "`from` and `to` must be ISO dates" },
      { status: 400 },
    );
  }

  const events = await listOrgEvents(orgId, await readerId(), {
    from: from ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS),
    to,
  });

  if (!events) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ events });
}

/**
 * POST /api/orgs/:orgId/events
 * Plans an event. Members only.
 *
 * Body: `OrgEventInput` — `title`, `startsAt`, `endsAt` required; `visibility`
 * defaults to `private`.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const caller = await resolveAuthor();
  if ("refused" in caller) return caller.refused;

  const { orgId } = await params;
  const parsed = parseOrgEventInput(await readJson(request));
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const outcome = await createOrgEvent(orgId, caller.author, parsed.value);
  if ("refusal" in outcome) return refusal(outcome.refusal);

  return NextResponse.json(outcome.view, { status: 201 });
}
