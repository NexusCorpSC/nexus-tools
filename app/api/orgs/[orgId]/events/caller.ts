import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { OrgEventAuthor } from "@/types/org-events";

/**
 * Ce que les routes des évènements établissent d'abord : qui demande.
 *
 * Les lectures acceptent un visiteur anonyme — un évènement public se lit sans
 * compte —, les écritures non.
 */

export async function readerId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function resolveAuthor(): Promise<
  { refused: NextResponse } | { author: OrgEventAuthor }
> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return {
      refused: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    author: {
      userId: session.user.id,
      name: session.user.name ?? "Sans nom",
    },
  };
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Les refus communs, en réponses HTTP.
 *
 * `not-found` couvre aussi l'évènement privé d'une organisation dont on n'est
 * pas membre : la réponse ne confirme pas qu'il existe.
 */
export function refusal(
  reason: "not-found" | "forbidden" | "unknown-place" | "closed" | "full",
): NextResponse {
  switch (reason) {
    case "not-found":
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    case "forbidden":
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    case "unknown-place":
      return NextResponse.json(
        { error: "`meetingPlaceSlug` names no known place" },
        { status: 400 },
      );
    case "closed":
      return NextResponse.json(
        { error: "The event is over: registrations can no longer change" },
        { status: 409 },
      );
    case "full":
      return NextResponse.json(
        { error: "The event has no room left" },
        { status: 409 },
      );
  }
}
