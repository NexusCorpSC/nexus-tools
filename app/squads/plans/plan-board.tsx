"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Image as ImageIcon,
  MapPin,
  Play,
  Printer,
  Square as StopIcon,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  inPlanOrder,
  phaseBefore,
  type PlanInk,
  type PlanStroke,
  type PlanView,
  type StrokeDash,
  type StrokeKind,
} from "@/types/plan";
import type { SquadView } from "@/types/squad";
import { planApi } from "./api";
import { BackgroundImport } from "./background-import";
import { BackgroundFromPlace } from "./background-from-place";
import { BriefPanel } from "./brief-panel";
import { PlanCanvas, type Tool } from "./canvas";
import { hueMap } from "./ink";
import { PhaseRail } from "./phase-rail";
import { forStorage } from "./simplify";
import { Toolbar } from "./toolbar";
import { usePlan } from "./use-plan";
import { useUndo } from "./use-undo";

/**
 * The plan de vol, assembled.
 *
 * Three sources of truth meet here and none of them is this component: the plan
 * and the feed come from the stream, the drawing is pulled by delta, and what
 * the reader is *doing* — the phase they are on, the tool in their hand — is
 * the only state that lives here.
 *
 * Following the briefing is one of those: it is a local flag, and taking back
 * control writes nothing and tells nobody. Somebody who steps away from the
 * presenter has not changed the plan.
 */
