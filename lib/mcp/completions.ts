import "server-only";
import db from "@/lib/db";

/**
 * L'autocomplétion des slugs, pour les modèles de ressources et les prompts.
 *
 * Le client envoie ce que l'utilisateur a déjà tapé ; on rend les slugs dont le
 * slug ou le nom contient ce texte, ceux qui commencent par lui d'abord. Le
 * SDK coupe à 100 valeurs, on s'arrête bien avant.
 */
const MAX_COMPLETIONS = 20;

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function completeField(
  collection: string,
  key: string,
  value: string,
  extra: Record<string, unknown> = {},
): Promise<string[]> {
  const typed = value.trim();
  const filter = typed
    ? {
        ...extra,
        $or: [
          { [key]: { $regex: escapeRegex(typed), $options: "i" } },
          { name: { $regex: escapeRegex(typed), $options: "i" } },
        ],
      }
    : extra;
  const docs = await db
    .db()
    .collection(collection)
    .find(filter, { projection: { _id: 0, [key]: 1 } })
    .sort({ name: 1 })
    .limit(MAX_COMPLETIONS * 2)
    .toArray();
  const lower = typed.toLowerCase();
  return docs
    .map((doc) => String(doc[key]))
    .sort(
      (a, b) =>
        Number(!a.toLowerCase().startsWith(lower)) -
        Number(!b.toLowerCase().startsWith(lower)),
    )
    .slice(0, MAX_COMPLETIONS);
}

export const completeItemSlug = (value: string) =>
  completeField("gameItems", "slug", value);

export const completePlaceSlug = (value: string) =>
  completeField("gameLocations", "slug", value);

export const completeBlueprintSlug = (value: string) =>
  completeField("blueprints", "slug", value);

export const completeShopId = (value: string) =>
  completeField("shops", "id", value, { reportHidden: { $ne: true } });
