"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Lock, MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PlacePicker } from "@/app/lieux/place-picker";
import { RoleIcon } from "@/app/squads/role-icon";
import { cn } from "@/lib/utils";
import { SQUAD_ROLE_ICON_GROUPS, type SquadRoleIcon } from "@/types/squad";
import {
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
  type OrgEventView,
  type OrgEventVisibility,
} from "@/types/org-events";
import {
  errorOf,
  kicker,
  panel,
  primaryButton,
  timeZoneCity,
  useDuration,
  useFormats,
} from "./shared";

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

/** Les rôles qu'on ajoute d'un clic ; le nom vient des traductions. */
const ROLE_SUGGESTIONS: { key: string; icon: SquadRoleIcon }[] = [
  { key: "pilot", icon: "navigation" },
  { key: "gunner", icon: "crosshair" },
  { key: "escort", icon: "shield" },
  { key: "miner", icon: "hammer" },
  { key: "medic", icon: "cross" },
  { key: "logistics", icon: "box" },
];

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
        className="size-10"
        aria-label={t("chooseIcon")}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <RoleIcon icon={value} className="text-[#9ED0FF]" />
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

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(panel, "space-y-4 p-5")}>
      <div className="flex items-center gap-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#9ED0FF]/15 text-sm font-bold text-[#9ED0FF]">
          {number}
        </span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * Crée un évènement, ou modifie celui qu'on lui donne : quatre étapes, et à
 * côté l'aperçu de la ligne qu'il fera dans le calendrier.
 *
 * Rendu une fois monté seulement : les heures se lisent dans le fuseau du
 * navigateur, que le rendu serveur ne connaît pas.
 */
