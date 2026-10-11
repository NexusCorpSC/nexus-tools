import { NextResponse } from "next/server";
import { RefiningError } from "@/lib/refining-jobs";

/** La réponse d'une erreur des ordres de raffinage, ou 500 pour le reste. */
export function refiningErrorResponse(error: unknown) {
  if (error instanceof RefiningError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error(error);
  return NextResponse.json({ error: "Internal error" }, { status: 500 });
}
