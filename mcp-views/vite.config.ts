import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

/**
 * Les vues MCP Apps (`lib/mcp/apps.ts`), compilées en un seul fichier HTML
 * que la route `/mcp` sert telle quelle : `npm run mcp:views`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const VIRTUAL = "virtual:view-messages";
const GLYPHS = [
  "door",
  "doubleDoor",
  "airlock",
  "stairUp",
  "stairDown",
  "objective",
  "terminal",
] as const;

/**
 * Les textes des vues, pris dans `messages/<langue>.json` : seulement
 * `McpViews`, les services des lieux et les légendes des plans, pas tout
 * le site.
 */
function viewMessages(): Plugin {
  return {
    name: "nexus-view-messages",
    resolveId: (id) => (id === VIRTUAL ? `\0${VIRTUAL}` : null),
    load(id) {
      if (id !== `\0${VIRTUAL}`) return null;
      const messages = Object.fromEntries(
        ["fr", "en", "es"].map((locale) => {
          const file = path.join(root, "messages", `${locale}.json`);
          this.addWatchFile(file);
          const all = JSON.parse(readFileSync(file, "utf8"));
          const admin = all.Places.Admin;
          return [
            locale,
            {
              ...all.McpViews,
              placeServices: all.Places.services,
              planPlate: {
                glyphs: Object.fromEntries(
                  GLYPHS.map((glyph) => [glyph, admin.glyphs[glyph]]),
                ),
                credits: admin.plateCredits,
              },
            },
          ];
        }),
      );
      return `export default ${JSON.stringify(messages)};`;
    },
  };
}

export default defineConfig({
  root: here,
  resolve: { alias: { "@": root } },
  esbuild: { jsx: "automatic" },
  plugins: [viewMessages(), viteSingleFile()],
  build: {
    outDir: path.join(root, "lib/mcp/views/dist"),
    emptyOutDir: true,
    target: "es2020",
  },
});
