import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getPlan, planFeedFor } from "@/lib/plans";
import { currentSquadView } from "@/lib/squad-view";
import { PlanBoard } from "../plan-board";

export const metadata: Metadata = {
  title: "Plan de vol",
  description:
    "Le canvas de briefing de votre escouade : le plan phase par phase, dessiné à plusieurs et synchronisé en direct.",
};

/**
 * The plan, on the site.
 *
 * The first view is rendered here — the plan, the feed around it and the squad
 * it belongs to — so the phases are on screen before the stream opens.
 * Everything after that is the client's, against the same routes the desktop
 * overlay calls.
 *
 * The drawing is *not* fetched here on purpose: it is pulled by delta, per
 * phase, and only for the phases actually on screen. A plan of ten phases is
 * never loaded whole.
 */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ squad?: string }>;
}) {
  const { planId } = await params;
  const { squad: named } = await searchParams;

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect(`/login?from=${encodeURIComponent(`/squads/plans/${planId}`)}`);
  }

  const userId = session.user.id;
  const squadId = named?.trim() || null;

  const [plan, squad, feed] = await Promise.all([
    getPlan(planId),
    currentSquadView(userId, squadId),
    planFeedFor(userId, squadId),
  ]);

  // Whether a plan the reader has no business with exists is not their concern.
  const belongs =
    plan &&
    (plan.scope === "raid"
      ? squad.raid?.id === plan.ownerId
      : squad.squad?.id === plan.ownerId);

  if (!plan || !belongs) notFound();

  return (
    <PlanBoard
      initialPlan={{ feed, plan }}
      initialSquad={squad}
      squadId={squad.squad?.id ?? null}
      userId={userId}
    />
  );
}
