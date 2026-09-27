"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { GamepadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NOT_PLAYING,
  PRESENCE_ACTIVITY_MAX_LENGTH,
  PRESENCE_ACTIVITY_SUGGESTIONS,
  type MyPresence,
  type OrgPresence,
} from "@/types/presence";

/** Often enough to see a teammate arrive, rare enough to cost nothing. */
const REFRESH_MS = 30_000;

/** «depuis 1 h 20», from an ISO date. */
function elapsed(since: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(since)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${String(rest).padStart(2, "0")}` : `${hours} h`;
}

/**
 * Who in the organization is playing right now, and the reader's own
 * declaration — both read and written through the same API Nexus App uses,
 * so a declaration made in either shows in the other.
 */
export function OrgPresenceSection({ orgId }: { orgId: string }) {
  const t = useTranslations("Organizations.Presence");

  const [org, setOrg] = useState<OrgPresence | null>(null);
  const [mine, setMine] = useState<MyPresence>(NOT_PLAYING);
  const [activity, setActivity] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [orgResponse, mineResponse] = await Promise.all([
      fetch(`/api/orgs/${orgId}/presence`, { cache: "no-store" }),
      fetch("/api/me/presence", { cache: "no-store" }),
    ]);
    if (orgResponse.ok) setOrg(await orgResponse.json());
    if (mineResponse.ok) setMine(await mineResponse.json());
    setNow(Date.now());
  }, [orgId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // The field follows the stored activity until the reader starts typing.
  useEffect(() => {
    setActivity(mine.activity ?? "");
  }, [mine.activity]);

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
      setMine(await response.json());
      await refresh();
    } catch {
      setError(t("error"));
    } finally {
      setPending(false);
    }
  }

  const playing = org?.playing ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        {org ? (
          <span className="text-sm text-[#9ED0FF]/60">
            {t("count", { playing: playing.length, total: org.memberCount })}
          </span>
        ) : null}
      </div>

      <form
        className="flex flex-wrap items-center gap-2 rounded-xl border border-[#9ED0FF]/15 bg-[#061E30]/60 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void declare("PUT");
        }}
      >
        <span
          className={
            mine.playing
              ? "flex items-center gap-2 text-sm font-medium text-emerald-300"
              : "flex items-center gap-2 text-sm text-[#9ED0FF]/70"
          }
        >
          <span
            className={
              mine.playing
                ? "size-2 rounded-full bg-emerald-300"
                : "size-2 rounded-full bg-[#9ED0FF]/30"
            }
          />
          {mine.playing ? t("youArePlaying") : t("youAreNotPlaying")}
        </span>

        <label className="min-w-48 flex-1">
          <span className="sr-only">{t("activityLabel")}</span>
          <Input
            value={activity}
            onChange={(event) => setActivity(event.target.value)}
            maxLength={PRESENCE_ACTIVITY_MAX_LENGTH}
            placeholder={t("activityPlaceholder")}
            list={`presence-activities-${orgId}`}
          />
          <datalist id={`presence-activities-${orgId}`}>
            {PRESENCE_ACTIVITY_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </label>

        <Button type="submit" disabled={pending}>
          <GamepadIcon className="size-4" />
          {mine.playing ? t("update") : t("start")}
        </Button>
        {mine.playing ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void declare("DELETE")}
          >
            {t("stop")}
          </Button>
        ) : null}
        {error ? <p className="w-full text-sm text-red-300">{error}</p> : null}
      </form>

      {org && playing.length === 0 ? (
        <p className="text-sm text-[#9ED0FF]/60">{t("nobody")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {playing.map((member) => (
            <li
              key={member.userId}
              className="flex items-center gap-3 rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-3"
            >
              <div className="relative shrink-0">
                {member.avatar ? (
                  <Image
                    src={member.avatar}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 rounded-full"
                  />
                ) : (
                  <div className="flex size-10 items-center justify-center rounded-full bg-[#0B3A5A] text-sm font-semibold text-[#9ED0FF]">
                    {member.name.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[#071E30] bg-emerald-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{member.name}</p>
                <p className="truncate text-xs text-[#9ED0FF]/70">
                  {member.activity ?? t("noActivity")}
                </p>
              </div>
              <span className="shrink-0 text-xs text-[#9ED0FF]/50">
                {elapsed(member.since, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
