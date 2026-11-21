/**
 * Publie les cartes de surface des planètes et des lunes.
 *
 *   npm run import:planet-maps -- <dossier> [--only daymar,nyx-i] [--dry-run]
 *
 * `<dossier>` contient un sous-dossier par corps, nommé par le slug de son lieu
 * (`daymar/`), tel que le produit l'export hors ligne : `manifest.json`,
 * `altitude.png`, `texture.jpg` et `tiles/{base,contours}/{z}/{x}/{y}.webp`.
 * Ce ne sont que nos rendus : aucun fichier du jeu n'en fait partie.
 *
 * Chaque corps est envoyé dans le blob storage sous
 * `planet-maps/<build>/<slug>/<révision>/`, puis la collection `planetMaps` pointe ce
 * dossier. Un nouveau build s'ajoute à côté de l'ancien ; la bascule se fait
 * à la fin, corps par corps, et revenir en arrière revient à relancer l'import
 * de l'ancien dossier. Idempotent : un fichier déjà là est réécrit.
 *
 * Demande `BLOB_READ_WRITE_TOKEN` et `MONGODB_URI`.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";
import { savePlanetMap } from "@/lib/planet-maps";
import type { PlanetMapManifest } from "@/types/planet-maps";

type Options = { folder: string; only?: Set<string>; dryRun: boolean };

function parseArgs(argv: string[]): Options {
  const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
  };
  let folder: string | undefined;
  let only: Set<string> | undefined;
  let dryRun = false;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--only") {
      const value = argv[++index] ?? fail("--only attend une liste de slugs");
      only = new Set(value.split(",").map((slug) => slug.trim()));
    } else if (!arg.startsWith("--") && !folder) folder = arg;
    else fail(`Option inconnue : ${arg}`);
  }
  return {
    folder: folder ?? fail("Indiquer le dossier exporté"),
    only,
    dryRun,
  };
}

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

async function listFiles(root: string, dir = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, dir), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, relative)));
    else files.push(relative);
  }
  return files;
}

/** Quelques envois à la fois : assez pour aller vite, pas assez pour être freiné. */
async function inPool<T>(
  items: T[],
  size: number,
  run: (item: T) => Promise<void>,
) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await run(items[next++]);
    }),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bodies = (await readdir(options.folder, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => !options.only || options.only.has(slug));

  for (const slug of bodies) {
    const root = path.join(options.folder, slug);
    const manifestPath = path.join(root, "manifest.json");
    if (!(await stat(manifestPath).catch(() => null))) {
      console.warn(`${slug} : pas de manifest.json, ignoré`);
      continue;
    }
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as PlanetMapManifest;
    if (manifest.slug !== slug) {
      console.warn(`${slug} : le manifeste dit « ${manifest.slug} », ignoré`);
      continue;
    }
    // Le manifeste en dernier : tant qu'il n'est pas là, rien ne pointe un dossier à moitié envoyé.
    const files = (await listFiles(root)).filter(
      (file) => file !== "manifest.json",
    );
    files.push("manifest.json");
    // Une révision tirée du contenu : un export corrigé va dans un autre
    // dossier, et les caches d'un an ne servent jamais d'anciennes tuiles.
    const hash = createHash("sha256");
    for (const file of ["manifest.json", "altitude.png", manifest.texture]) {
      hash.update(await readFile(path.join(root, file)));
    }
    const revision = hash.digest("hex").slice(0, 10);
    const prefix = `planet-maps/${manifest.build}/${slug}/${revision}`;
    console.log(`${slug} : ${files.length} fichiers → ${prefix}/`);
    if (options.dryRun) continue;

    let baseUrl = "";
    const upload = async (file: string) => {
      const body = await readFile(path.join(root, file));
      const result = await put(`${prefix}/${file}`, body, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType:
          CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream",
        // Un dossier ne change jamais : un nouvel export va dans une autre révision.
        cacheControlMaxAge: 60 * 60 * 24 * 365,
      });
      if (file === "manifest.json") {
        baseUrl = result.url.slice(0, -"manifest.json".length);
      }
    };
    await inPool(files.slice(0, -1), 8, upload);
    await upload("manifest.json");
    await savePlanetMap(slug, baseUrl, manifest);
    console.log(`${slug} : publié (${baseUrl})`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
