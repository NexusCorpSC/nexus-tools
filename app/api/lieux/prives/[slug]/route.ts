import { NextRequest, NextResponse } from "next/server";
import {
  deletePrivatePlace,
  getPrivatePlace,
  updatePrivatePlace,
} from "@/lib/private-places";
import type { PrivatePlaceInput } from "@/types/private-places";
import { errorResponse, sessionUser, unauthorized } from "../errors";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/lieux/prives/{slug} : la fiche, à qui la voit. */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { slug } = await params;
  const place = await getPrivatePlace(user.id, slug);
  if (!place) {
    return NextResponse.json({ error: "notFound" }, { status: 404 });
  }
  return NextResponse.json(place);
}

/** PATCH /api/lieux/prives/{slug} : tout le formulaire, au créateur seul. */
export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { slug } = await params;
  let body: PrivatePlaceInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalidInput" }, { status: 400 });
  }
  try {
    await updatePrivatePlace(user.id, slug, body);
    return NextResponse.json({ slug });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/lieux/prives/{slug} : les objets rangés là passent dans un
 * emplacement personnel du même nom.
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { slug } = await params;
  try {
    await deletePrivatePlace(user.id, slug);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
