"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Lock, Globe, MapPin, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlacePicker } from "@/app/lieux/place-picker";
import { RoleIcon } from "@/app/squads/role-icon";
import { cn } from "@/lib/utils";
import { SQUAD_ROLE_ICON_GROUPS, type SquadRoleIcon } from "@/types/squad";
import {
  ORG_EVENT_ANSWER_MAX_LENGTH,
  ORG_EVENT_DESCRIPTION_MAX_LENGTH,
  ORG_EVENT_MAX_QUESTIONS,
  ORG_EVENT_MAX_REGISTRATIONS,
  ORG_EVENT_MAX_ROLES,
  ORG_EVENT_MEETING_POINT_MAX_LENGTH,
  ORG_EVENT_QUESTION_MAX_LENGTH,
  ORG_EVENT_ROLE_LABEL_MAX_LENGTH,
  ORG_EVENT_TITLE_MAX_LENGTH,
  type OrgEvent,
  type OrgEventInput,
  type OrgEventRole,
  type OrgEventSummary,
  type OrgEventView,
  type OrgEventVisibility,
} from "@/types/org-events";

/** Le message d'erreur d'une réponse de l'API, ou son statut à défaut. */
async function errorOf(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;
  } catch {
    // Pas de corps lisible : le statut dira ce qu'il peut.
  }
  return String(response.status);
}

// ─── Dates ────────────────────────────────────────────────────────────────────

