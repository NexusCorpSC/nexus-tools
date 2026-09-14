import { NextResponse } from "next/server";
import { getPlaceDetails } from "@/lib/places";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const place = await getPlaceDetails(slug);

  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json(place);
}
