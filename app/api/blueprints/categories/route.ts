import { NextResponse } from "next/server";
import { getBlueprintCategories } from "@/lib/crafting";

export async function GET() {
  const categories = await getBlueprintCategories();
  return NextResponse.json(categories);
}
