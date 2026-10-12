import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { proposePrivatePlace } from "@/lib/private-place-proposal";
import type { PrivatePlaceProposalOptions } from "@/types/private-places";
import { errorResponse, sessionUser, unauthorized } from "../../errors";

/**
 * POST /api/lieux/prives/{slug}/proposer
 * Propose le lieu au public : une contribution « nouveau lieu ». Le corps dit
 * ce qui part avec lui (`PrivatePlaceProposalOptions`).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await sessionUser();
  if (!user) return unauthorized();
  const { slug } = await params;
  let body: PrivatePlaceProposalOptions = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    // Sans corps : les choix par défaut.
  }
  try {
    const result = await proposePrivatePlace(
      { id: new ObjectId(user.id), name: user.name },
      slug,
      {
        withDescription: body.withDescription === true,
        withImage: body.withImage !== false,
        withPosition: body.withPosition !== false,
      },
    );
    revalidatePath("/contributions");
    revalidatePath("/admin/contributions");
    if (result.contribution.status === "published") {
      revalidatePath("/lieux");
      revalidatePath(`/lieux/${result.contribution.target.slug}`);
    }
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
