import { NextRequest, NextResponse } from "next/server";
import { deleteMarkerCollection, updateMarkerCollection } from "@/lib/markers";
import type { MarkerCollectionInput } from "@/types/markers";
import {
  errorResponse,
  invalidInput,
  readJson,
  sessionUser,
  unauthorized,
} from "../../errors";

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/marqueurs/collections/{id} : nom, couleur, partage. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await readJson<MarkerCollectionInput>(request);
  if (!body) return invalidInput();
  try {
    await updateMarkerCollection(user.id, id, body);
    return NextResponse.json({ id });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/marqueurs/collections/{id} : ses marqueurs restent, sans collection. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    await deleteMarkerCollection(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
