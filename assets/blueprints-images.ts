import db from "@/lib/db";
import { put } from "@vercel/blob";
import { ObjectId } from "bson";

async function importImage(
  _id: ObjectId,
  slug: string,
  name: string,
): Promise<void> {
  const url = `https://starcitizen.tools/${name.replaceAll(" ", "_")}`;

  const page = await fetch(url);

  const pageText = await page.text();

  const metaRegex = /<meta property="og:image" content="([^"]+)"\/?>/i;
  const match = pageText.match(metaRegex);
  if (match && match[1]) {
    const imageUrl = match[1];
    console.log(imageUrl);

    if (
      imageUrl !== "https://media.starcitizen.tools/9/93/Placeholderv2.png" &&
      imageUrl !== "https://starcitizen.tools/resources/assets/sitelogo.svg"
    ) {
      const ext = imageUrl.split(".").pop()?.toLowerCase() ?? "jpg";
      const pathname = `blueprints/${slug}/image.${ext}`;

      const blob = await put(pathname, await (await fetch(imageUrl)).blob(), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      await db
        .db()
        .collection("blueprints")
        .updateOne({ _id }, { $set: { imageUrl: blob.url } });
    }
  }
}

async function importImages() {
  const blueprints = await db
    .db()
    .collection("blueprints")
    .find({ imageUrl: null }, { projection: { name: 1, slug: 1, _id: 1 } })
    .toArray();

  console.log(blueprints.length);

  for (const blueprint of blueprints) {
    await importImage(blueprint._id, blueprint.slug, blueprint.name);
  }

  await db.close();
}

async function main() {
  await importImages();
}

main();
