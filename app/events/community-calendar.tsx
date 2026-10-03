"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { CommunityEventOrg, CommunityEventView } from "@/types/org-events";
import {
  DaySection,
  OrgTag,
  isRegistered,
  orgColors,
} from "@/app/orgs/[orgId]/events/calendar";
import {
  dayKey,
  kicker,
  panel,
  primaryButton,
  timeZoneCity,
  useNow,
} from "@/app/orgs/[orgId]/events/shared";

type Tab = "all" | "mine" | "public";

/** La case des organisations dont le lecteur n'est pas membre, dans les filtres. */
const OTHERS = "others";

/** Ce que la page montre d'abord : sept jours, le reste derrière « Afficher la suite ». */
const FIRST_DAYS = 7;

/** Le calendrier ne va pas plus loin que ce que le serveur a chargé (`COMMUNITY_DAYS`). */
const MAX_MONTH_OFFSET = 2;

function startOfDay(date: Date, plusDays = 0): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + plusDays,
  );
}

/**
 * Communauté › Évènements : un mois en miniature à côté de la liste des
 * sorties, rangées par jour, avec les filtres du lecteur connecté.
 *
 * Comme le calendrier d'une orga, tout ce qui est daté se calcule dans le
 * navigateur, dans le fuseau du lecteur.
 */
