import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { ContributionError } from "@/lib/contributions";
import { hasPermission } from "@/lib/permissions";
import { TimelineBugError } from "@/lib/timeline-events";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";

/** Ce que partagent les routes de la ressource `timeline-events`. */

export async function timelineSession(): Promise<{
  id: ObjectId;
  name?: string;
} | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: new ObjectId(session.user.id), name: session.user.name };
}

export async function isTimelineModerator(): Promise<boolean> {
  return hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION);
}

export function unauthenticated() {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return null;
  }
}

export function invalidJson() {
  return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
}

/** Une erreur connue en réponse ; les autres remontent. */
export function timelineErrorResponse(error: unknown) {
  if (error instanceof ContributionError) {
    return NextResponse.json(
      { error: error.code, ...(error.detail ? { detail: error.detail } : {}) },
      { status: error.status },
    );
  }
  if (error instanceof TimelineBugError) {
    const status = {
      notFound: 404,
      forbidden: 403,
      invalid: 400,
      tooMany: 429,
    }[error.code];
    return NextResponse.json(
      {
        error: error.code,
        ...(error.message !== error.code ? { detail: error.message } : {}),
      },
      { status },
    );
  }
  throw error;
}
