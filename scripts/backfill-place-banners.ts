/**
 * Pose en bannière la première image publiée des lieux qui n'en ont pas.
 * Les images publiées d'emblée (niveau 2 et plus) ne la posaient pas avant
 * que la règle ne vaille pour toutes les publications.
 *
 *   npm run backfill:banners            (liste seulement)
 *   npm run backfill:banners -- --apply (pose les bannières)
 */

import db from "@/lib/db";
import { ensurePlaceCover } from "@/lib/contributions";

const apply = process.argv.includes("--apply");

async function main() {
  const database = db.db();
  const slugs: string[] = await database
    .collection("placeMedia")
    .distinct("placeSlug", {
      status: "published",
      hiddenByReport: { $ne: true },
    });
  const bare = await database
    .collection("gameLocations")
    .find(
      {
        slug: { $in: slugs },
        $or: [
          { imageUrl: { $exists: false } },
          { imageUrl: { $type: "null" } },
          { imageUrl: "" },
        ],
      },
      { projection: { slug: 1 } },
    )
    .toArray();

  for (const { slug } of bare) {
    if (apply) await ensurePlaceCover(slug);
    console.log(`${apply ? "bannière posée" : "sans bannière"} : ${slug}`);
  }
  console.log(
    `${bare.length} lieu(x) ${apply ? "mis à jour" : "à mettre à jour (--apply pour poser)"}`,
  );
  await db.close();
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});