export function CommunityCalendarView({
  events,
  myOrgs,
  signedIn,
}: {
  events: CommunityEventView[];
  myOrgs: CommunityEventOrg[];
  signedIn: boolean;
}) {
  const t = useTranslations("OrgEvents.Community");
  const tEvents = useTranslations("OrgEvents");
  const tCalendar = useTranslations("OrgEvents.Calendar");
  const now = useNow();

  const [tab, setTab] = useState<Tab>("all");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [onlyRegistered, setOnlyRegistered] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);

  // Les siennes d'abord : leurs couleurs ne se répètent pas.
  const colors = orgColors([
    ...myOrgs.map((org) => org.id),
    ...events.map((event) => event.org.id),
  ]);
  const upcoming =
    now === null
      ? []
      : events
          .filter((event) => Date.parse(event.endsAt) > now)
          .map((event) => ({
            ...event,
            org: { ...event.org, color: colors.get(event.org.id) },
          }));
  const visible = upcoming.filter((event) => {
    if (tab === "mine" && !event.org.isMember) return false;
    if (tab === "public" && event.visibility !== "public") return false;
    if (hidden.has(event.org.isMember ? event.org.id : OTHERS)) return false;
    if (onlyRegistered && !isRegistered(event)) return false;
    return true;
  });

  const weekEnd =
    now === null ? 0 : startOfDay(new Date(now), FIRST_DAYS).getTime();
  const thisWeek = visible.filter(
    (event) => Date.parse(event.startsAt) < weekEnd,
  );
  const listed = showAll || thisWeek.length === 0 ? visible : thisWeek;
  const rest = visible.length - listed.length;

  const groups = new Map<string, (typeof listed)[number][]>();
  for (const event of listed) {
    const key = dayKey(new Date(event.startsAt));
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }

  const otherOrgs = new Set(
    upcoming
      .filter((event) => !event.org.isMember)
      .map((event) => event.org.id),
  );

  function toggle(key: string) {
    setHidden((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function pickDay(key: string) {
    // La liste s'ouvre d'abord en entier : le jour visé peut être au-delà
    // des sept premiers.
    flushSync(() => setShowAll(true));
    document
      .getElementById(`day-${key}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: t("all") },
    { id: "mine", label: t("mine") },
    { id: "public", label: t("public") },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">
            {tEvents("title")}
          </h1>
          <p className="min-h-[1.5em] text-white/70">
            {now === null
              ? null
              : signedIn && thisWeek.length > 0
                ? tCalendar("weekSummaryMember", {
                    count: thisWeek.length,
                    registered: thisWeek.filter(isRegistered).length,
                  })
                : tCalendar("weekSummary", { count: thisWeek.length })}
          </p>
        </div>
        <PlanButton myOrgs={myOrgs} colors={colors} />
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {signedIn && myOrgs.length > 0 ? (
          <div
            role="group"
            aria-label={t("tabs")}
            className="flex gap-1 rounded-xl border border-[#9ED0FF]/15 bg-[#092840]/80 p-1"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex h-9 items-center rounded-lg px-3.5 text-sm font-medium",
                  tab === item.id
                    ? "bg-[#123E60] text-white"
                    : "text-white/70 hover:text-white",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : (
          <span className="text-sm text-white/70">{t("publicOnly")}</span>
        )}
        {now !== null ? (
          <span className="flex items-center gap-1.5 text-sm text-white/65">
            <Clock className="size-3.5" aria-hidden="true" />
            {tCalendar("timeZone", { city: timeZoneCity() })}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <aside className="flex w-full flex-col gap-4 lg:w-[300px]">
          <button
            type="button"
            aria-expanded={panelOpen}
            onClick={() => setPanelOpen((open) => !open)}
            className="flex h-11 items-center justify-between rounded-lg border border-[#9ED0FF]/30 px-4 text-sm font-medium lg:hidden"
          >
            {signedIn && myOrgs.length > 0 ? t("monthAndFilters") : t("month")}
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                panelOpen && "rotate-180",
              )}
            />
          </button>
          <div
            className={cn(
              "flex-col gap-4",
              panelOpen ? "flex" : "hidden lg:flex",
            )}
          >
            {now !== null ? (
              <MonthCalendar
                now={now}
                offset={monthOffset}
                onOffset={setMonthOffset}
                events={visible}
                onPick={pickDay}
              />
            ) : null}
            {signedIn && myOrgs.length > 0 ? (
              <section className={cn(panel, "flex flex-col gap-1 p-4")}>
                <h2 className={cn(kicker, "mb-2")}>{t("orgsTitle")}</h2>
                {myOrgs.map((org) => (
                  <FilterBox
                    key={org.id}
                    checked={!hidden.has(org.id)}
                    onChange={() => toggle(org.id)}
                  >
                    <OrgTag org={{ ...org, color: colors.get(org.id) }} />
                    <span className="flex-1">{org.name}</span>
                  </FilterBox>
                ))}
                {otherOrgs.size > 0 ? (
                  <FilterBox
                    checked={!hidden.has(OTHERS)}
                    onChange={() => toggle(OTHERS)}
                  >
                    <span className="inline-flex h-5 min-w-6 items-center justify-center rounded-[5px] bg-[#5F7C96] px-1.5 font-mono text-[10px] font-bold text-[#071A2B]">
                      +{otherOrgs.size}
                    </span>
                    <span className="flex-1">{t("otherOrgs")}</span>
                    <span className="text-xs text-white/60">
                      {t("publicHint")}
                    </span>
                  </FilterBox>
                ) : null}
                <div className="my-2 h-px bg-[#9ED0FF]/12" />
                <FilterBox
                  checked={onlyRegistered}
                  onChange={() => setOnlyRegistered((value) => !value)}
                >
                  {t("onlyRegistered")}
                </FilterBox>
              </section>
            ) : null}
          </div>

          {!signedIn ? (
            <section
              className={cn(
                panel,
                "flex flex-col gap-3 border-[#9ED0FF]/30 bg-[#0B2E4A] p-4",
              )}
            >
              <h2 className="text-base font-semibold">{t("signInTitle")}</h2>
              <p className="text-sm leading-relaxed text-white/75">
                {t("signInText")}
              </p>
              <Button asChild className={cn("h-11", primaryButton)}>
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent("/events")}`}
                >
                  {t("signIn")}
                </Link>
              </Button>
            </section>
          ) : myOrgs.length === 0 ? (
            <section className={cn(panel, "flex flex-col gap-3 p-4")}>
              <h2 className="text-base font-semibold">{t("noOrgTitle")}</h2>
              <p className="text-sm leading-relaxed text-white/75">
                {t("noOrgText")}
              </p>
              <Link
                href="/orgs"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-[#9ED0FF] px-4 text-sm font-semibold text-[#9ED0FF] hover:bg-[#9ED0FF]/10"
              >
                {t("findOrg")}
              </Link>
            </section>
          ) : null}
        </aside>

        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-6">
          {now === null ? null : visible.length === 0 ? (
            <section className={cn(panel, "space-y-2 p-6")}>
              <h2 className="text-lg font-semibold">
                {upcoming.length > 0
                  ? t("noMatchTitle")
                  : signedIn
                    ? t("noneTitle")
                    : t("nonePublicTitle")}
              </h2>
              <p className="text-sm text-white/70">
                {upcoming.length > 0
                  ? t("noMatchText")
                  : signedIn
                    ? t("noneText")
                    : t("nonePublicText")}
              </p>
            </section>
          ) : (
            [...groups].map(([key, dayEvents]) => (
              <DaySection
                key={key}
                id={`day-${key}`}
                date={new Date(dayEvents[0].startsAt)}
                now={now}
                events={dayEvents}
              />
            ))
          )}
          {rest > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="h-11 self-center rounded-lg border border-[#9ED0FF]/30 px-5 text-[15px] font-medium hover:border-[#9ED0FF]/60"
            >
              {t("showMore", { count: rest })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function FilterBox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="size-4 accent-[#9ED0FF]"
      />
      {children}
    </label>
  );
}

/** « Prévoir un évènement » : directement dans sa seule orga, sinon on choisit laquelle. */
function PlanButton({
  myOrgs,
  colors,
}: {
  myOrgs: CommunityEventOrg[];
  colors: Map<string, string>;
}) {
  const t = useTranslations("OrgEvents");
  if (myOrgs.length === 0) return null;

  const label = (
    <>
      <Plus className="size-4" />
      {t("plan")}
    </>
  );

  if (myOrgs.length === 1) {
    return (
      <Button asChild className={cn("h-11 px-5", primaryButton)}>
        <Link href={`/orgs/${myOrgs[0].id}/events/new`}>{label}</Link>
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button className={cn("h-11 px-5", primaryButton)}>
          {label}
          <ChevronDown className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="px-2 pt-1 pb-2 text-xs text-white/65">
          {t("Community.planFor")}
        </p>
        {myOrgs.map((org) => (
          <Link
            key={org.id}
            href={`/orgs/${org.id}/events/new`}
            className="flex min-h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-[#9ED0FF]/10"
          >
            <OrgTag org={{ ...org, color: colors.get(org.id) }} />
            {org.name}
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Le mois en miniature : un point par organisation qui sort ce jour-là ;
 * cliquer un jour déroule la liste jusqu'à lui.
 */
function MonthCalendar({
  now,
  offset,
  onOffset,
  events,
  onPick,
}: {
  now: number;
  offset: number;
  onOffset: (offset: number) => void;
  events: (CommunityEventView & { org: { color?: string } })[];
  onPick: (key: string) => void;
}) {
  const t = useTranslations("OrgEvents.Community");
  const locale = useLocale();
  const today = new Date(now);
  const month = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const monthLabel = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(month);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "narrow" });
  const dayLabel = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Les semaines commencent le lundi.
  const lead = (month.getDay() + 6) % 7;
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - lead);
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cellCount = Math.ceil((lead + daysInMonth) / 7) * 7;
  const cells = Array.from(
    { length: cellCount },
    (_, index) =>
      new Date(first.getFullYear(), first.getMonth(), first.getDate() + index),
  );

  const colorsByDay = new Map<string, string[]>();
  const countByDay = new Map<string, number>();
  for (const event of events) {
    const key = dayKey(new Date(event.startsAt));
    const colors = colorsByDay.get(key) ?? [];
    const color = event.org.color ?? "#9ED0FF";
    if (!colors.includes(color)) colors.push(color);
    colorsByDay.set(key, colors);
    countByDay.set(key, (countByDay.get(key) ?? 0) + 1);
  }

  const todayKey = dayKey(today);
  const todayStart = startOfDay(today).getTime();

  return (
    <section
      aria-label={monthLabel}
      className={cn(panel, "flex flex-col gap-3 p-4")}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={t("previousMonth")}
          disabled={offset === 0}
          onClick={() => onOffset(offset - 1)}
          className="flex size-9 items-center justify-center rounded-lg border border-[#9ED0FF]/20 text-[#9ED0FF] disabled:text-white/30"
        >
          <ChevronLeft className="size-4" />
        </button>
        <h2 className="text-base font-semibold first-letter:uppercase">
          {monthLabel}
        </h2>
        <button
          type="button"
          aria-label={t("nextMonth")}
          disabled={offset === MAX_MONTH_OFFSET}
          onClick={() => onOffset(offset + 1)}
          className="flex size-9 items-center justify-center rounded-lg border border-[#9ED0FF]/20 text-[#9ED0FF] disabled:text-white/30"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {cells.slice(0, 7).map((day) => (
          <span
            key={`h-${day.getDay()}`}
            className="py-1 text-[11px] font-semibold uppercase text-white/55"
          >
            {weekday.format(day)}
          </span>
        ))}
        {cells.map((day) => {
          const key = dayKey(day);
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === todayKey;
          const past = day.getTime() < todayStart;
          const colors = inMonth ? (colorsByDay.get(key) ?? []) : [];
          const count = inMonth ? (countByDay.get(key) ?? 0) : 0;
          const content = (
            <>
              <span>{day.getDate()}</span>
              <span className="flex h-1.5 gap-0.5" aria-hidden="true">
                {colors.slice(0, 3).map((color) => (
                  <span
                    key={color}
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: isToday ? "#06233A" : color }}
                  />
                ))}
              </span>
            </>
          );
          const className = cn(
            "flex h-10 flex-col items-center justify-center gap-0.5 rounded-lg text-[13px]",
            !inMonth && "text-white/25",
            inMonth && past && "text-white/45",
            isToday && "bg-[#9ED0FF] font-bold text-[#06233A]",
          );
          return count > 0 ? (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-label={t("dayEvents", { day: dayLabel.format(day), count })}
              className={cn(className, !isToday && "hover:bg-[#9ED0FF]/10")}
            >
              {content}
            </button>
          ) : (
            <div key={key} className={className}>
              {content}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-white/60">{t("monthHint")}</p>
    </section>
  );
}
