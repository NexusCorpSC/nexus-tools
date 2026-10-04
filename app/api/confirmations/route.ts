import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { ContributionError } from "@/lib/contribution-store";
import { submitConfirmation } from "@/lib/confirmations";

/**
 * POST /api/confirmations
 * Body : `{ target: { type, slug }, subject: "prices" | "services" |
 * "sources", accurate: boolean, comment? }`. « Toujours exact » date la
 * donnée d'aujourd'hui ; « plus exact » (`accurate: false`) la dit périmée, et
 * le troisième joueur à le dire ouvre un signalement (`reported`).
 *
 * Répond `{ confirmation: { points, at }, standing, reported }`. Refus :
 * `{ error }` — `alreadyConfirmed` si le joueur l'a déjà fait cette semaine.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await submitConfirmation(
        { id: new ObjectId(session.user.id), name: session.user.name },
        body,
      ),
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof ContributionError) {
      return NextResponse.json({ error: error.code }, { status: error.status });
    }
    throw error;
  }
}
