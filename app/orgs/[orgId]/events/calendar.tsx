"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoleIcon } from "@/app/squads/role-icon";
import { cn } from "@/lib/utils";
import type { OrgEventView } from "@/types/org-events";
import {
  Avatar,
  Chip,
  MissingChips,
  VisibilityChip,
  dayKey,
  daysBetween,
  kicker,
  primaryButton,
  roleById,
  timeZoneCity,
  useFormats,
  useNow,
} from "./shared";

export type CalendarView = "upcoming" | "mine" | "past";

function isRegistered(event: OrgEventView): boolean {
  return !!event.myRegistration && !event.myRegistration.withdrawn;
}

/**
 * Le calendrier d'une organisation : l'en-tête et ses chiffres de la semaine,
 * les onglets, la bande des sept prochains jours, puis les évènements rangés
 * par jour.
 *
 * Tout ce qui est daté se calcule dans le navigateur, dans le fuseau du
 * lecteur : un évènement à 23 h à Paris tombe le lendemain à Tokyo.
 */
export function EventCalendar({
  orgId,
  events,
  view,
  isMember,
}: {
  orgId: string;
  events: OrgEventView[];
  view: CalendarView;
  isMember: boolean;
}) {
  const t = useTranslations("OrgEvents.Calendar");
  const tEvents = useTranslations("OrgEvents");
  const now = useNow();

  const week =
    now === null
      ? []
      : Array.from({ length: 7 }, (_, offset) => {
          const day = new Date(now);
          day.setDate(day.getDate() + offset);
          return day;
        });
  const weekEnd =
    week.length > 0
      ? new Date(
          week[6].getFullYear(),
          week[6].getMonth(),
          week[6].getDate() + 1,
        ).getTime()
      : 0;
  const thisWeek = events.filter(
    (event) =>
      now !== null &&
      Date.parse(event.endsAt) > now &&
      Date.parse(event.startsAt) < weekEnd,
  );

  const shown = view === "mine" ? events.filter(isRegistered) : events;
  const groups = new Map<string, OrgEventView[]>();
  if (now !== null) {
    for (const event of shown) {
      const key = dayKey(new Date(event.startsAt));
      groups.set(key, [...(groups.get(key) ?? []), event]);
    }
  }

  const tabs: { view: CalendarView; label: string }[] = [
    { view: "upcoming", label: t("upcoming") },
    ...(isMember ? [{ view: "mine" as const, label: t("mine") }] : []),
    { view: "past", label: t("past") },
  ];

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">
            {tEvents("title")}
          </h1>
          <p className="min-h-[1.5em] text-white/70">
            {now === null
              ? null
              : isMember && thisWeek.length > 0
                ? t("weekSummaryMember", {
                    count: thisWeek.length,
                    registered: thisWeek.filter(isRegistered).length,
                  })
                : t("weekSummary", { count: thisWeek.length })}
          </p>
        </div>
        {isMember ? (
          <Button asChild className={cn("h-11 px-5", primaryButton)}>
            <Link href={`/orgs/${orgId}/events/new`}>
              <Plus className="size-4" />
              {tEvents("plan")}
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label={t("filter")}
          className="flex gap-1 rounded-xl border border-[#9ED0FF]/15 bg-[#092840]/80 p-1"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.view}
              href={
                tab.view === "upcoming"
                  ? `/orgs/${orgId}/events`
                  : `/orgs/${orgId}/events?view=${tab.view}`
              }
              aria-current={view === tab.view ? "page" : undefined}
              className={cn(
                "flex h-9 items-center rounded-lg px-3.5 text-sm font-medium",
                view === tab.view
                  ? "bg-[#123E60] text-white"
                  : "text-white/70 hover:text-white",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {now !== null ? (
          <span className="flex items-center gap-1.5 text-sm text-white/65">
            <Clock className="size-3.5" aria-hidden="true" />
            {t("timeZone", { city: timeZoneCity() })}
          </span>
        ) : null}
      </div>

      {view !== "past" && week.length > 0 ? (
        <WeekStrip week={week} events={shown} />
      ) : null}

      {now === null ? null : groups.size === 0 ? (
        <p className="text-white/70">
          {view === "past"
            ? t("nonePast")
            : view === "mine"
              ? t("noneMine")
              : tEvents("none")}
        </p>
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
    </div>
  );
}

function WeekStrip({ week, events }: { week: Date[]; events: OrgEventView[] }) {
  const t = useTranslations("OrgEvents.Calendar");
  const { shortDay } = useFormats();
  const weekday = new Intl.DateTimeFormat(shortDay.resolvedOptions().locale, {
    weekday: "short",
  });
  const counts = new Map<string, number>();
  for (const event of events) {
    const key = dayKey(new Date(event.startsAt));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <section
      aria-label={t("week")}
      className="grid grid-cols-7 gap-1.5 sm:gap-2"
    >
      {week.map((day, index) => {
        const key = dayKey(day);
        const count = counts.get(key) ?? 0;
        const today = index === 0;
        const content = (
          <>
            <span
              className={cn(
                "text-[11px] font-semibold uppercase sm:text-xs",
                today ? "" : "text-white/65",
              )}
            >
              {weekday.format(day)}
            </span>
            <span className="text-lg font-bold sm:text-2xl">
              {day.getDate()}
            </span>
            <span
              className={cn(
                "hidden text-xs sm:block",
                today ? "" : count > 0 ? "text-[#9ED0FF]" : "text-white/50",
              )}
            >
              {count > 0 ? t("outings", { count }) : "—"}
            </span>
            {count > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "size-1.5 rounded-full sm:hidden",
                  today ? "bg-[#06233A]" : "bg-[#9ED0FF]",
                )}
              />
            ) : null}
          </>
        );
        const className = cn(
          "flex flex-col gap-1 rounded-xl p-2 sm:p-2.5",
          today
            ? "bg-[#9ED0FF] text-[#06233A]"
            : "border border-[#9ED0FF]/15 bg-[#092840]/75",
          count > 0 && !today && "hover:border-[#9ED0FF]/45",
        );
        return count > 0 ? (
          <a key={key} href={`#day-${key}`} className={className}>
            {content}
          </a>
        ) : (
          <div key={key} className={className}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

function DaySection({
  id,
  date,
  now,
  events,
}: {
  id: string;
  date: Date;
  now: number;
  events: OrgEventView[];
}) {
  const t = useTranslations("OrgEvents.Calendar");
  const { day } = useFormats();
  const offset = daysBetween(new Date(now), date);
  const formatted = day.format(date);
  const label = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  const relative =
    offset === 0
      ? t("today")
      : offset === 1
        ? t("tomorrow")
        : offset === -1
          ? t("yesterday")
          : null;

  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className={kicker}>
        {relative ? `${relative} · ${formatted}` : label}
      </h2>
      {events.map((event) => (
        <EventRow key={event.id} event={event} now={now} />
      ))}
    </section>
  );
}

function EventRow({ event, now }: { event: OrgEventView; now: number }) {
  const t = useTranslations("OrgEvents");
  const tCalendar = useTranslations("OrgEvents.Calendar");
  const href = `/orgs/${event.orgId}/events/${event.id}`;
  const mine = event.myRegistration;
  const registered = isRegistered(event);
  const ended = Date.parse(event.endsAt) <= now;
  const live = !ended && Date.parse(event.startsAt) <= now;
  const place = [event.meetingPoint, event.meetingPlace?.name]
    .filter(Boolean)
    .join(", ");
  const myRole = mine ? roleById(event.roles, mine.role) : null;
  const shownFaces = event.participants.slice(0, 4);
  const moreFaces = event.participants.length - shownFaces.length;
  const byRole = event.roles
    .filter((role) => event.roleCounts[role.id])
    .map((role) => `${role.label} ${event.roleCounts[role.id]}`);

  return (
    <article
      className={cn(
        "relative flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[14px] border border-[#9ED0FF]/15 bg-[#092840]/75 px-5 py-4 transition-colors hover:border-[#9ED0FF]/45",
        ended && "opacity-80",
      )}
    >
      <TimeColumn startsAt={event.startsAt} endsAt={event.endsAt} />

      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={href}
            className="text-lg font-semibold text-white after:absolute after:inset-0 after:rounded-[14px] hover:text-[#CFE8FF]"
          >
            {event.title}
          </Link>
          <VisibilityChip visibility={event.visibility} />
          {live ? <Chip tone="live">{t("Time.live")}</Chip> : null}
          {registered ? (
            <Chip tone="registered">
              {myRole ? (
                <RoleIcon icon={myRole.icon} className="size-3" />
              ) : null}
              {myRole
                ? tCalendar("registeredAs", { role: myRole.label })
                : t("youAreRegistered")}
            </Chip>
          ) : null}
          {ended ? null : <MissingChips event={event} />}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
          {place ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5 text-[#9ED0FF]" aria-hidden="true" />
              {place}
            </span>
          ) : null}
          <span>{tCalendar("by", { name: event.createdBy.name })}</span>
        </div>
      </div>

      <div className="flex min-w-[180px] flex-col items-start gap-2 sm:items-end">
        {shownFaces.length > 0 ? (
          <div className="flex pl-2" aria-hidden="true">
            {shownFaces.map((participant) => (
              <Avatar
                key={participant.userId}
                name={participant.name}
                className="-ml-2 border-2 border-[#0A2A44]"
              />
            ))}
            {moreFaces > 0 ? (
              <span className="-ml-2 flex size-7 items-center justify-center rounded-full border-2 border-[#0A2A44] bg-[#123E60] text-[11px] font-semibold">
                +{moreFaces}
              </span>
            ) : null}
          </div>
        ) : null}
        <span className="text-sm text-white/70">
          {event.registrationCount === 0
            ? tCalendar("nobodyYet")
            : [
                t("registrations", { count: event.registrationCount }),
                ...byRole,
              ].join(" · ")}
        </span>
        {event.canRegister && !registered && !ended ? (
          <Link
            href={`${href}#inscription`}
            className="relative z-10 inline-flex h-9 items-center rounded-lg border border-[#9ED0FF] px-3.5 text-sm font-semibold text-[#9ED0FF] hover:bg-[#9ED0FF]/10"
          >
            {t("Registration.register")}
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function TimeColumn({
  startsAt,
  endsAt,
}: {
  startsAt: string;
  endsAt: string;
}) {
  const { time } = useFormats();
  return (
    <div className="flex w-full items-baseline gap-2 font-mono text-[15px] text-[#9ED0FF] sm:w-16 sm:flex-col sm:gap-0.5">
      <span>{time.format(new Date(startsAt))}</span>
      <span className="text-xs text-white/60">
        → {time.format(new Date(endsAt))}
      </span>
    </div>
  );
}
