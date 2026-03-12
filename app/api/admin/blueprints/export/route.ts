import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import db from "@/lib/db";
import { Blueprint } from "@/types/crafting";
import { stringify } from "csv-stringify/sync";

type BlueprintDoc = Blueprint & { _id: unknown };

function getAllComponents(
  bp: BlueprintDoc,
): { name: string; quantity: number; unit?: string }[] {
  if (!bp.recipe) return [];
  const components: { name: string; quantity: number; unit?: string }[] = [];
  for (const step of bp.recipe) {
    for (const [name, details] of Object.entries(step)) {
      components.push({ name, quantity: details.quantity, unit: details.unit });
    }
  }
  return components;
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collection = db.db().collection<BlueprintDoc>("blueprints");
  const blueprints = await collection.find({}).sort({ name: 1 }).toArray();

  // Determine max number of recipe components across all blueprints
  const maxComponents = blueprints.reduce((max, bp) => {
    return Math.max(max, getAllComponents(bp).length);
  }, 0);

  // Collect all unique stat names
  const statNameSet = new Set<string>();
  for (const bp of blueprints) {
    if (bp.statistics) {
      for (const name of Object.keys(bp.statistics)) {
        statNameSet.add(name);
      }
    }
  }
  const statNames = Array.from(statNameSet).sort();

  // Build records as objects so csv-stringify can use key names as headers
  const records = blueprints.map((bp) => {
    const components = getAllComponents(bp);
    const record: Record<string, string | number> = {
      ID: bp.id ?? String(bp._id ?? ""),
      Nom: bp.name ?? "",
      Slug: bp.slug ?? "",
      Catégorie: bp.category ?? "",
      "Sous-catégorie": bp.subcategory ?? "",
      Tier: bp.tier ?? "",
      "Temps de fabrication (s)": bp.craftingTime ?? "",
      Description: bp.description ?? "",
      Obtention: bp.obtention ?? "",
    };

    for (let i = 0; i < maxComponents; i++) {
      const comp = components[i];
      record[`Composant ${i + 1}`] = comp ? comp.name : "";
      record[`Quantité ${i + 1}`] = comp ? comp.quantity : "";
      record[`Unité ${i + 1}`] = comp ? (comp.unit ?? "") : "";
    }

    for (const statName of statNames) {
      const stat = bp.statistics?.[statName];
      record[`Stat - ${statName}`] =
        stat != null
          ? stat.unit != null
            ? `${stat.value} ${stat.unit}`
            : String(stat.value)
          : "";
    }

    return record;
  });

  // Add UTF-8 BOM so Excel opens accented characters correctly
  const bom = "\uFEFF";
  const csvContent = bom + stringify(records, { header: true });

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="blueprints-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
