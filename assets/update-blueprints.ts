import { readFileSync } from "fs";
import path from "node:path";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { Blueprint } from "@/types/crafting";

function stringToSlug(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[\W_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function updateBlueprints() {
  const rawMissions: {
    version: string;
    blueprintPools: {
      [blueprintPoolId: string]: {
        name: string;
        blueprints: {
          weight: 1;
          name: string;
        }[];
      };
    };
    factions: {
      [factionId: string]: {
        name: string;
      };
    };
    contracts: {
      id: string;
      missionType: string;
      title: string;
      factionGuid: string;
      blueprintRewards?: {
        blueprintPool: string;
        chance: number;
        poolName: string;
      }[];
    }[];
  } = JSON.parse(
    await readFileSync(path.join(__dirname, "missions.json"), "utf8"),
  );
  const rawBlueprints: {
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

  const blueprints = rawBlueprints.blueprints;

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

  for (const bp of prepared) {
    const existing = await db
      .db()
      .collection<Blueprint>("blueprints")
      .findOne({ name: bp.name });

    if (!existing) {
      await db.db().collection("blueprints").insertOne(bp);
    } else {
      const update: Partial<Blueprint> = {
        name: bp.name,
        description: bp.description,
        category: bp.category,
        subcategory: bp.subcategory,
        tier: bp.tier,
        craftingTime: bp.craftingTime,
        statistics: {},
        recipe: bp.recipe,
        isDefault: bp.isDefault,
      };

      await db
        .db()
        .collection("blueprints")
        .updateOne(
          { _id: new ObjectId(existing._id) },
          {
            $set: {
              ...update,
            },
          },
        );
    }
  }

  console.log("DONE");
}

updateBlueprints()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