export function EventForm({
  orgId,
  orgName,
  initial,
}: {
  orgId: string;
  orgName: string;
  initial?: OrgEvent;
}) {
  const t = useTranslations("OrgEvents.Form");
  const tEvents = useTranslations("OrgEvents");
  const router = useRouter();
  const duration = useDuration();
  const { shortDay, time } = useFormats();
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

  const range = toRange(day, start, end);

  function updateRole(index: number, change: Partial<RoleDraft>) {
    setRoles((current) =>
      current.map((candidate, at) =>
        at === index ? { ...candidate, ...change } : candidate,
      ),
    );
  }

  function updateQuestion(index: number, change: Partial<QuestionDraft>) {
    setQuestions((current) =>
      current.map((candidate, at) =>
        at === index ? { ...candidate, ...change } : candidate,
      ),
    );
  }

  function addRole(label: string, icon: SquadRoleIcon) {
    setRoles((current) => [
      ...current,
      { key: nextKey(), label, icon, wanted: "" },
    ]);
  }

  const taken = new Set(
    roles.map((role) => role.label.trim().toLocaleLowerCase()),
  );
  const suggestions = ROLE_SUGGESTIONS.map((suggestion) => ({
    ...suggestion,
    label: t(`suggestions.${suggestion.key}`),
  })).filter((suggestion) => !taken.has(suggestion.label.toLocaleLowerCase()));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
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

  const labelClass = "mb-1.5 block text-sm font-medium";
  const hint = "text-sm text-white/65";
  const field = "h-11 bg-[#071A2B]";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={submit} className="min-w-0 space-y-4">
        <Step number={1} title={t("stepWhat")}>
          <div>
            <label className={labelClass} htmlFor="event-title">
              {t("title")}
            </label>
            <Input
              id="event-title"
              required
              className={field}
              value={title}
              maxLength={ORG_EVENT_TITLE_MAX_LENGTH}
              placeholder={t("titlePlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
            <div className="col-span-2 sm:col-span-1">
              <label className={labelClass} htmlFor="event-day">
                {t("day")}
              </label>
              <Input
                id="event-day"
                type="date"
                required
                className={field}
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
                className={cn(field, "font-mono")}
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
                className={cn(field, "font-mono")}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </div>
          </div>
          <p className={hint}>
            {range
              ? t.rich("durationHint", {
                  duration: duration(
                    Date.parse(range.endsAt) - Date.parse(range.startsAt),
                  ),
                  city: timeZoneCity(),
                  strong: (chunks) => (
                    <strong className="text-white">{chunks}</strong>
                  ),
                })
              : null}{" "}
            {t("endHint")}
          </p>

          <div>
            <label className={labelClass} htmlFor="event-description">
              {t("description")}
            </label>
            <Textarea
              id="event-description"
              rows={4}
              className="bg-[#071A2B]"
              value={description}
              maxLength={ORG_EVENT_DESCRIPTION_MAX_LENGTH}
              placeholder={t("descriptionPlaceholder")}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
        </Step>

        <Step number={2} title={t("stepWhere")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="event-meeting-point">
                {t("meetingPoint")}
              </label>
              <Input
                id="event-meeting-point"
                className={field}
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
        </Step>

        <Step number={3} title={t("stepRegistration")}>
          <fieldset className="space-y-3">
            <div>
              <legend className="text-sm font-medium">{t("roles")}</legend>
              <p className={hint}>{t("rolesHint")}</p>
            </div>
            {roles.length > 0 ? (
              <div className="grid grid-cols-[40px_minmax(0,1fr)_96px_40px] items-center gap-2">
                <span />
                <span className="text-xs text-white/60">{t("roleColumn")}</span>
                <span className="text-xs text-white/60">{t("wanted")}</span>
                <span />
                {roles.map((role, index) => (
                  <div key={role.key} className="contents">
                    <IconChoice
                      value={role.icon}
                      onChange={(icon) => updateRole(index, { icon })}
                    />
                    <Input
                      required
                      className={field}
                      aria-label={t("roleLabel")}
                      value={role.label}
                      maxLength={ORG_EVENT_ROLE_LABEL_MAX_LENGTH}
                      onChange={(event) =>
                        updateRole(index, { label: event.target.value })
                      }
                    />
                    <Input
                      type="number"
                      min={1}
                      max={ORG_EVENT_MAX_REGISTRATIONS}
                      step={1}
                      className={field}
                      aria-label={t("wanted")}
                      placeholder={t("wantedPlaceholder")}
                      value={role.wanted}
                      onChange={(event) =>
                        updateRole(index, { wanted: event.target.value })
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-10"
                      aria-label={t("removeRole")}
                      onClick={() =>
                        setRoles((current) =>
                          current.filter((_, at) => at !== index),
                        )
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : null}
            {roles.length < ORG_EVENT_MAX_ROLES ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-sm text-white/60">{t("add")}</span>
                {suggestions.map((suggestion) => (
                  <SuggestionButton
                    key={suggestion.key}
                    onClick={() => addRole(suggestion.label, suggestion.icon)}
                  >
                    <RoleIcon icon={suggestion.icon} className="size-3.5" />
                    {suggestion.label}
                  </SuggestionButton>
                ))}
                <SuggestionButton onClick={() => addRole("", "star")}>
                  <Plus className="size-3.5" />
                  {t("customRole")}
                </SuggestionButton>
              </div>
            ) : null}
          </fieldset>

          <div className="h-px bg-[#9ED0FF]/10" />

          <fieldset className="space-y-3">
            <div>
              <legend className="text-sm font-medium">{t("questions")}</legend>
              <p className={hint}>{t("questionsHint")}</p>
            </div>
            {questions.map((question, index) => (
              <div key={question.key} className="flex items-center gap-2">
                <Input
                  required
                  className={field}
                  aria-label={t("questionLabel")}
                  placeholder={t("questionPlaceholder")}
                  value={question.label}
                  maxLength={ORG_EVENT_QUESTION_MAX_LENGTH}
                  onChange={(event) =>
                    updateQuestion(index, { label: event.target.value })
                  }
                />
                <label className="flex shrink-0 items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[#9ED0FF]"
                    checked={question.required}
                    onChange={(event) =>
                      updateQuestion(index, { required: event.target.checked })
                    }
                  />
                  {t("required")}
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10"
                  aria-label={t("removeQuestion")}
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
              <SuggestionButton
                onClick={() =>
                  setQuestions((current) => [
                    ...current,
                    { key: nextKey(), label: "", required: false },
                  ])
                }
              >
                <Plus className="size-3.5" />
                {t("addQuestion")}
              </SuggestionButton>
            ) : null}
          </fieldset>
        </Step>

        <Step number={4} title={t("stepVisibility")}>
          <div
            role="radiogroup"
            aria-label={t("visibility")}
            className="grid gap-2 sm:grid-cols-2"
          >
            {(["private", "public"] as const).map((option) => {
              const Icon = option === "public" ? Globe : Lock;
              return (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer gap-3 rounded-xl border p-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#9ED0FF]/60",
                    visibility === option
                      ? "border-[#9ED0FF] bg-[#9ED0FF]/10"
                      : "border-[#9ED0FF]/20 hover:border-[#9ED0FF]/45",
                  )}
                >
                  <input
                    type="radio"
                    name="visibility"
                    className="mt-1 size-4 accent-[#9ED0FF]"
                    value={option}
                    checked={visibility === option}
                    onChange={() => setVisibility(option)}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <Icon className="size-4 text-[#9ED0FF]" />
                      {tEvents(option)}
                    </span>
                    <span className={hint}>
                      {option === "private"
                        ? t("visibilityPrivate", { org: orgName })
                        : t("visibilityPublic")}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </Step>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <div className="flex gap-2">
          <Button
            type="submit"
            disabled={pending}
            className={cn("h-11 px-6 text-[15px]", primaryButton)}
          >
            {initial ? t("save") : t("create")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => router.back()}
          >
            {t("cancel")}
          </Button>
        </div>
      </form>

      <aside
        aria-label={t("preview")}
        className="hidden space-y-2 lg:sticky lg:top-6 lg:block"
      >
        <span className={kicker}>{t("preview")}</span>
        <div className={cn(panel, "space-y-2 p-4")}>
          <span className="block font-mono text-sm text-[#9ED0FF]">
            {range
              ? `${shortDay.format(new Date(range.startsAt))} · ${time.format(new Date(range.startsAt))} → ${time.format(new Date(range.endsAt))}`
              : "—"}
          </span>
          <span className="block text-lg font-semibold">
            {title || t("titlePlaceholder")}
          </span>
          {meetingPoint || meetingPlace ? (
            <span className="flex items-center gap-1.5 text-sm text-white/70">
              <MapPin className="size-3.5 text-[#9ED0FF]" />
              {[meetingPoint, meetingPlace?.name].filter(Boolean).join(" · ")}
            </span>
          ) : null}
          {roles.some((role) => role.label) ? (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {roles
                .filter((role) => role.label)
                .map((role) => (
                  <span
                    key={role.key}
                    className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/30 px-2 py-0.5 text-xs text-[#BFE0FF]"
                  >
                    <RoleIcon icon={role.icon} className="size-3" />
                    {role.wanted.trim()
                      ? `${role.label} · ${role.wanted}`
                      : role.label}
                  </span>
                ))}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function SuggestionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-[#9ED0FF]/40 px-3 text-sm text-[#BFE0FF] hover:border-[#9ED0FF] hover:bg-[#9ED0FF]/10"
    >
      {children}
    </button>
  );
}
