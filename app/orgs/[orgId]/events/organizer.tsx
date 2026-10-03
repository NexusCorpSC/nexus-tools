"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft, Download, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  OrgEventRegistration,
  OrgEventRole,
  OrgEventSummary,
  OrgEventView,
} from "@/types/org-events";
import {
  RoleTag,
  errorOf,
  kicker,
  missingFor,
  panel,
  primaryButton,
  roleById,
  useCountdown,
  useDuration,
  useFormats,
  useNow,
} from "./shared";

/** Une cellule CSV : entre guillemets dès qu'elle contient un séparateur. */
function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Ce que lit l'organisateur : les chiffres, la répartition par rôle face aux
 * places souhaitées, les réponses filtrables par rôle, et les désinscrits à
 * part — gardés, hors des comptes.
 */
export function OrganizerSummary({
  event,
  summary,
  squad,
}: {
  event: OrgEventView;
  summary: OrgEventSummary;
  /** L'escouade déjà tirée de l'évènement, si elle existe encore. */
  squad: EventSquad | null;
}) {
  const t = useTranslations("OrgEvents.Summary");
  const now = useNow();
  const countdown = useCountdown();
  const duration = useDuration();
  const { shortDay, time, stamp } = useFormats();
  const [filter, setFilter] = useState<string | null>(null);

  const noRole = summary.roleCounts[""] ?? 0;
  const filled = event.roles.filter((role) =>
    role.wanted === null
      ? (summary.roleCounts[role.id] ?? 0) > 0
      : missingFor(role, summary.roleCounts) === 0,
  );
  const empty = event.roles.filter((role) => !summary.roleCounts[role.id]);
  const status = now === null ? null : countdown(event, now);
  const untilStart = now === null ? 0 : Date.parse(event.startsAt) - now;

  const shown =
    filter === null
      ? summary.registrations
      : summary.registrations.filter((registration) =>
          filter === ""
            ? !roleById(event.roles, registration.role)
            : registration.role === filter,
        );

  function roleLabel(registration: OrgEventRegistration): string {
    return roleById(event.roles, registration.role)?.label ?? "";
  }

  function exportCsv() {
    const header = [
      t("member"),
      ...(event.roles.length > 0 ? [t("role")] : []),
      ...event.questions.map((question) => question.label),
      t("registeredAt"),
      t("status"),
    ];
    const rows = [
      ...summary.registrations.map((registration) => ({
        registration,
        status: t("active"),
      })),
      ...summary.withdrawn.map((registration) => ({
        registration,
        status: t("withdrawnStatus"),
      })),
    ].map(({ registration, status }) => [
      registration.name,
      ...(event.roles.length > 0 ? [roleLabel(registration)] : []),
      ...event.questions.map(
        (question) => registration.answers[question.id] ?? "",
      ),
      registration.registeredAt,
      status,
    ]);
    // Point-virgule et BOM : ce qu'un tableur français ouvre sans question.
    const csv =
      "﻿" +
      [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.title.replace(/[^\p{L}\p{N}]+/gu, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const maxBar = Math.max(
    1,
    ...event.roles.map((role) =>
      Math.max(role.wanted ?? 0, summary.roleCounts[role.id] ?? 0),
    ),
    noRole,
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Link
            href={`/orgs/${event.orgId}/events/${event.id}`}
            className="inline-flex items-center gap-1.5 text-sm text-[#9ED0FF] hover:text-[#CFE8FF]"
          >
            <ArrowLeft className="size-4" />
            {event.title}
            {now === null
              ? null
              : ` · ${shortDay.format(new Date(event.startsAt))}, ${time.format(new Date(event.startsAt))}`}
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {squad === null && summary.registrationCount > 0 ? (
            <Button asChild className={primaryButton}>
              <a href="#escouade">
                <Users className="size-4" />
                {t("createSquad")}
              </a>
            </Button>
          ) : null}
          <Button
            variant="outline"
            onClick={exportCsv}
            disabled={
              summary.registrations.length + summary.withdrawn.length === 0
            }
          >
            <Download className="size-4" />
            {t("exportCsv")}
          </Button>
        </div>
      </header>

      <section
        aria-label={t("figures")}
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
      >
        <Kpi value={String(summary.registrationCount)} label={t("kpiActive")} />
        {event.roles.length > 0 ? (
          <Kpi
            value={`${filled.length} / ${event.roles.length}`}
            label={
              empty.length > 0
                ? t("kpiRolesNobody", {
                    roles: empty.map((role) => role.label).join(", "),
                  })
                : t("kpiRoles")
            }
          />
        ) : null}
        <Kpi
          value={String(summary.withdrawn.length)}
          label={t("kpiWithdrawn")}
        />
        <Kpi
          value={
            status === null
              ? "\u00a0"
              : status.state === "soon" && untilStart < 24 * 3_600_000
                ? duration(untilStart)
                : status.label
          }
          label={
            status?.state === "soon" && untilStart < 24 * 3_600_000
              ? t("kpiBeforeStart")
              : t("kpiNow")
          }
          small
        />
      </section>

      {event.roles.length > 0 ? (
        <section className={cn(panel, "space-y-4 p-5")}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold">{t("byRole")}</h2>
            <span className="text-sm text-white/60">{t("barsLegend")}</span>
          </div>
          <div className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-x-4 gap-y-3">
            {[...event.roles, ...(noRole > 0 ? [null] : [])].map((role) => (
              <RoleBar
                key={role?.id ?? ""}
                role={role}
                count={role ? (summary.roleCounts[role.id] ?? 0) : noRole}
                max={maxBar}
                missing={role ? missingFor(role, summary.roleCounts) : 0}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className={cn(panel, "space-y-4 p-5")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("answers")}</h2>
          {event.roles.length > 0 && summary.registrations.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <FilterPill
                pressed={filter === null}
                onClick={() => setFilter(null)}
              >
                {t("all", { count: summary.registrationCount })}
              </FilterPill>
              {event.roles
                .filter((role) => summary.roleCounts[role.id])
                .map((role) => (
                  <FilterPill
                    key={role.id}
                    pressed={filter === role.id}
                    onClick={() => setFilter(role.id)}
                  >
                    {role.label} · {summary.roleCounts[role.id]}
                  </FilterPill>
                ))}
              {noRole > 0 ? (
                <FilterPill
                  pressed={filter === ""}
                  onClick={() => setFilter("")}
                >
                  {t("noRole")} · {noRole}
                </FilterPill>
              ) : null}
            </div>
          ) : null}
        </div>

        {summary.registrations.length === 0 ? (
          <p className="text-sm text-white/70">{t("empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className={kicker}>
                  <th className="pb-2 pr-4 font-semibold">{t("member")}</th>
                  {event.roles.length > 0 ? (
                    <th className="pb-2 pr-4 font-semibold">{t("role")}</th>
                  ) : null}
                  {event.questions.map((question) => (
                    <th key={question.id} className="pb-2 pr-4 font-semibold">
                      {question.label}
                    </th>
                  ))}
                  <th className="pb-2 font-semibold">{t("registeredAt")}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((registration) => (
                  <tr
                    key={registration.userId}
                    className="border-t border-[#9ED0FF]/10 align-top"
                  >
                    <td className="py-2.5 pr-4 font-medium">
                      {registration.name}
                    </td>
                    {event.roles.length > 0 ? (
                      <td className="py-2.5 pr-4">
                        <RoleTag
                          role={roleById(event.roles, registration.role)}
                        />
                      </td>
                    ) : null}
                    {event.questions.map((question) => (
                      <td
                        key={question.id}
                        className="whitespace-pre-wrap py-2.5 pr-4 text-white/85"
                      >
                        {registration.answers[question.id] ?? (
                          <span className="text-white/40">—</span>
                        )}
                      </td>
                    ))}
                    <td className="py-2.5 font-mono text-xs text-white/65">
                      {now === null
                        ? null
                        : stamp.format(new Date(registration.registeredAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {summary.withdrawn.length > 0 ? (
          <details className="rounded-xl bg-[#071A2B]/60 px-4 py-3 text-sm">
            <summary className="cursor-pointer text-white/75">
              {t("withdrawn", { count: summary.withdrawn.length })}
            </summary>
            <ul className="mt-2 space-y-1 text-white/65">
              {summary.withdrawn.map((registration) => {
                const details = [
                  roleLabel(registration),
                  ...event.questions
                    .map((question) => registration.answers[question.id])
                    .filter(Boolean),
                ].filter(Boolean);
                return (
                  <li key={registration.userId}>
                    <span className="text-white/85">{registration.name}</span>
                    {details.length > 0 ? ` (${details.join(", ")})` : null}
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </section>

      {summary.registrationCount > 0 || squad ? (
        <SquadCard event={event} summary={summary} initial={squad} />
      ) : null}
    </div>
  );
}

type EventSquad = { id: string; name: string; code: string };

/** Tirer l'escouade de l'évènement, ou dire laquelle l'a été. */
function SquadCard({
  event,
  summary,
  initial,
}: {
  event: OrgEventView;
  summary: OrgEventSummary;
  initial: EventSquad | null;
}) {
  const t = useTranslations("OrgEvents.Summary");
  const [squad, setSquad] = useState(initial);
  const [squadCount, setSquadCount] = useState(1);
  const [leftOut, setLeftOut] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roles = event.roles.map((role) => role.label);
  const people = summary.registrationCount;

  async function create() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/orgs/${event.orgId}/events/${event.id}/squad`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error(await errorOf(response));
      const body: {
        squad: EventSquad;
        squadCount: number;
        leftOut: number;
      } = await response.json();
      setSquad(body.squad);
      setSquadCount(body.squadCount);
      setLeftOut(body.leftOut);
    } catch (failure) {
      setError(
        t("squadError", {
          message: failure instanceof Error ? failure.message : "?",
        }),
      );
    } finally {
      setPending(false);
    }
  }

  if (squad) {
    return (
      <section
        id="escouade"
        className={cn(
          panel,
          "flex scroll-mt-6 flex-wrap items-center justify-between gap-4 p-5",
        )}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("squadCreated")}</h2>
          <p className="text-sm text-white/70">
            {t("squadCreatedDetail", { name: squad.name, count: squadCount })}{" "}
            <span className="rounded-md bg-[#071A2B] px-2 py-0.5 font-mono text-[#9ED0FF]">
              {squad.code}
            </span>
          </p>
          {leftOut > 0 ? (
            <p className="text-sm text-[#F7D2AE]">
              {t("squadLeftOut", { count: leftOut })}
            </p>
          ) : null}
        </div>
        <Button variant="outline" asChild>
          <Link href="/squads">{t("openSquad")}</Link>
        </Button>
      </section>
    );
  }

  return (
    <section
      id="escouade"
      className="flex scroll-mt-6 flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-[#9ED0FF]/35 p-5"
    >
      <div className="max-w-xl space-y-1">
        <h2 className="text-lg font-semibold">{t("squadTitle")}</h2>
        <p className="text-sm text-white/70">
          {t("squadHint", {
            count: people,
            roles: roles.join(", "),
            hasRoles: roles.length > 0 ? "yes" : "no",
          })}
        </p>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </div>
      <Button
        className={primaryButton}
        disabled={pending}
        onClick={() => void create()}
      >
        <Users className="size-4" />
        {t("createSquad")}
      </Button>
    </section>
  );
}

function Kpi({
  value,
  label,
  small,
}: {
  value: string;
  label: string;
  small?: boolean;
}) {
  return (
    <div className={cn(panel, "flex flex-col gap-1 p-4")}>
      <b className={cn("font-bold", small ? "text-xl" : "text-[28px]")}>
        {value}
      </b>
      <span className="text-sm text-white/65">{label}</span>
    </div>
  );
}

function RoleBar({
  role,
  count,
  max,
  missing,
}: {
  role: OrgEventRole | null;
  count: number;
  max: number;
  missing: number;
}) {
  return (
    <>
      <span className="truncate text-sm">
        <RoleTag role={role} />
      </span>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[#071A2B]">
        {role?.wanted ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full border border-dashed border-[#F2B880]/50"
            style={{ width: `${(role.wanted / max) * 100}%` }}
          />
        ) : null}
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            missing > 0 ? "bg-[#F2B880]" : "bg-[#9ED0FF]",
          )}
          style={{ width: `${(count / max) * 100}%` }}
        />
      </div>
      <b
        className={cn(
          "text-right font-mono text-sm",
          missing > 0 ? "text-[#F7D2AE]" : "",
        )}
      >
        {role && role.wanted !== null ? `${count} / ${role.wanted}` : count}
      </b>
    </>
  );
}

function FilterPill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "h-8 rounded-full border px-3 text-sm",
        pressed
          ? "border-[#9ED0FF] bg-[#9ED0FF]/15 text-white"
          : "border-[#9ED0FF]/20 text-white/75 hover:border-[#9ED0FF]/45",
      )}
    >
      {children}
    </button>
  );
}
