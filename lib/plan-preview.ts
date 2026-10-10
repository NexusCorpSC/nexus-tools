import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { put } from "@vercel/blob";
import fr from "@/messages/fr.json";
import {
  plateOptions,
  plateSize,
  renderPlateSvg,
  type PlateOptions,
} from "@/lib/plan-render";
import { woffToSfnt } from "@/lib/woff-to-sfnt";
import type { DrawnPlacePlan, PlanPreview } from "@/types/places";

/**
 * La planche d'un plan dessiné, rastérisée sur le serveur.
 *
 * L'éditeur du site rastérise dans le navigateur (`lib/plan-export.ts`). Un
 * agent qui dessine par le serveur MCP n'a pas de navigateur : on rend ici le
 * même SVG (`renderPlateSvg`) avec `@resvg/resvg-js`, et la police de
 * l'interface, convertie du WOFF qui est la seule forme que le dépôt en a.
 *
 * Les libellés de la planche sont ceux de la langue par défaut du site : un
 * aperçu publié est le même pour tout le monde.
 */

const FACES = ["GeistVF.woff", "GeistMonoVF.woff"];

let fonts: Promise<Buffer[]> | null = null;

function loadFonts(): Promise<Buffer[]> {
  fonts ??= Promise.all(
    FACES.map(async (file) =>
      woffToSfnt(await readFile(join(process.cwd(), "app", "fonts", file))),
    ),
  ).catch(() => {
    // Sans police, le texte disparaît du rendu mais le dessin reste lisible.
    fonts = null;
    return [];
  });
  return fonts;
}

const labels = fr.Places.Admin;

/** L'habillage de la planche : titre, légende, mentions. */
export function previewOptions(
  plan: DrawnPlacePlan,
  placeName: string,
  levelIds?: string[],
): Omit<PlateOptions, "fontCss"> {
  return {
    ...plateOptions(plan, {
      placeName,
      glyphs: {
        door: labels.glyphs.door,
        doubleDoor: labels.glyphs.doubleDoor,
        airlock: labels.glyphs.airlock,
        stairUp: labels.glyphs.stairUp,
        stairDown: labels.glyphs.stairDown,
        objective: labels.glyphs.objective,
        terminal: labels.glyphs.terminal,
      },
      credits: labels.plateCredits,
    }),
    ...(levelIds ? { levelIds } : {}),
  };
}

/** La planche en PNG, avec son SVG (pour l'empreinte) et sa taille. */
export async function renderPlatePng(
  plan: DrawnPlacePlan,
  options: Omit<PlateOptions, "fontCss">,
): Promise<{ png: Buffer; svg: string; width: number; height: number }> {
  const svg = renderPlateSvg(plan, { ...options, fontCss: "" });
  const { width, height } = plateSize(plan, options);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      // `fontBuffers` existe dans le binaire mais pas dans les types publiés.
      fontBuffers: await loadFonts(),
      loadSystemFonts: false,
      defaultFontFamily: "Geist",
    },
  } as ConstructorParameters<typeof Resvg>[1]);
  return { png: resvg.render().asPng(), svg, width, height };
}

/**
 * Une empreinte courte de la planche, pour que l'adresse de l'aperçu suive son
 * contenu : la même que `drawn-plan-editor/export.ts` (FNV-1a, deux graines).
 */
export function plateFingerprint(source: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return (a.toString(36) + b.toString(36).padStart(7, "0")).slice(0, 13);
}

/**
 * L'aperçu d'un relevé, rendu et rangé dans le blob storage comme le fait
 * l'éditeur. `null` quand il n'y a rien à montrer (aucune pièce), ou quand le
 * stockage n'est pas configuré (développement) : le relevé part sans aperçu,
 * comme quand le rendu échoue dans l'éditeur.
 */
export async function uploadPlanPreview(
  plan: DrawnPlacePlan,
  slug: string,
  placeName: string,
): Promise<PlanPreview | null> {
  if (!plan.levels.some((level) => level.rooms.length)) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;

  const plate = await renderPlatePng(plan, previewOptions(plan, placeName));
  const blob = await put(
    `lieux/${slug}/plans/${plan.id}-${plateFingerprint(plate.svg)}.png`,
    plate.png,
    {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
      allowOverwrite: true,
    },
  );
  return { url: blob.url, width: plate.width, height: plate.height };
}
