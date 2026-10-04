/**
 * Supprime les images de lieux que plus rien ne référence.
 *
 *   npm run clean:blobs            (liste seulement)
 *   npm run clean:blobs -- --apply (supprime)
 *
 * Un joueur téléverse ses images avant d'envoyer sa contribution : s'il
 * abandonne le formulaire, ou si son relevé envoie un nouvel aperçu à chaque
 * enregistrement, les fichiers restent dans le stockage sans fiche ni
 * contribution pour les porter. Un plan supprimé laisse aussi la sienne. On
 * ne touche qu'aux images de galerie et de plans, jamais à une image de moins
 * de 48 heures : elle appartient peut-être à un envoi en cours.
 *
 * Une image est gardée dès que son adresse apparaît quelque part dans un
 * lieu, une image de galerie vivante, une contribution encore utile ou un
 * plan de vol d'escouade.
 */

import { del, list } from "@vercel/blob";
import db from "@/lib/db";

const MIN_AGE_MS = 48 * 60 * 60 * 1000;
const BLOB_URL =
  /https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^"\s)\\]+/gi;
/**
 * Les images de galerie et de plans. Une vignette de lieu ne se remplace
 * qu'en place : elle n'est jamais orpheline.
 */
const CANDIDATE = /^lieux\/[a-z0-9-]+\/(?:media|plans)\/[^/]+$/i;

function collect(into: Set<string>, value: unknown) {
  for (const match of JSON.stringify(value).matchAll(BLOB_URL)) {
    into.add(match[0]);
  }
}

async function referenced(): Promise<Set<string>> {
  const database = db.db();
  const urls = new Set<string>();
  const sources = [
    database.collection("gameLocations").find({}),
    database
      .collection("placeMedia")
      .find({ status: { $nin: ["rejected", "reverted"] } }),
    database
      .collection("contributions")
      .find({ status: { $nin: ["rejected", "reverted"] } }),
    // Un plan de vol d'escouade peut avoir pris un plan de lieu pour fond.
    database.collection("plans").find({}),
  ];
  for (const cursor of sources) {
    for await (const doc of cursor) collect(urls, doc);
  }
  return urls;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const keep = await referenced();
  const cutoff = Date.now() - MIN_AGE_MS;
  const orphans: string[] = [];
  let scanned = 0;

  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "lieux/", cursor, limit: 1000 });
    for (const blob of page.blobs) {
      scanned += 1;
      if (!CANDIDATE.test(blob.pathname)) continue;
      if (blob.uploadedAt.getTime() > cutoff) continue;
      if (keep.has(blob.url)) continue;
      orphans.push(blob.url);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  console.log(
    `${scanned} fichiers lus, ${orphans.length} orphelins${apply ? "" : " (rien supprimé, --apply pour supprimer)"}`,
  );
  for (const url of orphans) console.log(`  ${url}`);

  if (apply) {
    for (let start = 0; start < orphans.length; start += 100) {
      await del(orphans.slice(start, start + 100));
    }
    console.log(`${orphans.length} supprimés`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.close());
