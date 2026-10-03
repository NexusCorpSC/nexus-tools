"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarClock, GamepadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlannedTime } from "@/components/planned-time";
import { outlineButton } from "@/app/(auth)/profile/styles";
import {
  formatElapsed,
  PLANNED_SESSION_GRACE_HOURS,
  PRESENCE_ACTIVITY_MAX_LENGTH,
  PRESENCE_ACTIVITY_SUGGESTIONS,
  PRESENCE_TTL_HOURS,
  type MyPresence,
} from "@/types/presence";
import type { MyUpcomingEvent } from "@/types/org-events";

/** The suggestions shown as chips; the rest stay in the field's list. */
const CHIPS = PRESENCE_ACTIVITY_SUGGESTIONS.slice(0, 6);

type Mode = "playing" | "planned" | "off";

function modeOf(presence: MyPresence): Mode {
  return presence.playing ? "playing" : presence.planned ? "planned" : "off";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** «21:00» for an ISO date, in the reader's time zone. */
function toTimeField(iso: string): string {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The next occurrence of «HH:MM»: today, or tomorrow once today's is more than
 * the grace period behind — at 23:30, «01:00» means tonight, not this morning.
 */
function nextOccurrence(time: string): string | null {
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() <= Date.now() - PLANNED_SESSION_GRACE_HOURS * 3_600_000) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString();
}

/**
 * «Ma session»: in game, a planned session, or off — the same declaration as
 * the organization pages and Nexus App, and what friends see.
 *
 * A planned session holds a time and an activity, or picks up an event the
 * player registered to. It shows until an hour past its time, and starting to
 * play consumes it, taking over its activity.
 */
export function PresenceCard({ initial }: { initial: MyPresence }) {
  const t = useTranslations("Profile.Session");

  const [mine, setMine] = useState<MyPresence>(initial);
  const [mode, setMode] = useState<Mode>(() => modeOf(initial));
  const [activity, setActivity] = useState(initial.activity ?? "");
  const [plannedTime, setPlannedTime] = useState("21:00");
  const [plannedActivity, setPlannedActivity] = useState(
    initial.planned?.activity ?? "",
  );
  const [events, setEvents] = useState<MyUpcomingEvent[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The elapsed time moves on while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The time field reads in the browser's time zone, which the server lacks.
  useEffect(() => {
    if (initial.planned) setPlannedTime(toTimeField(initial.planned.at));
  }, [initial.planned]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/events", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((body: { events: MyUpcomingEvent[] }) => {
        if (!cancelled) setEvents(body.events);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function send(
    requests: { url: string; method: "PUT" | "DELETE"; body?: unknown }[],
  ) {
    setPending(true);
    setError(null);
    try {
      let next: MyPresence | null = null;
      for (const request of requests) {
        const response = await fetch(request.url, {
          method: request.method,
          headers: { "Content-Type": "application/json" },
          body:
            request.body === undefined
              ? undefined
              : JSON.stringify(request.body),
        });
        if (!response.ok) throw new Error(String(response.status));
        next = await response.json();
      }
      if (next) {
        setMine(next);
        setActivity(next.activity ?? "");
        setPlannedActivity(next.planned?.activity ?? "");
        if (next.planned) setPlannedTime(toTimeField(next.planned.at));
        setMode(modeOf(next));
      }
      setNow(Date.now());
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  const presenceUrl = "/api/me/presence";
  const plannedUrl = "/api/me/presence/planned";

  function planAt(time: string) {
    const at = nextOccurrence(time);
    if (!at) return;
    void send([
      {
        url: plannedUrl,
        method: "PUT",
        body: { at, activity: plannedActivity },
      },
    ]);
  }

  const status = mine.playing ? "playing" : mine.planned ? "planned" : "off";

  const listId = "profile-presence-activities";
  const field =
    "block h-11 w-full rounded-lg border border-[#9ED0FF]/20 bg-[#061E30]/70 px-3 text-sm text-[#E3F1FF] placeholder:text-[#7FA6C8] focus:border-[#9ED0FF]/60 focus:ring-0";

  return (
    <section className="space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {status === "playing" && mine.since ? (
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-300">
            <span className="size-2 rounded-full bg-emerald-300" />
            {t("playing", { elapsed: formatElapsed(mine.since, now) })}
          </span>
        ) : status === "planned" && mine.planned ? (
          <span className="flex items-center gap-2 text-sm font-medium text-[#F7D2AE]">
            <span className="size-2.5 rounded-full border-2 border-[#F2B880]" />
            {t.rich("plannedAt", {
              time: () => <PlannedTime at={mine.planned!.at} />,
            })}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-[#A9CDEE]">
            <span className="size-2 rounded-full bg-[#9ED0FF]/35" />
            {t("notPlaying")}
          </span>
        )}
      </div>

      <div
        role="radiogroup"
        aria-label={t("modeLabel")}
        className="grid grid-cols-3 gap-1 rounded-xl bg-[#061E30]/70 p-1"
      >
        {(["playing", "planned", "off"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={mode === option}
            onClick={() => setMode(option)}
            className={
              mode === option
                ? "h-10 rounded-lg bg-[#123E60] text-sm font-semibold text-[#E3F1FF]"
                : "h-10 rounded-lg text-sm font-medium text-[#A9CDEE] hover:text-[#E3F1FF]"
            }
          >
            {t(`modes.${option}`)}
          </button>
        ))}
      </div>

      {mode === "playing" ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            // Empty, a new session takes over the planned activity.
            const takeOver = !mine.playing && !activity.trim() && mine.planned;
            void send([
              {
                url: presenceUrl,
                method: "PUT",
                body: takeOver ? {} : { activity },
              },
            ]);
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm text-[#A9CDEE]">{t("activityLabel")}</span>
            <input
              value={activity}
              onChange={(event) => setActivity(event.target.value)}
              maxLength={PRESENCE_ACTIVITY_MAX_LENGTH}
              placeholder={
                !mine.playing && mine.planned?.activity
                  ? mine.planned.activity
                  : t("activityPlaceholder")
              }
              list={listId}
              className={field}
            />
            <datalist id={listId}>
              {PRESENCE_ACTIVITY_SUGGESTIONS.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </label>

          <ActivityChips value={activity} onChange={setActivity} />

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="h-11 flex-1">
              <GamepadIcon />
              {mine.playing ? t("update") : t("start")}
            </Button>
            {mine.playing ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  void send([{ url: presenceUrl, method: "DELETE" }])
                }
                className={`h-11 ${outlineButton}`}
              >
                {t("stop")}
              </Button>
            ) : null}
          </div>
          {mine.playing && mine.planned ? (
            <p className="text-sm text-[#F7D2AE]">
              {t.rich("nextPlanned", {
                time: () => <PlannedTime at={mine.planned!.at} />,
                activity: mine.planned.activity ?? t("noActivity"),
              })}
            </p>
          ) : null}
          <p className="text-xs leading-relaxed text-[#86AED2]">
            {t("hint", { hours: PRESENCE_TTL_HOURS })}
          </p>
        </form>
      ) : mode === "planned" ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            planAt(plannedTime);
          }}
        >
          <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-2">
            <label className="block space-y-1.5">
              <span className="text-sm text-[#A9CDEE]">{t("plannedTime")}</span>
              <input
                type="time"
                required
                value={plannedTime}
                onChange={(event) => setPlannedTime(event.target.value)}
                className={`${field} font-mono`}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm text-[#A9CDEE]">
                {t("plannedActivity")}
              </span>
              <input
                value={plannedActivity}
                onChange={(event) => setPlannedActivity(event.target.value)}
                maxLength={PRESENCE_ACTIVITY_MAX_LENGTH}
                placeholder={t("activityPlaceholder")}
                list={listId}
                className={field}
              />
              <datalist id={listId}>
                {PRESENCE_ACTIVITY_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
            </label>
          </div>

          <ActivityChips
            value={plannedActivity}
            onChange={setPlannedActivity}
          />

          {events.length > 0 ? (
            <div className="space-y-1.5">
              <span className="text-sm text-[#A9CDEE]">{t("fromEvent")}</span>
              {events.map((event) => {
                const picked = mine.planned?.event?.eventId === event.eventId;
                return (
                  <button
                    key={event.eventId}
                    type="button"
                    disabled={pending}
                    aria-pressed={picked}
                    onClick={() =>
                      void send([
                        {
                          url: plannedUrl,
                          method: "PUT",
                          body: {
                            event: {
                              orgId: event.orgId,
                              eventId: event.eventId,
                            },
                          },
                        },
                      ])
                    }
                    className={
                      picked
                        ? "flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-[#9ED0FF] bg-[#9ED0FF]/12 px-3 py-2 text-left text-sm text-[#E3F1FF]"
                        : "flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-[#9ED0FF]/20 px-3 py-2 text-left text-sm text-[#CFE4F7] hover:border-[#9ED0FF]/45"
                    }
                  >
                    <CalendarClock className="size-4 shrink-0 text-[#9ED0FF]" />
                    <span className="min-w-0 flex-1 truncate">
                      {event.title}
                      {event.orgName ? (
                        <span className="text-[#86AED2]">
                          {" "}
                          · {event.orgName}
                        </span>
                      ) : null}
                    </span>
                    <PlannedTime
                      at={event.startsAt}
                      className="shrink-0 rounded-md bg-[#F2B880]/15 px-2 py-0.5 font-mono text-xs text-[#F7D2AE]"
                    />
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="h-11 flex-1">
              <CalendarClock />
              {t("plan")}
            </Button>
            {mine.planned ? (
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  void send([{ url: plannedUrl, method: "DELETE" }])
                }
                className={`h-11 ${outlineButton}`}
              >
                {t("cancelPlanned")}
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-relaxed text-[#86AED2]">
            {t("plannedHint", { hours: PLANNED_SESSION_GRACE_HOURS })}
          </p>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-[#A9CDEE]">
            {mine.playing || mine.planned ? t("offHint") : t("offNow")}
          </p>
          {mine.playing || mine.planned ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                void send([
                  ...(mine.playing
                    ? [{ url: presenceUrl, method: "DELETE" as const }]
                    : []),
                  ...(mine.planned
                    ? [{ url: plannedUrl, method: "DELETE" as const }]
                    : []),
                ])
              }
              className={`h-11 w-full ${outlineButton}`}
            >
              {t("goOff")}
            </Button>
          ) : null}
        </div>
      )}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </section>
  );
}

function ActivityChips({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CHIPS.map((suggestion) => {
        const selected = value === suggestion;
        return (
          <button
            key={suggestion}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(suggestion)}
            className={
              selected
                ? "h-8 rounded-full border border-[#9ED0FF] bg-[#9ED0FF]/15 px-3 text-sm text-[#E3F1FF]"
                : "h-8 rounded-full border border-[#9ED0FF]/20 px-3 text-sm text-[#A9CDEE] hover:border-[#9ED0FF]/45 hover:text-[#E3F1FF]"
            }
          >
            {suggestion}
          </button>
        );
      })}
    </div>
  );
}