export function PlanBoard({
  initialPlan,
  initialSquad,
  squadId,
  userId,
}: {
  initialPlan: PlanView;
  initialSquad: SquadView;
  squadId: string | null;
  userId: string;
}) {
  const t = useTranslations("Plans");

  const { view, squad, layers, run, busy, offline, draw, rub, watch } = usePlan(
    initialPlan,
    initialSquad,
    squadId,
  );

  const plan = view.plan;

  const [tool, setTool] = useState<Tool>("pen");
  const [ink, setInk] = useState<PlanInk>("squad");
  const [width, setWidth] = useState(6);
  const [dash, setDash] = useState<StrokeDash>("solid");
  const [ghosting, setGhosting] = useState(true);
  const [picked, setPicked] = useState<string | null>(null);
  /**
   * Whose briefing the reader stepped out of.
   *
   * Held as the presenter rather than as a boolean, so «following» is derived
   * rather than kept in step: a briefing that ends, or one somebody else picks
   * up, is a different briefing and the reader falls in with it again. No
   * effect has to remember to clear anything.
   */
  const [brokeFrom, setBrokeFrom] = useState<string | null>(null);

  const ordered = useMemo(
    () => (plan ? inPlanOrder(plan.phases) : []),
    [plan],
  );

  /**
   * The phase on screen: the presenter's while following, otherwise the one
   * that was picked, otherwise the first.
   */
  const presenter = plan?.presenter ?? null;
  const following = Boolean(presenter) && brokeFrom !== presenter?.userId;

  const currentId =
    (following ? presenter?.phaseId : null) ??
    picked ??
    ordered[0]?.id ??
    "";

  const current = ordered.find((phase) => phase.id === currentId) ?? null;
  const ghost = current ? phaseBefore(ordered, current.id) : null;

  /** Only the phases on screen are pulled — a plan is not loaded whole. */
  useEffect(() => {
    const wanted = [current?.id, ghosting ? ghost?.id : undefined].filter(
      (id): id is string => Boolean(id),
    );

    watch(wanted);
  }, [current?.id, ghost?.id, ghosting, watch]);

  const mySquad = squad.squad;
  const squads = useMemo(
    () => squad.raid?.squads ?? (mySquad ? [mySquad] : []),
    [squad.raid, mySquad],
  );
  const hues = useMemo(() => hueMap(mySquad, squad.raid), [mySquad, squad.raid]);

  const governs = useMemo(() => {
    if (!plan || !mySquad) return false;

    const commands =
      mySquad.leaderId === userId ||
      mySquad.members.some(
        (member) => member.userId === userId && member.lieutenant,
      );

    if (plan.scope === "squad") return commands;

    return commands && squad.raid?.leadSquadId === mySquad.id;
  }, [plan, mySquad, squad.raid, userId]);

  const mayDraw = Boolean(
    plan && (governs || plan.drawPolicy === "all"),
  );
  const editable = Boolean(mayDraw && current && !current.locked);

  /**
   * Called before the early return below, as every hook must be — hence the
   * empty-string defaults. A board with no phase has nothing to take back
   * anyway.
   */
  const { canUndo, canRedo, remember, settle, undo, redo } = useUndo({
    planId: plan?.id ?? "",
    squadId,
    phaseId: current?.id ?? "",
    epoch: current?.epoch ?? 0,
    editable,
    strokes: layers[current?.id ?? ""]?.strokes ?? [],
    draw,
    rub,
  });

  /* ---------------------------------------------------------------- */
  /* Drawing                                                           */
  /* ---------------------------------------------------------------- */

  const onDraw = useCallback(
    async (
      kind: StrokeKind,
      points: number[],
      text: string,
    ): Promise<PlanStroke | null> => {
      if (!plan || !current || !mySquad) return null;

      const stored = forStorage(points, kind === "pen");
      const clientId = crypto.randomUUID().replaceAll("-", "");

      // On screen before the round trip, under an id of its own — the server
      // mints the real one. So the commit's answer is what replaces it: the
      // delta then brings that same id and lands on top of itself rather than
      // beside a twin nobody can rub out.
      const optimistic: PlanStroke = {
        id: `local-${clientId}`,
        phaseId: current.id,
        epoch: current.epoch,
        rev: Number.MAX_SAFE_INTEGER,
        clientId,
        authorId: userId,
        authorName:
          mySquad.members.find((member) => member.userId === userId)?.name ?? "",
        squadId: mySquad.id,
        kind,
        ink,
        width,
        dash,
        points: stored,
        text,
        tokenUserId: "",
        deletedAt: null,
        createdAt: new Date().toISOString(),
      };

      draw(current.id, optimistic);

      // On the stack straight away, under the optimistic id: a Ctrl+Z during
      // the round trip has to be remembered, or the feature is a lie on a
      // hangar wifi. `settle` swaps the id for the server's — or drops the
      // step, if the trace never made it.
      remember({
        act: "draw",
        phaseId: current.id,
        epoch: current.epoch,
        strokeId: optimistic.id,
        stroke: optimistic,
      });

      try {
        const { stroke } = await planApi.commit(plan.id, current.id, squadId, {
          clientId,
          kind,
          ink,
          width,
          dash,
          points: stored,
          text,
        });

        rub(current.id, optimistic.id);
        draw(current.id, stroke);
        settle(current.id, optimistic.id, stroke);

        return stroke;
      } catch (error) {
        rub(current.id, optimistic.id);
        settle(current.id, optimistic.id, null);
        toast.error(t("errorTitle"), {
          description: error instanceof Error ? error.message : undefined,
        });

        return null;
      }
    },
    [
      current,
      dash,
      draw,
      ink,
      mySquad,
      plan,
      remember,
      rub,
      settle,
      squadId,
      t,
      userId,
      width,
    ],
  );

  /** A marker named after it was dropped. Nothing optimistic: the disc is
   *  already there, and the name arrives with the answer. */
  const onRelabel = useCallback(
    async (strokeId: string, text: string) => {
      if (!plan || !current) return;

      try {
        const { stroke } = await planApi.relabel(
          plan.id,
          current.id,
          strokeId,
          squadId,
          text,
        );

        draw(current.id, stroke);
      } catch (error) {
        toast.error(t("errorTitle"), {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [current, draw, plan, squadId, t],
  );

  const onErase = useCallback(
    async (strokeId: string) => {
      if (!plan || !current) return;

      const held = layers[current.id]?.strokes.find(
        (stroke) => stroke.id === strokeId,
      );

      rub(current.id, strokeId);

      // A trace that has not been committed yet has nothing to erase server
      // side; taking it off the screen is the whole of it.
      if (!held || strokeId.startsWith("local-")) return;

      try {
        await planApi.erase(plan.id, current.id, strokeId, squadId);

        // Only your own goes on your stack. A leader rubbing out somebody
        // else's arrow has not made it theirs to bring back — the server would
        // refuse the restore anyway, and offering the button would be a lie.
        if (held.authorId === userId) {
          remember({
            act: "erase",
            phaseId: current.id,
            epoch: current.epoch,
            strokeId,
            stroke: held,
          });
        }
      } catch (error) {
        draw(current.id, held);
        toast.error(t("errorTitle"), {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [current, draw, layers, plan, remember, rub, squadId, t, userId],
  );

  if (!plan || !current) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-[#9ED0FF]/70">
        {t("gone")}
      </div>
    );
  }

  const background = plan.backgroundUrl
    ? {
        url: plan.backgroundUrl,
        width: plan.backgroundW,
        height: plan.backgroundH,
      }
    : null;

  return (
    <div className="flex h-dvh flex-col bg-[#092F49] text-[#CCE7FF]">
      <header className="flex h-13 shrink-0 items-center gap-2 border-b border-[#9ED0FF]/15 bg-[#0B3A5A] px-2 sm:px-3">
        <Button variant="ghost" size="icon-sm" asChild title={t("backToSquad")}>
          <Link href="/squads">
            <span className="sr-only">{t("backToSquad")}</span>
            <ArrowLeft className="size-4" />
          </Link>
        </Button>

        <h1 className="min-w-0 flex-1 truncate text-base font-bold sm:text-lg">
          {plan.name}
        </h1>

        {/*
          D'où vient le sol qu'on dessine. Le dire coûte une ligne et évite la
          question qui revient — « c'est quelle station, ça ? » — et le lien
          rouvre le relevé chez lui, avec ses repères, que le fond n'a pas
          emportés.
        */}
        {plan.backgroundFrom ? (
          <Link
            href={`/lieux/${plan.backgroundFrom.placeSlug}?onglet=plan&plan=${plan.backgroundFrom.planId}`}
            target="_blank"
            title={t("backgroundFromLabel", {
              place: plan.backgroundFrom.placeName,
              plan: plan.backgroundFrom.planName,
            })}
            className="hidden shrink-0 items-center gap-1 text-xs text-[#9ED0FF]/70 underline-offset-2 hover:text-[#CCE7FF] hover:underline sm:flex"
          >
            <MapPin className="size-3.5" />
            <span className="max-w-40 truncate">
              {plan.backgroundFrom.placeName}
            </span>
          </Link>
        ) : null}

        {offline ? (
          <span className="flex items-center gap-1 text-xs text-amber-300" title={t("offline")}>
            <WifiOff className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("offline")}</span>
          </span>
        ) : null}

        {governs ? (
          <>
            <BackgroundImport
              planId={plan.id}
              squadId={squadId}
              hasBackground={Boolean(background)}
              busy={busy}
              onDone={(next) =>
                run(() => planApi.update(plan.id, squadId, { background: next }))
              }
            >
              <ImageIcon />
              <span className="hidden sm:inline">{t("background")}</span>
            </BackgroundImport>

            <BackgroundFromPlace
              busy={busy}
              onPick={(place) =>
                run(() =>
                  planApi.update(plan.id, squadId, { background: { place } }),
                )
              }
            />
          </>
        ) : null}

        <Button variant="secondary" size="sm" asChild>
          <Link href={`/squads/plans/${plan.id}/print`} target="_blank">
            <Printer />
            <span className="hidden sm:inline">{t("print")}</span>
          </Link>
        </Button>

        {governs ? (
          presenter ? (
            <Button
              size="sm"
              disabled={busy}
              className="border border-amber-300/50 bg-amber-300/15 text-amber-300 hover:bg-amber-300/25"
              onClick={() => void run(() => planApi.endBriefing(plan.id, squadId))}
            >
              <StopIcon />
              <span className="hidden sm:inline">{t("endBriefing")}</span>
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(() => planApi.present(plan.id, current.id, squadId))
              }
            >
              <Play />
              <span className="hidden sm:inline">{t("startBriefing")}</span>
            </Button>
          )
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Toolbar
          tool={tool}
          ink={ink}
          width={width}
          dash={dash}
          hues={hues}
          mySquadId={mySquad?.id ?? ""}
          editable={editable}
          canUndo={canUndo}
          canRedo={canRedo}
          onTool={setTool}
          onInk={setInk}
          onWidth={setWidth}
          onDash={setDash}
          onUndo={undo}
          onRedo={redo}
          className="order-last md:order-first md:w-14"
        />

        <div className="relative min-h-0 flex-1">
          <PlanCanvas
            className="absolute inset-0"
            strokes={layers[current.id]?.strokes ?? []}
            ghost={ghosting && ghost ? (layers[ghost.id]?.strokes ?? []) : []}
            background={background}
            tool={tool}
            ink={ink}
            width={width}
            dash={dash}
            hues={hues}
            mySquadId={mySquad?.id ?? ""}
            editable={editable}
            onDraw={onDraw}
            onRelabel={onRelabel}
            onErase={onErase}
          />

          {current.locked ? (
            <Banner tone="amber">{t("frozenNotice")}</Banner>
          ) : !mayDraw ? (
            <Banner tone="plain">{t("readOnlyNotice")}</Banner>
          ) : null}

          {presenter ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
              <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-amber-300/45 bg-[#0B3A5A]/95 px-3 py-2 shadow-lg shadow-black/35">
                <span className="size-2 shrink-0 rounded-full bg-amber-300" />
                <span className="text-[13px]">
                  {following
                    ? t.rich("following", {
                        name: presenter.name,
                        strong: (chunks) => (
                          <strong className="font-semibold">{chunks}</strong>
                        ),
                      })
                    : t("briefingRunning", { name: presenter.name })}
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  className="border-[#9ED0FF]/30"
                  onClick={() => {
                    if (following) setPicked(currentId);
                    setBrokeFrom(following ? (presenter.userId ?? null) : null);
                  }}
                >
                  {following ? t("takeControl") : t("followAgain")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <BriefPanel
          phase={current}
          phases={ordered}
          squads={squads}
          governs={governs}
          busy={busy}
          className="max-h-64 border-t md:max-h-none md:w-72 md:border-l md:border-t-0"
          onSave={(patch) =>
            run(() => planApi.patchPhase(plan.id, current.id, squadId, patch))
          }
          onDuration={(seconds) =>
            void run(() =>
              planApi.patchPhase(plan.id, current.id, squadId, {
                durationSec: seconds,
              }),
            )
          }
        />
      </div>

      <PhaseRail
        phases={ordered}
        currentId={current.id}
        ghosting={ghosting}
        governs={governs}
        busy={busy}
        onPick={(phaseId) => {
          setPicked(phaseId);

          // Stepping the rail while leading the briefing takes everyone along;
          // doing it while following is how you leave.
          if (presenter?.userId === userId) {
            void run(() => planApi.present(plan.id, phaseId, squadId));
          } else if (following && presenter) {
            setBrokeFrom(presenter.userId);
          }
        }}
        onToggleGhost={() => setGhosting((on) => !on)}
        onAdd={(after) =>
          void run(() =>
            planApi.addPhase(plan.id, squadId, after ? { after } : {}),
          )
        }
        onLock={(phaseId, locked) =>
          void run(() =>
            planApi.patchPhase(plan.id, phaseId, squadId, { locked }),
          )
        }
        onDelete={(phaseId) => {
          setPicked(null);
          void run(() => planApi.removePhase(plan.id, phaseId, squadId));
        }}
        onClear={(phaseId) =>
          void run(() => planApi.clearPhase(plan.id, phaseId, squadId))
        }
      />
    </div>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "amber" | "plain";
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-3">
      <span
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs",
          tone === "amber"
            ? "border-amber-300/45 bg-[#0B3A5A]/95 text-amber-300"
            : "border-[#9ED0FF]/25 bg-[#0B3A5A]/95 text-[#9ED0FF]/85",
        )}
      >
        {children}
      </span>
    </div>
  );
}
