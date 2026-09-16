"use client";

import {
  plateSize,
  renderPlateSvg,
  type PlateOptions,
} from "@/lib/plan-render";
import type { DrawnPlacePlan } from "@/types/places";

/**
 * De la géométrie au fichier : la planche en PNG.
 *
 * Tout se passe dans le navigateur, et c'est un choix : le dépôt n'embarque
 * aucun rastériseur — ni `satori`, ni `resvg`, ni `sharp`. En ajouter un
 * coûterait une dépendance native sur une route serveur pour produire une image
 * que le navigateur sait déjà dessiner, puisque c'est exactement ce qu'il fait
 * de la planche à l'écran.
 *
 * Ce module vit dans `lib/` et non dans l'administration parce que **la page
 * publique d'un lieu s'en sert aussi** : elle propose la planche au
 * téléchargement. Il ne dépend donc pas du client de stockage, que seul
 * l'enregistrement d'un relevé emploie.
 */

/** Les copies que `scripts/copy-plan-font.mjs` dépose sous une adresse stable. */
const FACES = [
  { family: "Geist", file: "/fonts/GeistVF.woff" },
  { family: "Geist Mono", file: "/fonts/GeistMonoVF.woff" },
] as const;

/** Une seule lecture par session : deux fois soixante-six kilo-octets. */
let faces: Promise<string> | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  // Par tranches : `String.fromCharCode(...bytes)` d'un coup dépasse la pile
  // d'appels bien avant les soixante-six kilo-octets d'une police.
  const step = 8192;
  for (let at = 0; at < bytes.length; at += step) {
    binary += String.fromCharCode(...bytes.subarray(at, at + step));
  }
  return btoa(binary);
}

/**
 * Les `@font-face` de la planche, polices comprises.
 *
 * Un SVG rastérisé traverse un `<img>`, dont le document n'hérite d'aucune
 * police de la page : sans cet embarquement, le PNG sort dans la police de
 * repli du navigateur, et ne ressemble pas à ce qu'on voit à l'écran.
 */
export function plateFontCss(): Promise<string> {
  faces ??= Promise.all(
    FACES.map(async (face) => {
      const response = await fetch(face.file);
      if (!response.ok) throw new Error(face.file);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return (
        `@font-face{font-family:"${face.family}";font-weight:100 900;` +
        `src:url(data:font/woff;base64,${toBase64(bytes)}) format("woff");}`
      );
    }),
  )
    .then((rules) => rules.join(""))
    // Une police absente dégrade le rendu ; elle n'empêche pas d'exporter.
    .catch(() => "");

  return faces;
}

/** Rastérise une planche. Le SVG est passé en URL de données, jamais en blob. */
export async function svgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<Blob> {
  // `encodeURIComponent` et non `btoa` : la planche est en français, et `btoa`
  // refuse tout ce qui sort du latin-1 — un « é » suffit à la faire échouer.
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("svg"));
    image.src = source;
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))),
      "image/png",
    );
  });
}

/** La planche et sa taille, telles qu'elles partiront en PNG. */
export async function buildPlate(
  plan: DrawnPlacePlan,
  options: Omit<PlateOptions, "fontCss">,
): Promise<{ svg: string; width: number; height: number }> {
  const fontCss = await plateFontCss();
  const svg = renderPlateSvg(plan, { ...options, fontCss });
  return { svg, ...plateSize(plan, options) };
}

/** Propose le PNG au téléchargement, sous un nom qui dit ce qu'il contient. */
export async function downloadPlatePng(
  plan: DrawnPlacePlan,
  fileName: string,
  options: Omit<PlateOptions, "fontCss">,
): Promise<void> {
  const plate = await buildPlate(plan, options);
  const blob = await svgToPng(plate.svg, plate.width, plate.height);
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