/** `false` au rendu serveur et à l'hydratation, `true` ensuite. */
function useInBrowser(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

function noSubscription() {
  return () => {};
}

/**
 * « samedi 4 octobre, 19:00 – 22:00 », dans le fuseau du lecteur.
 *
 * Le serveur ne connaît pas ce fuseau : rien n'est écrit avant que le
 * navigateur ne prenne la main — un rendu serveur en UTC resterait affiché,
 * l'hydratation ne corrige pas un texte qui diffère.
 */
export function EventTime({
  startsAt,
  endsAt,
  className,
}: {
  startsAt: string;
  endsAt: string;
  className?: string;
}) {
  const locale = useLocale();
  const inBrowser = useInBrowser();
  if (!inBrowser) return <span className={className}>&nbsp;</span>;

  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const day = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const sameDay = start.toDateString() === end.toDateString();

  return (
    <span className={className}>
      {day.format(start)}, {time.format(start)} –{" "}
      {sameDay ? "" : `${day.format(end)}, `}
      {time.format(end)}
    </span>
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Une date ISO en jour et heure locaux, pour les champs du formulaire. */
function toLocalFields(iso: string): { day: string; time: string } {
  const date = new Date(iso);
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/**
 * Le jour et les deux heures du formulaire, en deux dates ISO. Une fin avant
 * le début tombe le lendemain : une session de 21 h à 1 h n'a pas à demander
 * deux jours.
 */
function toRange(
  day: string,
  start: string,
  end: string,
): { startsAt: string; endsAt: string } | null {
  if (!day || !start || !end) return null;
  const startsAt = new Date(`${day}T${start}`);
  const endsAt = new Date(`${day}T${end}`);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null;
  }
  if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

// ─── Places souhaitées ────────────────────────────────────────────────────────

/** « 3 » sans objectif, « 3 / 2 » avec. */
function roleCount(role: OrgEventRole, counts: Record<string, number>): string {
  const count = counts[role.id] ?? 0;
  return role.wanted === null ? String(count) : `${count} / ${role.wanted}`;
}

/** Les rôles dont l'objectif n'est pas atteint, et de combien. */
function missingRoles(
  event: Pick<OrgEventView, "roles" | "roleCounts">,
): { role: OrgEventRole; missing: number }[] {
  return event.roles
    .map((role) => ({
      role,
      missing:
        role.wanted === null
          ? 0
          : role.wanted - (event.roleCounts[role.id] ?? 0),
    }))
    .filter(({ missing }) => missing > 0);
}

function MissingChips({
  event,
}: {
  event: Pick<OrgEventView, "roles" | "roleCounts">;
}) {
  const t = useTranslations("OrgEvents");
  return (
    <>
      {missingRoles(event).map(({ role, missing }) => (
        <span
          key={role.id}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300/50 px-2 py-0.5 text-xs text-amber-200"
        >
          <RoleIcon icon={role.icon} className="size-3" />
          {t("missing", { count: missing, role: role.label })}
        </span>
      ))}
    </>
  );
}

// ─── Liste ────────────────────────────────────────────────────────────────────

export function VisibilityBadge({
  visibility,
}: {
  visibility: OrgEventVisibility;
}) {
  const t = useTranslations("OrgEvents");
  const Icon = visibility === "public" ? Globe : Lock;

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/20 px-2 py-0.5 text-xs text-[#9ED0FF]">
      <Icon className="size-3" aria-hidden="true" />
      {t(visibility)}
    </span>
  );
}

export function EventCard({ event }: { event: OrgEventView }) {
  const t = useTranslations("OrgEvents");

  return (
    <Link
      href={`/orgs/${event.orgId}/events/${event.id}`}
      className="block rounded-xl border border-[#9ED0FF]/15 bg-black/20 p-4 transition-colors hover:border-[#9ED0FF]/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{event.title}</h3>
        <VisibilityBadge visibility={event.visibility} />
        {event.myRegistration && !event.myRegistration.withdrawn ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">
            {t("youAreRegistered")}
          </span>
        ) : null}
        <MissingChips event={event} />
      </div>
      <EventTime
        startsAt={event.startsAt}
        endsAt={event.endsAt}
        className="mt-1 block text-sm text-[#9ED0FF]"
      />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/70">
        {event.meetingPoint || event.meetingPlace ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden="true" />
            {[event.meetingPoint, event.meetingPlace?.name]
              .filter(Boolean)
              .join(" · ")}
          </span>
        ) : null}
        <span>{t("registrations", { count: event.registrationCount })}</span>
      </div>
    </Link>
  );
}

// ─── Formulaire ───────────────────────────────────────────────────────────────

type RoleDraft = {
  key: string;
  id?: string;
  label: string;
  icon: SquadRoleIcon;
  /** Tel que saisi : vide pour « pas d'objectif ». */
  wanted: string;
};
type QuestionDraft = {
  key: string;
  id?: string;
  label: string;
  required: boolean;
};

let draftKey = 0;
function nextKey(): string {
  draftKey += 1;
  return `draft-${draftKey}`;
}

function IconChoice({
  value,
  onChange,
}: {
  value: SquadRoleIcon;
  onChange: (icon: SquadRoleIcon) => void;
}) {
  const t = useTranslations("OrgEvents.Form");
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={t("chooseIcon")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <RoleIcon icon={value} />
      </Button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 space-y-2 rounded-lg border border-[#9ED0FF]/20 bg-[#0B3A5A] p-2 shadow-xl">
          {SQUAD_ROLE_ICON_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-wrap gap-1">
              {group.icons.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  aria-label={icon}
                  aria-pressed={icon === value}
                  className={cn(
                    "rounded p-1.5 hover:bg-white/10",
                    icon === value && "bg-white/20",
                  )}
                  onClick={() => {
                    onChange(icon);
                    setOpen(false);
                  }}
                >
                  <RoleIcon icon={icon} />
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Crée un évènement, ou modifie celui qu'on lui donne.
 *
 * Rendu une fois monté seulement : les heures se lisent dans le fuseau du
 * navigateur, que le rendu serveur ne connaît pas.
 */
export function EventForm({
  orgId,
  initial,
}: {
  orgId: string;
  initial?: OrgEvent;
}) {
  const t = useTranslations("OrgEvents.Form");
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [meetingPoint, setMeetingPoint] = useState(initial?.meetingPoint ?? "");
  const [meetingPlace, setMeetingPlace] = useState(
    initial?.meetingPlace ?? null,
  );
  const [visibility, setVisibility] = useState<OrgEventVisibility>(
    initial?.visibility ?? "private",
  );
  const [roles, setRoles] = useState<RoleDraft[]>(
    () =>
      initial?.roles.map((role) => ({
        ...role,
        key: role.id,
        wanted: role.wanted === null ? "" : String(role.wanted),
      })) ?? [],
  );
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    () =>
      initial?.questions.map((question) => ({
        ...question,
        key: question.id,
      })) ?? [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) {
      const from = toLocalFields(initial.startsAt);
      setDay(from.day);
      setStart(from.time);
      setEnd(toLocalFields(initial.endsAt).time);
    } else {
      // Ce soir, 21 h – 23 h : un point de départ, pas une suggestion.
      setDay(toLocalFields(new Date().toISOString()).day);
      setStart("21:00");
      setEnd("23:00");
    }
    setMounted(true);
  }, [initial]);

  if (!mounted) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const range = toRange(day, start, end);
    if (!range) return;

    const body: OrgEventInput = {
      title,
      description,
      ...range,
      meetingPoint,
      meetingPlaceSlug: meetingPlace?.slug ?? null,
      visibility,
      roles: roles.map(({ id, label, icon, wanted }) => ({
        id,
        label,
        icon,
        wanted: wanted.trim() ? Number(wanted) : null,
      })),
      questions: questions.map(({ id, label, required }) => ({
        id,
        label,
        required,
      })),
    };

    setPending(true);
    setError(null);
    try {
      const response = await fetch(
        initial
          ? `/api/orgs/${orgId}/events/${initial.id}`
          : `/api/orgs/${orgId}/events`,
        {
          method: initial ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!response.ok) throw new Error(await errorOf(response));
      const saved: OrgEventView = await response.json();
      router.push(`/orgs/${orgId}/events/${saved.id}`);
      router.refresh();
    } catch (failure) {
      setError(
        t("error", {
          message: failure instanceof Error ? failure.message : "?",
        }),
      );
      setPending(false);
    }
  }

  const labelClass = "block text-sm font-medium mb-1";

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <label className={labelClass} htmlFor="event-title">
          {t("title")}
        </label>
        <Input
          id="event-title"
          required
          value={title}
          maxLength={ORG_EVENT_TITLE_MAX_LENGTH}
          placeholder={t("titlePlaceholder")}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="event-day">
            {t("day")}
          </label>
          <Input
            id="event-day"
            type="date"
            required
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="event-start">
            {t("start")}
          </label>
          <Input
            id="event-start"
            type="time"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="event-end">
            {t("end")}
          </label>
          <Input
            id="event-end"
            type="time"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
        <p className="text-xs text-white/60 sm:col-span-3">{t("endHint")}</p>
      </div>

      <div>
        <label className={labelClass} htmlFor="event-description">
          {t("description")}
        </label>
        <Textarea
          id="event-description"
          rows={4}
          value={description}
          maxLength={ORG_EVENT_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor="event-meeting-point">
            {t("meetingPoint")}
          </label>
          <Input
            id="event-meeting-point"
            value={meetingPoint}
            maxLength={ORG_EVENT_MEETING_POINT_MAX_LENGTH}
            placeholder={t("meetingPointPlaceholder")}
            onChange={(event) => setMeetingPoint(event.target.value)}
          />
        </div>
        <div>
          <span className={labelClass}>{t("meetingPlace")}</span>
          <PlacePicker
            value={meetingPlace?.slug}
            valueLabel={meetingPlace?.name}
            onChange={(place) =>
              setMeetingPlace(
                place ? { slug: place.slug, name: place.name } : null,
              )
            }
          />
        </div>
      </div>

      <fieldset>
        <legend className={labelClass}>{t("visibility")}</legend>
        <div className="space-y-1">
          {(["private", "public"] as const).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                value={option}
                checked={visibility === option}
                onChange={() => setVisibility(option)}
              />
              {option === "private"
                ? t("visibilityPrivate")
                : t("visibilityPublic")}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={labelClass}>{t("roles")}</legend>
        <p className="text-xs text-white/60">{t("rolesHint")}</p>
        {roles.map((role, index) => (
          <div key={role.key} className="flex items-center gap-2">
            <IconChoice
              value={role.icon}
              onChange={(icon) =>
                setRoles((current) =>
                  current.map((candidate, at) =>
                    at === index ? { ...candidate, icon } : candidate,
                  ),
                )
              }
            />
            <Input
              required
              aria-label={t("roleLabel")}
              placeholder={t("roleLabel")}
              value={role.label}
              maxLength={ORG_EVENT_ROLE_LABEL_MAX_LENGTH}
              onChange={(event) =>
                setRoles((current) =>
                  current.map((candidate, at) =>
                    at === index
                      ? { ...candidate, label: event.target.value }
                      : candidate,
                  ),
                )
              }
            />
            <Input
              type="number"
              min={1}
              max={ORG_EVENT_MAX_REGISTRATIONS}
              step={1}
              className="w-28 shrink-0"
              aria-label={t("wanted")}
              title={t("wanted")}
              placeholder={t("wantedPlaceholder")}
              value={role.wanted}
              onChange={(event) =>
                setRoles((current) =>
                  current.map((candidate, at) =>
                    at === index
                      ? { ...candidate, wanted: event.target.value }
                      : candidate,
                  ),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("remove")}
              onClick={() =>
                setRoles((current) => current.filter((_, at) => at !== index))
              }
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        {roles.length < ORG_EVENT_MAX_ROLES ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setRoles((current) => [
                ...current,
                { key: nextKey(), label: "", icon: "crosshair", wanted: "" },
              ])
            }
          >
            <Plus className="size-4" />
            {t("addRole")}
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className={labelClass}>{t("questions")}</legend>
        <p className="text-xs text-white/60">{t("questionsHint")}</p>
        {questions.map((question, index) => (
          <div key={question.key} className="flex items-center gap-2">
            <Input
              required
              aria-label={t("questionLabel")}
              placeholder={t("questionLabel")}
              value={question.label}
              maxLength={ORG_EVENT_QUESTION_MAX_LENGTH}
              onChange={(event) =>
                setQuestions((current) =>
                  current.map((candidate, at) =>
                    at === index
                      ? { ...candidate, label: event.target.value }
                      : candidate,
                  ),
                )
              }
            />
            <label className="flex shrink-0 items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={question.required}
                onChange={(event) =>
                  setQuestions((current) =>
                    current.map((candidate, at) =>
                      at === index
                        ? { ...candidate, required: event.target.checked }
                        : candidate,
                    ),
                  )
                }
              />
              {t("required")}
            </label>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t("remove")}
              onClick={() =>
                setQuestions((current) =>
                  current.filter((_, at) => at !== index),
                )
              }
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
        {questions.length < ORG_EVENT_MAX_QUESTIONS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setQuestions((current) => [
                ...current,
                { key: nextKey(), label: "", required: false },
              ])
            }
          >
            <Plus className="size-4" />
            {t("addQuestion")}
          </Button>
        ) : null}
      </fieldset>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {initial ? t("save") : t("create")}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

// ─── Fiche ────────────────────────────────────────────────────────────────────

function roleById(roles: OrgEventRole[], id: string): OrgEventRole | null {
  return roles.find((role) => role.id === id) ?? null;
}

function RoleTag({ role }: { role: OrgEventRole | null }) {
  const t = useTranslations("OrgEvents.Summary");
  return (
    <span className="inline-flex items-center gap-1">
      <RoleIcon icon={role?.icon} className="size-3.5" />
      {role?.label ?? t("noRole")}
    </span>
  );
}

/** S'inscrire, modifier son inscription, ou se désinscrire. */
function RegistrationForm({
  event,
  onChange,
}: {
  event: OrgEventView;
  onChange: (view: OrgEventView) => void;
}) {
  const t = useTranslations("OrgEvents.Registration");
  const mine = event.myRegistration;
  const active = !!mine && !mine.withdrawn;

  const [role, setRole] = useState(mine?.role ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(
    mine?.answers ?? {},
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(method: "PUT" | "DELETE") {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/orgs/${event.orgId}/events/${event.id}/registration`,
        {
          method,
          headers: { "Content-Type": "application/json" },
          body:
            method === "PUT" ? JSON.stringify({ role, answers }) : undefined,
        },
      );
      if (!response.ok) throw new Error(await errorOf(response));
      onChange(await response.json());
      if (method === "PUT") setMessage(t("saved"));
    } catch (failure) {
      setError(
        t("error", {
          message: failure instanceof Error ? failure.message : "?",
        }),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        void send("PUT");
      }}
    >
      {mine?.withdrawn ? (
        <p className="text-sm text-white/70">{t("withdrawn")}</p>
      ) : null}

      {event.roles.length > 0 ? (
        <fieldset>
          <legend className="mb-1 text-sm font-medium">{t("role")}</legend>
          <div className="flex flex-wrap gap-2">
            {event.roles.map((candidate) => (
              <label
                key={candidate.id}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm",
                  role === candidate.id
                    ? "border-[#9ED0FF] bg-[#9ED0FF]/15"
                    : "border-[#9ED0FF]/20",
                )}
              >
                <input
                  type="radio"
                  name="role"
                  required
                  className="sr-only"
                  value={candidate.id}
                  checked={role === candidate.id}
                  onChange={() => setRole(candidate.id)}
                />
                <RoleIcon icon={candidate.icon} className="size-3.5" />
                {candidate.label}
                <span className="text-xs text-white/60">
                  {roleCount(candidate, event.roleCounts)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {event.questions.map((question) => (
        <div key={question.id}>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor={`answer-${question.id}`}
          >
            {question.label}
            {question.required ? (
              <span className="ml-1 text-xs text-white/60">
                ({t("required")})
              </span>
            ) : null}
          </label>
          <Textarea
            id={`answer-${question.id}`}
            rows={2}
            required={question.required}
            maxLength={ORG_EVENT_ANSWER_MAX_LENGTH}
            value={answers[question.id] ?? ""}
            onChange={(changed) =>
              setAnswers((current) => ({
                ...current,
                [question.id]: changed.target.value,
              }))
            }
          />
        </div>
      ))}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {active ? t("update") : mine ? t("reRegister") : t("register")}
        </Button>
        {active ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => void send("DELETE")}
          >
            {t("withdraw")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Ce que lit l'organisateur, rechargé quand l'évènement change. */
function OrganizerSummary({ event }: { event: OrgEventView }) {
  const t = useTranslations("OrgEvents.Summary");
  const [summary, setSummary] = useState<OrgEventSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/orgs/${event.orgId}/events/${event.id}/summary`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const loaded: OrgEventSummary = await response.json();
        if (!cancelled) setSummary(loaded);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [event.orgId, event.id, event.updatedAt]);

  if (failed) return <p className="text-sm text-red-300">{t("error")}</p>;
  if (!summary) return null;

  const counted = [
    ...event.roles.map((role) => ({
      role: role as OrgEventRole | null,
      count: roleCount(role, summary.roleCounts),
    })),
    ...(summary.roleCounts[""]
      ? [{ role: null, count: String(summary.roleCounts[""]) }]
      : []),
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold">{t("title")}</h2>

      {event.roles.length > 0 ? (
        <div>
          <h3 className="mb-1 text-sm font-medium">{t("byRole")}</h3>
          <ul className="flex flex-wrap gap-3 text-sm">
            {counted.map(({ role, count }) => (
              <li key={role?.id ?? ""} className="flex items-center gap-1">
                <RoleTag role={role} />
                <span className="font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {summary.registrations.length === 0 ? (
        <p className="text-sm text-white/70">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-white/60">
              <tr>
                <th className="py-1 pr-3 font-medium">{t("member")}</th>
                {event.roles.length > 0 ? (
                  <th className="py-1 pr-3 font-medium">{t("role")}</th>
                ) : null}
                {event.questions.map((question) => (
                  <th key={question.id} className="py-1 pr-3 font-medium">
                    {question.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.registrations.map((registration) => (
                <tr
                  key={registration.userId}
                  className="border-t border-[#9ED0FF]/10 align-top"
                >
                  <td className="py-1.5 pr-3 font-medium">
                    {registration.name}
                  </td>
                  {event.roles.length > 0 ? (
                    <td className="py-1.5 pr-3">
                      <RoleTag
                        role={roleById(event.roles, registration.role)}
                      />
                    </td>
                  ) : null}
                  {event.questions.map((question) => (
                    <td
                      key={question.id}
                      className="whitespace-pre-wrap py-1.5 pr-3"
                    >
                      {registration.answers[question.id] ?? "—"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary.withdrawn.length > 0 ? (
        <p className="text-xs text-white/60">
          {t("withdrawn", { count: summary.withdrawn.length })} :{" "}
          {summary.withdrawn
            .map((registration) => registration.name)
            .join(", ")}
        </p>
      ) : null}
    </section>
  );
}

export function EventDetail({
  initial,
  signedIn,
}: {
  initial: OrgEventView;
  signedIn: boolean;
}) {
  const t = useTranslations("OrgEvents");
  const tRegistration = useTranslations("OrgEvents.Registration");
  const router = useRouter();
  const [event, setEvent] = useState(initial);
  const [deleteError, setDeleteError] = useState(false);
  // Lu une fois : la page n'a pas à basculer d'elle-même à la fin de
  // l'évènement, l'API refuse de toute façon une inscription tardive.
  const [now] = useState(() => Date.now());

  const ended = Date.parse(event.endsAt) <= now;

  async function remove() {
    if (!window.confirm(t("deleteConfirm"))) return;
    setDeleteError(false);
    const response = await fetch(
      `/api/orgs/${event.orgId}/events/${event.id}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      setDeleteError(true);
      return;
    }
    router.push(`/orgs/${event.orgId}/events`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{event.title}</h1>
            <VisibilityBadge visibility={event.visibility} />
          </div>
          <EventTime
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            className="block text-[#9ED0FF]"
          />
          {event.meetingPoint || event.meetingPlace ? (
            <p className="flex items-center gap-1 text-sm">
              <MapPin className="size-4" aria-hidden="true" />
              <span className="font-medium">{t("meetingPoint")} :</span>
              {event.meetingPoint}
              {event.meetingPlace ? (
                <>
                  {event.meetingPoint ? " · " : null}
                  <Link
                    href={`/lieux/${event.meetingPlace.slug}`}
                    className="underline"
                  >
                    {event.meetingPlace.name}
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}
          <p className="text-sm text-white/60">
            {t("organizer", { name: event.createdBy.name })}
          </p>
        </div>

        {event.canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/orgs/${event.orgId}/events/${event.id}/edit`}>
                {t("edit")}
              </Link>
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              <Trash2 className="size-4" />
              {t("delete")}
            </Button>
          </div>
        ) : null}
      </div>

      {deleteError ? (
        <p className="text-sm text-red-300">{t("deleteError")}</p>
      ) : null}

      {event.description ? (
        <p className="whitespace-pre-wrap">{event.description}</p>
      ) : null}

      <section className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-black/20 p-4">
        <h2 className="text-xl font-semibold">{tRegistration("title")}</h2>
        {ended ? (
          <p className="text-sm text-white/70">{t("ended")}</p>
        ) : event.canRegister ? (
          <RegistrationForm event={event} onChange={setEvent} />
        ) : (
          <p className="text-sm text-white/70">
            {signedIn ? t("membersOnly") : tRegistration("signIn")}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">
          {t("participants")}{" "}
          <span className="text-base font-normal text-white/60">
            ({t("registrations", { count: event.registrationCount })})
          </span>
        </h2>
        {event.roles.length > 0 ? (
          <ul className="flex flex-wrap gap-3 text-sm">
            {event.roles.map((role) => (
              <li key={role.id} className="flex items-center gap-1">
                <RoleTag role={role} />
                <span className="font-semibold">
                  {roleCount(role, event.roleCounts)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {event.roles.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            <MissingChips event={event} />
          </div>
        ) : null}
        {event.canRegister ? (
          event.participants.length === 0 ? (
            <p className="text-sm text-white/70">{t("noParticipants")}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {event.participants.map((participant) => (
                <li
                  key={participant.userId}
                  className="flex items-center gap-1.5 rounded-lg border border-[#9ED0FF]/15 px-2.5 py-1 text-sm"
                >
                  {event.roles.length > 0 ? (
                    <RoleIcon
                      icon={roleById(event.roles, participant.role)?.icon}
                      className="size-3.5"
                    />
                  ) : null}
                  {participant.name}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      {event.canManage ? <OrganizerSummary event={event} /> : null}
    </div>
  );
}
