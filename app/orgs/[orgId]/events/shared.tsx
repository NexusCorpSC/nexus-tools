"use client";

import { useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Lock } from "lucide-react";
import { RoleIcon } from "@/app/squads/role-icon";
import { cn } from "@/lib/utils";
import type {
  OrgEventRole,
  OrgEventView,
  OrgEventVisibility,
} from "@/types/org-events";

/**
 * Ce que partagent les pages d'évènements : les heures dans le fuseau du
 * lecteur, les comptes par rôle, les pastilles.
 */

/** Le bouton principal, sur l'accent du site. */
export const primaryButton =
  "bg-[#9ED0FF] text-[#06233A] hover:bg-[#CFE8FF] font-semibold";

/** Un panneau posé sur le fond de la page. */
export const panel = "rounded-2xl border border-[#9ED0FF]/15 bg-[#092840]/75";

/** Le petit titre en capitales au-dessus d'une valeur. */
export const kicker =
  "text-xs font-semibold uppercase tracking-[0.06em] text-white/65";

/** Le message d'erreur d'une réponse de l'API, ou son statut à défaut. */
export async function errorOf(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // Pas de corps lisible : le statut dira ce qu'il peut.
  }
  return String(response.status);
}

// ─── Temps ────────────────────────────────────────────────────────────────────

const MINUTE = 60_000;

function subscribeMinutes(onChange: () => void) {
  const timer = window.setInterval(onChange, MINUTE);
  return () => window.clearInterval(timer);
}

/** Arrondi à la minute : la valeur reste la même d'un rendu à l'autre. */
function currentMinute(): number {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}

function noMinute(): null {
  return null;
}

/**
 * L'heure du navigateur, rafraîchie chaque minute ; `null` au rendu serveur
 * et à l'hydratation.
 *
 * Le serveur ne connaît pas le fuseau du lecteur : rien de daté ne s'écrit
 * avant que le navigateur ne prenne la main — un rendu serveur en UTC resterait
 * affiché, l'hydratation ne corrige pas un texte qui diffère.
 */
export function useNow(): number | null {
  return useSyncExternalStore(subscribeMinutes, currentMinute, noMinute);
}

/** « Paris » pour Europe/Paris : ce que le lecteur reconnaît de son fuseau. */
export function timeZoneCity(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  return (zone.split("/").pop() ?? zone).replace(/_/g, " ");
}

export function useFormats() {
  const locale = useLocale();
  return {
    time: new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }),
    day: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
    shortDay: new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    stamp: new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

