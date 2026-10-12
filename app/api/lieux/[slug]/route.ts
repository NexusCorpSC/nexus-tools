import { NextResponse } from "next/server";
import { getPlaceLore } from "@/lib/lore";
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

  // Le lore du lieu (starmap et Galactapedia, en anglais) : l'app l'affiche
  // sur la fiche comme le site.
  const lore = await getPlaceLore(place);
  return NextResponse.json({ ...place, lore: lore ?? undefined });
}
