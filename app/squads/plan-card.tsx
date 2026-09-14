"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Layers, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatClock,
  planDurationSec,
  type PlanSummary,
} from "@/types/plan";

/**
 * The way into the plan de vol, from the squad the briefing is for.
 *
 * One card above the rosters rather than a page of its own: a plan belongs to
 * the squad on screen, and asking somebody to navigate somewhere else to find
 * their own briefing is how a feature goes unused.
 *
 * Whoever does not command still sees it — reading the plan is the point, and
 * only starting one takes a rank.
 */
export function PlanCard({
  plans,
  squadId,
  governs,
  onCreate,
}: {
  plans: PlanSummary[];
  squadId: string | null;
  governs: boolean;
  onCreate: () => Promise<boolean>;
}) {
  const t = useTranslations("Plans");
  const [starting, setStarting] = useState(false);

  const suffix = squadId ? `?squad=${encodeURIComponent(squadId)}` : "";

  if (plans.length === 0) {
    if (!governs) return null;

    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[#9ED0FF]/22 bg-[#061E30]/50 px-3.5 py-3">
        <Layers className="size-5 shrink-0 text-[#9ED0FF]/70" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm text-[#9ED0FF]/80">
          {t("noPlan")}
        </p>
        <Button
          size="sm"
          disabled={starting}
          onClick={async () => {
            setStarting(true);
            await onCreate();
            setStarting(false);
          }}
        >
          {starting ? <Loader2 className="animate-spin" /> : <Plus />}
          {t("startPlan")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#9ED0FF]/22 bg-[#061E30]/50 px-3.5 py-3">
      {plans.map((plan) => (
        <div key={plan.id} className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Layers
                className="size-5 shrink-0 text-[#9ED0FF]/70"
                aria-hidden="true"
              />
              <p className="min-w-0 truncate text-[15px] font-semibold">
                {plan.name}
              </p>
              {plan.presenter ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  <span className="size-1.5 rounded-full bg-amber-300" />
                  {t("briefingLive")}
                </span>
              ) : null}
            </div>

            <div className="mt-2 flex items-center gap-1.5">
              {plan.phases.slice(0, 6).map((phase, index) => (
                <span
                  key={phase.id}
                  title={phase.name}
                  className={cn(
                    "flex h-7 items-center rounded-md border px-2 font-mono text-[10px]",
                    plan.presenter?.phaseId === phase.id
                      ? "border-amber-300/45 bg-amber-300/12 text-amber-300"
                      : "border-[#9ED0FF]/18 bg-[#061E30]/60 text-[#9ED0FF]/60",
                  )}
                >
                  {index + 1}
                </span>
              ))}
              <p className="ml-1 min-w-0 truncate text-xs text-[#9ED0FF]/60">
                {t("phaseCount", { count: plan.phases.length })}
                {planDurationSec(plan.phases) > 0
                  ? ` · ${formatClock(planDurationSec(plan.phases))}`
                  : ""}
              </p>
            </div>
          </div>

          <Button size="sm" asChild>
            <Link href={`/squads/plans/${plan.id}${suffix}`}>
              {t("openPlan")}
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
      ))}
    </div>
  );
}
