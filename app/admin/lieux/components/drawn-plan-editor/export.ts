"use client";

import { upload } from "@vercel/blob/client";
import { buildPlate, svgToPng } from "@/lib/plan-export";
import type { PlateOptions } from "@/lib/plan-render";
import type { DrawnPlacePlan, PlanPreview } from "@/types/places";

/**
 * L'aperçu qu'on range à côté du relevé, à l'enregistrement.
 *
 * Le reste de la chaîne — polices, rastérisation, téléchargement — vit dans
 * `lib/plan-export.ts`, que la page publique partage. Seul ce fichier-ci touche
 * au stockage, et c'est ce qui le garde hors du paquet public.
 */

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
