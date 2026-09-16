/**
 * Recopie la police de l'interface dans `public/fonts`.
 *
 * L'export d'une planche rastérise un SVG dans un `<canvas>` en le passant par
 * un `<img>`. Ce document-là est isolé : il n'hérite d'aucune police de la
 * page, pas même de celle que `next/font/local` a déjà chargée. Sans une
 * `@font-face` embarquée en base64 dans le SVG lui-même, le PNG sort en police
 * de repli — c'est-à-dire pas du tout comme ce qu'on voit à l'écran.
 *
 * D'où cette copie, servie sous une adresse stable que le navigateur peut
 * récupérer : les fichiers de `app/fonts` partent sous un nom haché que
 * personne ne peut deviner à l'exécution.
 *
 * Lancé par `postinstall`, comme `copy-draco.mjs` : un produit de
 * l'installation, pas un fichier versionné.
 */

import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = ["GeistVF.woff", "GeistMonoVF.woff"];
const to = join(root, "public", "fonts");

try {
  await mkdir(to, { recursive: true });
  await Promise.all(
    files.map((file) =>
      copyFile(join(root, "app", "fonts", file), join(to, file)),
    ),
  );
  console.log(`polices : ${files.length} fichier(s) copié(s) dans public/fonts`);
} catch (error) {
  // L'export dégrade en police de repli plutôt que de casser l'installation.
  console.warn(`polices : non copiées (${error})`);
}
