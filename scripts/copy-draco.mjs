/**
 * Recopie le décodeur Draco de three dans `public/draco`.
 *
 * Les modèles 3D des véhicules (Fleetyards) sont compressés en Draco : le
 * `GLTFLoader` ne sait les ouvrir qu'avec ce décodeur, qui est un binaire
 * WebAssembly et ne peut donc pas être empaqueté par le bundler. Le charger
 * depuis un CDN tiers marcherait, au prix d'une dépendance de plus au moment
 * où la page s'affiche : on le sert nous-mêmes.
 *
 * Lancé par `postinstall`, donc avant le build : la copie est un produit de
 * l'installation, pas un fichier versionné.
 */

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(
  root,
  "node_modules",
  "three",
  "examples",
  "jsm",
  "libs",
  "draco",
  "gltf",
);
const to = join(root, "public", "draco");

try {
  const files = await readdir(from);
  await mkdir(to, { recursive: true });
  await Promise.all(
    files.map((file) => copyFile(join(from, file), join(to, file))),
  );
  console.log(`draco : ${files.length} fichier(s) copié(s) dans public/draco`);
} catch (error) {
  // Une installation sans three (ou partielle) ne doit pas faire échouer le
  // `npm install` : seule la vue 3D en dépend, et elle sait se taire.
  console.warn(`draco : décodeur non copié (${error})`);
}
