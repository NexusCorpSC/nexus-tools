import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "bson";
import { auth } from "@/lib/auth";
import { RequestError, type Actor } from "@/lib/player-requests";

/** Le joueur connecté, site ou app, et le nom affiché dans les fils. */
export async function sessionActor(): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  return {
    id: new ObjectId(session.user.id),
    name: session.user.name || session.user.email || "?",
  };
}

export const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/** Les refus connus reviennent par leur code, que le site et l'app traduisent. */
export function requestErrorResponse(error: unknown) {
  if (error instanceof RequestError) {
    return NextResponse.json(
      { error: error.code, detail: error.detail },
      { status: error.status },
    );
  }
  throw error;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