/** Le jour local d'une date, « 2026-10-04 » : la clé des regroupements. */
export function dayKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Le nombre de jours locaux entre deux dates, minuit à minuit. */
export function daysBetween(from: Date, to: Date): number {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/** « 2 h 30 », « 45 min ». */
export function useDuration() {
  const t = useTranslations("OrgEvents.Time");
  return (ms: number) => {
    const minutes = Math.max(0, Math.round(ms / MINUTE));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return t("minutes", { minutes: rest });
    if (rest === 0) return t("hours", { hours });
    return t("hoursMinutes", {
      hours,
      minutes: String(rest).padStart(2, "0"),
    });
  };
}

/** Où en est l'évènement : à venir (et dans combien), en cours, terminé. */
export function useCountdown() {
  const t = useTranslations("OrgEvents.Time");
  const duration = useDuration();
  return (event: { startsAt: string; endsAt: string }, now: number) => {
    const start = Date.parse(event.startsAt);
    if (Date.parse(event.endsAt) <= now) {
      return { state: "over" as const, label: t("over") };
    }
    if (start <= now) return { state: "live" as const, label: t("live") };
    const days = daysBetween(new Date(now), new Date(start));
    return {
      state: "soon" as const,
      label:
        start - now < 24 * 3_600_000
          ? t("startsIn", { duration: duration(start - now) })
          : t("startsInDays", { count: days }),
    };
  };
}

/** « 21:00 → 23:30 », dans le fuseau du lecteur. */
export function TimeRange({
  startsAt,
  endsAt,
  className,
}: {
  startsAt: string;
  endsAt: string;
  className?: string;
}) {
  const now = useNow();
  const { time } = useFormats();
  if (now === null) return <span className={className}>&nbsp;</span>;
  return (
    <span className={className}>
      {time.format(new Date(startsAt))} → {time.format(new Date(endsAt))}
    </span>
  );
}

// ─── Rôles ────────────────────────────────────────────────────────────────────

export function roleById(
  roles: OrgEventRole[],
  id: string,
): OrgEventRole | null {
  return roles.find((role) => role.id === id) ?? null;
}

/** « 3 » sans objectif, « 3 / 2 » avec. */
export function roleCount(
  role: OrgEventRole,
  counts: Record<string, number>,
): string {
  const count = counts[role.id] ?? 0;
  return role.wanted === null ? String(count) : `${count} / ${role.wanted}`;
}

/** Combien il en manque pour atteindre l'objectif du rôle, 0 sans objectif. */
export function missingFor(
  role: OrgEventRole,
  counts: Record<string, number>,
): number {
  return role.wanted === null
    ? 0
    : Math.max(0, role.wanted - (counts[role.id] ?? 0));
}

/** Les rôles dont l'objectif n'est pas atteint, et de combien. */
export function missingRoles(
  event: Pick<OrgEventView, "roles" | "roleCounts">,
): { role: OrgEventRole; missing: number }[] {
  return event.roles
    .map((role) => ({ role, missing: missingFor(role, event.roleCounts) }))
    .filter(({ missing }) => missing > 0);
}

export function RoleTag({ role }: { role: OrgEventRole | null }) {
  const t = useTranslations("OrgEvents.Summary");
  return (
    <span className="inline-flex items-center gap-1.5">
      <RoleIcon icon={role?.icon} className="size-3.5 text-[#9ED0FF]" />
      {role?.label ?? t("noRole")}
    </span>
  );
}

// ─── Pastilles ────────────────────────────────────────────────────────────────

export function Chip({
  tone = "default",
  className,
  children,
}: {
  tone?: "default" | "registered" | "missing" | "live";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-[18px]",
        tone === "default" && "border-[#9ED0FF]/30 text-[#BFE0FF]",
        tone === "registered" && "border-[#2E8A5A] bg-[#1D5A3A] text-[#D5F5E3]",
        tone === "missing" && "border-[#F2B880]/50 text-[#F7D2AE]",
        tone === "live" && "border-[#5BD69A]/60 text-[#A8EBC8]",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VisibilityChip({
  visibility,
  orgName,
}: {
  visibility: OrgEventVisibility;
  /** Donné, il précise « Privé · membres de … ». */
  orgName?: string;
}) {
  const t = useTranslations("OrgEvents");
  const Icon = visibility === "public" ? Globe : Lock;
  return (
    <Chip>
      <Icon className="size-3" aria-hidden="true" />
      {visibility === "private" && orgName
        ? t("privateTo", { org: orgName })
        : t(visibility)}
    </Chip>
  );
}

export function MissingChips({
  event,
}: {
  event: Pick<OrgEventView, "roles" | "roleCounts">;
}) {
  const t = useTranslations("OrgEvents");
  return (
    <>
      {missingRoles(event).map(({ role, missing }) => (
        <Chip key={role.id} tone="missing">
          <RoleIcon icon={role.icon} className="size-3" />
          {t("missing", { count: missing, role: role.label })}
        </Chip>
      ))}
    </>
  );
}

// ─── Visages ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#9ED0FF",
  "#F2B880",
  "#B9A7F5",
  "#8FD9B6",
  "#A7D3F5",
  "#F5A7C0",
];

/** Deux lettres et une couleur tirée du nom : le même membre, la même pastille. */
export function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const letters =
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("") || "?";
  const initials = (letters.length > 1 ? letters : name.slice(0, 2))
    .toUpperCase()
    .slice(0, 2);
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#071A2B]",
        className,
      )}
      style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}
    >
      {initials}
    </span>
  );
}
