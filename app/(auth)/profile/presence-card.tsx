"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { GamepadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { outlineButton } from "@/app/(auth)/profile/styles";
import {
  formatElapsed,
  PRESENCE_ACTIVITY_MAX_LENGTH,
  PRESENCE_ACTIVITY_SUGGESTIONS,
  PRESENCE_TTL_HOURS,
  type MyPresence,
} from "@/types/presence";

/** The suggestions shown as chips; the rest stay in the field's list. */
const CHIPS = PRESENCE_ACTIVITY_SUGGESTIONS.slice(0, 6);

/**
 * «Ma session»: declares playing, with an optional activity, or stops. The
 * same declaration as the organization pages and Nexus App — what friends see.
 */
export function PresenceCard({ initial }: { initial: MyPresence }) {
  const t = useTranslations("Profile.Session");

  const [mine, setMine] = useState<MyPresence>(initial);
  const [activity, setActivity] = useState(initial.activity ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // The elapsed time moves on while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  async function declare(method: "PUT" | "DELETE") {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/me/presence", {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "PUT" ? JSON.stringify({ activity }) : undefined,
      });
      if (!response.ok) throw new Error(String(response.status));
      const next: MyPresence = await response.json();
      setMine(next);
      setActivity(next.activity ?? "");
      setNow(Date.now());
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  const listId = "profile-presence-activities";

  return (
    <section className="space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        {mine.playing && mine.since ? (
          <span className="flex items-center gap-2 text-sm font-medium text-emerald-300">
            <span className="size-2 rounded-full bg-emerald-300" />
            {t("playing", { elapsed: formatElapsed(mine.since, now) })}
          </span>
        ) : (
          <span className="flex items-center gap-2 text-sm text-[#A9CDEE]">
            <span className="size-2 rounded-full bg-[#9ED0FF]/35" />
            {t("notPlaying")}
          </span>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void declare("PUT");
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm text-[#A9CDEE]">{t("activityLabel")}</span>
          <input
            value={activity}
            onChange={(event) => setActivity(event.target.value)}
            maxLength={PRESENCE_ACTIVITY_MAX_LENGTH}
            placeholder={t("activityPlaceholder")}
            list={listId}
            className="block h-11 w-full rounded-lg border border-[#9ED0FF]/20 bg-[#061E30]/70 px-3 text-sm text-[#E3F1FF] placeholder:text-[#7FA6C8] focus:border-[#9ED0FF]/60 focus:ring-0"
          />
          <datalist id={listId}>
            {PRESENCE_ACTIVITY_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </label>

        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((suggestion) => {
            const selected = activity === suggestion;
            return (
              <button
                key={suggestion}
                type="button"
                aria-pressed={selected}
                onClick={() => setActivity(suggestion)}
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

        <div className="flex gap-2">
          <Button type="submit" disabled={pending} className="h-11 flex-1">
            <GamepadIcon />
            {mine.playing ? t("update") : t("start")}
          </Button>
          {mine.playing ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => void declare("DELETE")}
              className={`h-11 ${outlineButton}`}
            >
              {t("stop")}
            </Button>
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </form>

      <p className="text-xs leading-relaxed text-[#86AED2]">
        {t("hint", { hours: PRESENCE_TTL_HOURS })}
      </p>
    </section>
  );
}
