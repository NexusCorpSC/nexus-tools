import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPlacePlans } from "@/lib/places";
import { plateOptions, renderPlateSvg } from "@/lib/plan-render";
import { isDrawnPlan } from "@/types/places";
import { PrintButton } from "./print-button";

/**
 * La planche d'un relevé, seule sur sa page.
 *
 * C'est l'adresse qu'on partage, et c'est aussi le PDF : imprimer depuis le
 * navigateur suffit, ce qui évite d'embarquer un moteur de PDF pour produire
 * une mise en page que le navigateur sait déjà composer. Le PNG, lui, passe par
 * `drawn-plan-editor/export.ts`, qui rastérise le même SVG.
 */

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default async function PlatePage({
  params,
}: {
  params: Promise<{ slug: string; planId: string }>;
}) {
  const { slug, planId } = await params;
  const place = await getPlacePlans(slug);
  if (!place) notFound();

  const plan = place.plans.find((entry) => entry.id === planId);
  // Un plan image n'a pas de planche : il *est* déjà une image.
  if (!plan || !isDrawnPlan(plan)) notFound();

  const t = await getTranslations("Places.Admin");
  // La même composition que l'aperçu et que le téléchargement : cette page
  // passait une légende vide, donc la planche qu'on partage n'expliquait aucun
  // de ses symboles alors que le PNG du même relevé les listait tous.
  const svg = renderPlateSvg(
    plan,
    plateOptions(plan, {
      placeName: place.name,
      glyphs: {
        door: t("glyphs.door"),
        doubleDoor: t("glyphs.doubleDoor"),
        airlock: t("glyphs.airlock"),
        stairUp: t("glyphs.stairUp"),
        stairDown: t("glyphs.stairDown"),
        objective: t("glyphs.objective"),
        terminal: t("glyphs.terminal"),
      },
      credits: t("plateCredits"),
    }),
  );

  return (
    <div className="min-h-screen bg-[#05192A] p-4 print:p-0">
      <div className="mx-auto max-w-[1600px] space-y-3">
        <div className="flex items-center justify-between print:hidden">
          <p className="text-sm text-muted-foreground">{t("plateHint")}</p>
          <PrintButton label={t("platePrint")} />
        </div>

        {/*
          Chaîne produite par `lib/plan-render.ts` à partir de données déjà
          normalisées, et dont chaque texte passe par `esc()`.
        */}
        <div
          className="[&>svg]:h-auto [&>svg]:w-full"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    </div>
  );
}
