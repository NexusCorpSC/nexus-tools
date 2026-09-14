import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth";
import { getPlan, strokesSince } from "@/lib/plans";
import { currentSquadView } from "@/lib/squad-view";
import {
  formatClock,
  inPlanOrder,
  PLAN_GRID,
  phaseStartSec,
} from "@/types/plan";
import { Trace } from "../../canvas";
import { hueMap } from "../../ink";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Plan de vol — feuille de briefing",
  robots: { index: false, follow: false },
};

/**
 * The plan on paper, one phase per page.
 *
 * This is also the PDF. A browser's «Enregistrer en PDF» produces vector
 * output, keeps the accents, and costs nothing — where a PDF writer would be
 * sixty lines of byte-offset cross-reference table to get wrong, and would
 * rasterise the drawing on the way.
 *
 * Everything is read here, phases and strokes both: a sheet is printed once and
 * read on paper, so there is nothing to synchronise and no reason to pull it by
 * delta.
 */
export default async function PrintPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ squad?: string }>;
}) {
  const { planId } = await params;
  const { squad: named } = await searchParams;
  const t = await getTranslations("Plans");

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect(`/login?from=${encodeURIComponent(`/squads/plans/${planId}/print`)}`);
  }

  const squadId = named?.trim() || null;

  const [plan, squad] = await Promise.all([
    getPlan(planId),
    currentSquadView(session.user.id, squadId),
  ]);

  const belongs =
    plan &&
    (plan.scope === "raid"
      ? squad.raid?.id === plan.ownerId
      : squad.squad?.id === plan.ownerId);

  if (!plan || !belongs) notFound();

  const ordered = inPlanOrder(plan.phases);
  const hues = hueMap(squad.squad, squad.raid);

  const sheets = await Promise.all(
    ordered.map(async (phase) => ({
      phase,
      strokes: await strokesSince(plan.id, phase.id, phase.epoch, 0),
    })),
  );

  const background = plan.backgroundUrl
    ? {
        url: plan.backgroundUrl,
        width: plan.backgroundW,
        height: plan.backgroundH,
      }
    : null;

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-slate-900 print:p-0">
      <style>{`
        @page { size: A4 portrait; margin: 12mm; }
        @media print {
          html, body { background: #fff; }
          .sheet { break-after: page; }
          .sheet:last-child { break-after: auto; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
        <p className="text-sm text-slate-600">{t("printHint")}</p>
        <PrintButton label={t("print")} />
      </div>

      {sheets.map(({ phase, strokes }, index) => (
        <section key={phase.id} className="sheet mb-10">
          <header className="mb-3 flex items-baseline justify-between gap-4 border-b border-slate-300 pb-2">
            <h1 className="text-xl font-bold">
              {index + 1}. {phase.name}
            </h1>
            <p className="font-mono text-sm text-slate-500">
              {formatClock(phaseStartSec(ordered, phase.id))}
              {phase.durationSec > 0
                ? ` · ${Math.round(phase.durationSec / 60)} min`
                : ""}
            </p>
          </header>

          <svg
            viewBox={`0 0 ${PLAN_GRID} ${PLAN_GRID}`}
            className="mb-4 w-full rounded border border-slate-300 bg-[#061E30]"
          >
            {background ? (
              <image
                href={background.url}
                x={fit(background).x}
                y={fit(background).y}
                width={fit(background).width}
                height={fit(background).height}
                preserveAspectRatio="none"
              />
            ) : null}

            {strokes.map((stroke) => (
              <Trace key={stroke.id} stroke={stroke} hues={hues} />
            ))}
          </svg>

          {phase.objective ? (
            <p className="mb-3 whitespace-pre-wrap text-[13px] leading-relaxed">
              {phase.objective}
            </p>
          ) : null}

          {phase.points.length > 0 ? (
            <>
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("points")}
              </h2>
              <ul className="mb-3 list-disc pl-5 text-[13px] leading-snug">
                {phase.points.map((point, at) => (
                  <li key={`${at}-${point}`}>{point}</li>
                ))}
              </ul>
            </>
          ) : null}

          {phase.abort ? (
            <>
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("abort")}
              </h2>
              <p className="mb-3 border-l-2 border-red-400 pl-3 text-[13px] leading-snug">
                {phase.abort}
              </p>
            </>
          ) : null}

          {phase.assignments.length > 0 ? (
            <>
              <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("assignments")}
              </h2>
              <ul className="text-[13px] leading-snug">
                {phase.assignments.map((assignment) => (
                  <li key={assignment.userId}>
                    <strong className="font-semibold">{assignment.name}</strong>
                    {" — "}
                    {assignment.task}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** The background, fitted inside the square grid — the canvas's own rule. */
function fit(background: { width: number; height: number }) {
  const ratio = background.width / background.height;

  const width = ratio >= 1 ? PLAN_GRID : PLAN_GRID * ratio;
  const height = ratio >= 1 ? PLAN_GRID / ratio : PLAN_GRID;

  return {
    x: (PLAN_GRID - width) / 2,
    y: (PLAN_GRID - height) / 2,
    width,
    height,
  };
}
