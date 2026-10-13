import { NextResponse } from "next/server";
import { MarkerError } from "@/lib/markers";

export { sessionUser, unauthorized } from "@/app/api/lieux/prives/errors";

/** Les erreurs connues reviennent par leur code, que les formulaires traduisent. */
export function errorResponse(error: unknown) {
  if (error instanceof MarkerError) {
    return NextResponse.json(
      { error: error.code, detail: error.message },
      { status: error.status },
    );
  }
  throw error;
}

/** Le corps JSON d'une requête, ou `null` s'il ne se lit pas. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const invalidInput = () =>
  NextResponse.json({ error: "invalidInput" }, { status: 400 });
