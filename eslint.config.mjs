import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([
  {
    // Le décodeur Draco est un binaire recopié depuis three à l'installation :
    // du code généré, que personne ne relit et que rien ne corrigera.
    ignores: ["public/draco/**"],
  },
  {
    extends: [...nextCoreWebVitals, ...nextTypescript],
  },
]);