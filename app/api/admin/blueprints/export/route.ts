import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/permissions";
import db from "@/lib/db";
import { Blueprint } from "@/types/crafting";

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

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

  // Build CSV headers
  const headers: string[] = [
    "ID",
    "Nom",
    "Slug",
    "Catégorie",
    "Sous-catégorie",
    "Tier",
    "Temps de fabrication (s)",
    "Description",
    "Obtention",
  ];

  for (let i = 1; i <= maxComponents; i++) {
    headers.push(`Composant ${i}`);
    headers.push(`Quantité ${i}`);
    headers.push(`Unité ${i}`);
  }

  for (const statName of statNames) {
    headers.push(`Stat - ${statName}`);
  }

  // Build CSV rows
  const rows = blueprints.map((bp) => {
    const components = getAllComponents(bp);
    const row: string[] = [
      bp.id ?? String(bp._id ?? ""),
      bp.name ?? "",
      bp.slug ?? "",
      bp.category ?? "",
      bp.subcategory ?? "",
      bp.tier != null ? String(bp.tier) : "",
      bp.craftingTime != null ? String(bp.craftingTime) : "",
      bp.description ?? "",
      bp.obtention ?? "",
    ];

    for (let i = 0; i < maxComponents; i++) {
      const comp = components[i];
      row.push(comp ? comp.name : "");
      row.push(comp ? String(comp.quantity) : "");
      row.push(comp ? (comp.unit ?? "") : "");
    }

    for (const statName of statNames) {
      const stat = bp.statistics?.[statName];
      if (stat != null) {
        const val =
          stat.unit != null
            ? `${stat.value} ${stat.unit}`
            : String(stat.value);
        row.push(val);
      } else {
        row.push("");
      }
    }

    return row;
  });

  const csvLines = [headers, ...rows]
    .map((row) => row.map(escapeCSV).join(","))
    .join("\n");

  // Add UTF-8 BOM so Excel opens accented characters correctly
  const bom = "\uFEFF";
  const csvContent = bom + csvLines;

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="blueprints-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
