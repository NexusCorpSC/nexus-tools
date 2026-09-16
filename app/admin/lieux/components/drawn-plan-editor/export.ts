"use client";

import { upload } from "@vercel/blob/client";
import {
  plateSize,
  renderPlateSvg,
  type PlateOptions,
} from "@/lib/plan-render";
import { PLAN_INK_COLORS, type PlanGlyph } from "@/lib/plan-symbols";
import type { DrawnPlacePlan, PlanPreview } from "@/types/places";

/**
 * De la géométrie au fichier : la planche en PNG, et l'aperçu qu'on range à
 * côté du relevé.
 *
 * Tout se passe dans le navigateur, et c'est un choix : le dépôt n'embarque
 * aucun rastériseur — ni `satori`, ni `resvg`, ni `sharp`. En ajouter un
 * coûterait une dépendance native sur une route serveur pour produire une image
 * que le navigateur sait déjà dessiner, puisque c'est exactement ce qu'il fait
 * de la planche à l'écran.
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

/**
 * La légende d'une planche : les seuls symboles qu'elle emploie.
 *
 * Une légende exhaustive dirait d'un relevé sans escalier qu'il en a un. On la
 * déduit donc du dessin, plutôt que de la tenir à la main quelque part.
 */
export function plateLegend(
  plan: DrawnPlacePlan,
  labels: Record<string, string>,
): { glyph: PlanGlyph; label: string; color?: string }[] {
  const used = new Set<PlanGlyph>();

  for (const level of plan.levels) {
    for (const door of level.doors) {
      if (door.kind === "double") used.add("doubleDoor");
      else if (door.kind === "airlock") used.add("airlock");
      else if (door.kind === "single") used.add("door");
    }
    for (const room of level.rooms) {
      if (room.stair === "up") used.add("stairUp");
      if (room.stair === "down") used.add("stairDown");
      if (room.fill === "objective") used.add("objective");
    }
  }
  if (plan.markers.length) used.add("terminal");

  return [...used].map((glyph) => ({
    glyph,
    label: labels[glyph] ?? glyph,
    color: glyph === "objective" ? PLAN_INK_COLORS.amber : undefined,
  }));
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

/**
 * Une empreinte courte de la planche, pour que son adresse suive son contenu.
 *
 * FNV-1a sur deux graines, en base 36 : treize caractères qui tiennent dans le
 * segment que la route d'envoi autorise, sans dépendance ni contexte sécurisé
 * — `crypto.subtle` n'en est pas un partout où l'admin s'ouvre.
 */
function fingerprint(source: string): string {
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
 * L'aperçu rangé avec le relevé, produit à l'enregistrement.
 *
 * Il n'est pas la carte : il est ce que lisent ceux qui ne savent pas dessiner
 * un plan — l'overlay de `nexus-app`, le fond d'un plan de vol.
 *
 * **Son adresse porte une empreinte de la planche**, et c'est tout le sujet.
 * Elle était fixe : `lieux/<slug>/plans/<planId>.png`, réécrite en place à
 * chaque enregistrement. Le navigateur, le CDN et l'optimiseur d'images
 * servaient donc éternellement la première version — celle d'un relevé encore
 * vide, avec son titre, son échelle et rien au milieu — et comme l'adresse
 * stockée ne changeait pas d'un caractère, rien ne pouvait s'en apercevoir.
 * On ne pouvait même pas la forcer d'un `?v=` : `next.config.ts` déclare
 * `search: ""` pour cet hôte.
 *
 * Avec l'empreinte, le cache redevient un avantage : même planche, même
 * adresse ; planche différente, adresse neuve. Le dépôt assume déjà de laisser
 * des images orphelines, ici une par version publiée du dessin.
 *
 * Rend `null` quand le relevé n'a pas une seule pièce : il n'y a alors rien à
 * montrer, et téléverser un cadre vide est précisément ce qui a créé le défaut.
 */
export async function renderPreview(
  plan: DrawnPlacePlan,
  slug: string,
  options: Omit<PlateOptions, "fontCss">,
): Promise<PlanPreview | null> {
  if (!plan.levels.some((level) => level.rooms.length)) return null;

  const plate = await buildPlate(plan, options);
  const blob = await svgToPng(plate.svg, plate.width, plate.height);
  const uploaded = await upload(
    `lieux/${slug}/plans/${plan.id}-${fingerprint(plate.svg)}.png`,
    blob,
    { access: "public", handleUploadUrl: "/api/lieux/upload" },
  );
  return { url: uploaded.url, width: plate.width, height: plate.height };
}
