import { NextRequest, NextResponse } from "next/server";
import { createMarkerCollection } from "@/lib/markers";
import type { MarkerCollectionInput } from "@/types/markers";
import {
  errorResponse,
  invalidInput,
  readJson,
  sessionUser,
  unauthorized,
} from "../errors";

/** POST /api/marqueurs/collections : `{ name, color?, orgId? }`. */
export async function POST(request: NextRequest) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const body = await readJson<MarkerCollectionInput>(request);
  if (!body) return invalidInput();
  try {
    const id = await createMarkerCollection(user.id, body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
