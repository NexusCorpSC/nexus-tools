"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { savePlacePlansAction } from "@/app/lieux/actions";
import type { PlateOptions } from "@/lib/plan-render";
import {
  isDrawnPlan,
  type DrawnPlacePlan,
  type PlacePlan,
  type StoredPlacePlan,
} from "@/types/places";
import { plateLegend, renderPreview } from "./drawn-plan-editor/export";

/**
 * L'enregistrement des plans d'un lieu, partagé par les deux écrans qui le
 * déclenchent : la page des plans et l'éditeur de relevé en plein écran.
 *
 * Le partage n'est pas qu'une économie de lignes. `savePlacePlans` remplace les
 * plans **en bloc** : n'envoyer que celui qu'on vient de modifier effacerait
 * tous les autres du lieu. Deux implémentations de cette règle, ce serait une
 * occasion de n'en corriger qu'une.
 */

/**
 * Dans l'éditeur, un plan qui porte `borrowedFrom` est un emprunt : on le
 * manipule comme un plan ordinaire — il s'affiche, il se réordonne — mais à
 * l'enregistrement il retrouve sa forme d'adresse.
 *
 * C'est tout le mécanisme du détachement : retirer `borrowedFrom` à un plan
 * suffit à en faire le sien, et le prochain enregistrement l'écrit en propre.
 * Sans cette conversion, le premier enregistrement recopierait chaque emprunt,
 * et la correction faite chez la source ne se propagerait plus.
 */
export function toStored(entry: PlacePlan): StoredPlacePlan {
  return entry.borrowedFrom
    ? {
        id: entry.id,
        sourceSlug: entry.borrowedFrom.slug,
        sourcePlanId: entry.borrowedFrom.planId,
      }
    : entry;
}

export type SavePlansResult =
  | { ok: true; plans: PlacePlan[] }
  | { ok: false; error: string };

/**
 * L'habillage de la planche d'un relevé, et l'enregistrement de tous les plans
 * du lieu.
 *
 * @param placeName Le titre que porte une planche exportée : le lieu, pas le plan.
 */
export function usePlanSaver(slug: string, placeName: string) {
  const t = useTranslations("Places");

  const plate = useCallback(
    (entry: DrawnPlacePlan): Omit<PlateOptions, "fontCss"> => ({
      title: placeName,
      subtitle: entry.name,
      legend: plateLegend(entry, {
        door: t("Admin.glyphs.door"),
        doubleDoor: t("Admin.glyphs.doubleDoor"),
        airlock: t("Admin.glyphs.airlock"),
        stairUp: t("Admin.glyphs.stairUp"),
        stairDown: t("Admin.glyphs.stairDown"),
        objective: t("Admin.glyphs.objective"),
        terminal: t("Admin.glyphs.terminal"),
      }),
      credits: t("Admin.plateCredits"),
    }),
    [placeName, t],
  );

  /**
   * Un relevé dessiné emporte son aperçu rastérisé. C'est lui que lisent ceux
   * qui ne savent pas dessiner une géométrie — l'overlay de nexus-app, le fond
   * d'un plan de vol — et le produire ici, au moment où le dessin est complet,
   * évite d'avoir à le régénérer à la lecture. Un aperçu qui échoue n'arrête
   * pas l'enregistrement : c'est un confort, le relevé, lui, doit partir.
   */
  const save = useCallback(
    async (plans: PlacePlan[]): Promise<SavePlansResult> => {
      const rendered = await Promise.all(
        plans.map(async (entry) => {
          if (!isDrawnPlan(entry) || entry.borrowedFrom) return entry;
          try {
            const preview = await renderPreview(entry, slug, plate(entry));
            return { ...entry, preview };
          } catch {
            toast.warning(t("Admin.previewFailed"));
            return entry;
          }
        }),
      );

      const result = await savePlacePlansAction(slug, rendered.map(toStored));
      return result.ok ? { ok: true, plans: rendered } : result;
    },
    [plate, slug, t],
  );

  return { plate, save };
}
