"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CalendarClock, GamepadIcon } from "lucide-react";
import { PlannedTime } from "@/components/planned-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatElapsed,
  NOT_PLAYING,
  PRESENCE_ACTIVITY_MAX_LENGTH,
  PRESENCE_ACTIVITY_SUGGESTIONS,
  type MemberPlanned,
  type MyPresence,
  type OrgPresence,
} from "@/types/presence";

/**
 * Planned sessions at the same time for the same thing read as one line:
 * «21:00 · Kaelen, Isha, Tarn — Minage sur Nyx».
 */
function groupPlanned(planned: MemberPlanned[]) {
  const groups = new Map<
    string,
    { at: string; members: MemberPlanned[]; head: MemberPlanned }
  >();
  for (const member of planned) {
    const key = `${member.planned.at}|${member.planned.event?.eventId ?? member.planned.activity ?? ""}`;
    const group = groups.get(key);
    if (group) group.members.push(member);
    else
      groups.set(key, {
        at: member.planned.at,
        members: [member],
        head: member,
      });
  }
  return [...groups.values()];
}

/** Often enough to see a teammate arrive, rare enough to cost nothing. */
const REFRESH_MS = 30_000;

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
  const planned = groupPlanned(org?.planned ?? []);

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
        <Link
          href="/profile"
          className="inline-flex items-center gap-1.5 text-sm text-[#9ED0FF] hover:text-[#CFE8FF]"
        >
          <CalendarClock className="size-4" />
          {t("plan")}
        </Link>
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
                {formatElapsed(member.since, now)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {planned.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-lg font-semibold">{t("plannedTitle")}</h3>
            <span className="text-sm text-[#9ED0FF]/60">
              {org?.planned.length}
            </span>
          </div>
          <ul className="space-y-2">
            {planned.map(({ at, members, head }) => (
              <li
                key={`${at}-${head.userId}`}
                className="flex items-center gap-3 rounded-xl border border-[#F2B880]/15 bg-[#071E30]/60 p-3"
              >
                <PlannedTime
                  at={at}
                  className="shrink-0 rounded-md bg-[#F2B880]/15 px-2 py-0.5 font-mono text-sm text-[#F7D2AE]"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {members.map((member) => member.name).join(", ")}
                  </p>
                  {head.planned.event ? (
                    <Link
                      href={`/orgs/${head.planned.event.orgId}/events/${head.planned.event.eventId}`}
                      className="block truncate text-xs text-[#9ED0FF] hover:text-[#CFE8FF]"
                    >
                      {t("plannedEvent", {
                        title:
                          head.planned.activity ?? head.planned.event.title,
                      })}
                    </Link>
                  ) : (
                    <p className="truncate text-xs text-[#9ED0FF]/70">
                      {head.planned.activity ?? t("noPlannedActivity")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
