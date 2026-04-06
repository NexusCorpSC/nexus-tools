import { Blueprint } from "@/types/crafting";
import { readFileSync } from "fs";
import path from "node:path";

function stringToSlug(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[\W_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function importBluePrints() {
  const raw: {
    blueprints: {
      guid: string;
      tag: string;
      productEntityClass: string;
      type: string;
      subtype: string;
      tiers: {
        craftTimeSeconds: number;
        slots: {
          name: string;
          modifiers: null;
          options: {
            type: "resource" | "item";
            quantity: number;
            minQuality?: number;
            resourceName?: string;
            itemName?: string;
            modifiers?: null;
          }[];
        }[];
      }[];
      productName: string;
      isDefault: boolean;
    }[];
  } = JSON.parse(
    await readFileSync(path.join(__dirname, "blueprints.json"), "utf8"),
  );

  const blueprints = raw.blueprints;

  const prepared: Omit<Blueprint, "id">[] = blueprints
    .filter((bp) => bp.tiers?.[0])
    .map((bp): Omit<Blueprint, "id"> => {
      return {
        name: bp.productName,
        slug: stringToSlug(bp.productName),
        description: `Blueprint pour fabriquer ${bp.productName}`,
        category: bp.type,
        subcategory: bp.subtype,
        imageUrl: undefined,
        tier: 0,
        craftingTime: bp.tiers?.[0]?.craftTimeSeconds,
        statistics: {},
        recipe: bp.tiers?.[0]
          ? {
              craftingTime: bp.tiers[0].craftTimeSeconds ?? 0,
              components: bp.tiers[0].slots.map((slot) => {
                return {
                  name: slot.name,
                  options: slot.options.map((option) => {
                    return {
                      quantity: option.quantity,
                      minQuality: option.minQuality,
                      unit: option.type === "resource" ? "SCU" : "unit",
                      name: option.resourceName ?? option.itemName ?? "Unknown",
                    };
                  }),
                };
              }),
            }
          : undefined,
        obtention: bp.isDefault ? "Obtenu par défaut." : "",
        isDefault: bp.isDefault,
      };
    });
}

async function main() {
  await importBluePrints();
}

main();
