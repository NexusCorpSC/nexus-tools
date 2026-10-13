import { NextRequest, NextResponse } from "next/server";
import { deleteMarker, getMarker, updateMarker } from "@/lib/markers";
import type { MarkerInput } from "@/types/markers";
import {
  errorResponse,
  invalidInput,
  readJson,
  sessionUser,
  unauthorized,
} from "../errors";

type Params = { params: Promise<{ id: string }> };

/** GET /api/marqueurs/{id} : un marqueur, à qui le voit. */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const marker = await getMarker(user.id, id);
  if (!marker) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  return NextResponse.json(marker);
}

/** PATCH /api/marqueurs/{id} : les champs donnés, au créateur seul. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = await readJson<MarkerInput>(request);
  if (!body) return invalidInput();
  try {
    await updateMarker(user.id, id, body);
    return NextResponse.json({ id });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/marqueurs/{id} */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { id } = await params;
  try {
    await deleteMarker(user.id, id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
