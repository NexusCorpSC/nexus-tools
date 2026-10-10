"use client";

import { useState } from "react";
import { lastListUrl } from "@/lib/list-url";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarClock,
  Check,
  ClipboardList,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RoleIcon } from "@/app/squads/role-icon";
import { cn } from "@/lib/utils";
import {
  ORG_EVENT_ANSWER_MAX_LENGTH,
  type OrgEventParticipant,
  type OrgEventRole,
  type OrgEventView,
} from "@/types/org-events";
import {
  Avatar,
  Chip,
  TimeRange,
  VisibilityChip,
  errorOf,
  kicker,
  missingFor,
  panel,
  primaryButton,
  roleById,
  timeZoneCity,
  useCountdown,
  useDuration,
  useFormats,
  useNow,
} from "./shared";

/**
 * La fiche d'un évènement : l'essentiel en trois cartes, le plan, qui vient
 * par rôle, et à côté le panneau d'inscription — en barre collée au bas de
 * l'écran sur téléphone.
 */
export function EventDetail({
  initial,
  signedIn,
  orgName,
}: {
  initial: OrgEventView;
  signedIn: boolean;
  orgName: string;
}) {
  const t = useTranslations("OrgEvents");
  const router = useRouter();
  const [event, setEvent] = useState(initial);
  const [deleteError, setDeleteError] = useState(false);
  const now = useNow();
  const countdown = useCountdown();
  const status = now === null ? null : countdown(event, now);

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
    router.push(lastListUrl(`/orgs/${event.orgId}/events`));
    router.refresh();
  }

  return (
    <div className="space-y-7 pb-24 lg:pb-0">
      <header className="flex flex-wrap items-start gap-5">
        <DateBlock startsAt={event.startsAt} />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <VisibilityChip visibility={event.visibility} orgName={orgName} />
            {status ? (
              <Chip
                tone={
                  status.state === "live"
                    ? "live"
                    : status.state === "soon"
                      ? "missing"
                      : "default"
                }
              >
                {status.label}
              </Chip>
            ) : null}
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight">
            {event.title}
          </h1>
        </div>
        {event.canManage ? (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/orgs/${event.orgId}/events/${event.id}/summary`}>
                <ClipboardList className="size-4" />
                {t("summary")}
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/orgs/${event.orgId}/events/${event.id}/edit`}>
                <Pencil className="size-4" />
                {t("edit")}
              </Link>
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t("moreActions")}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-full justify-start gap-2 px-2 font-normal text-red-300 hover:bg-red-500/15 hover:text-red-200"
                  onClick={() => void remove()}
                >
                  <Trash2 className="size-4" />
                  {t("delete")}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        ) : null}
      </header>

      {deleteError ? (
        <p className="text-sm text-red-300">{t("deleteError")}</p>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main className="min-w-0 space-y-7">
          <Facts event={event} />

          {event.description ? (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">{t("thePlan")}</h2>
              <p className="whitespace-pre-wrap leading-relaxed text-white/85">
                {event.description}
              </p>
            </section>
          ) : null}

          <WhoComes event={event} />
        </main>

        <aside
          id="inscription"
          aria-label={t("Registration.title")}
          className="scroll-mt-6 lg:sticky lg:top-6"
        >
          <RegistrationPanel
            event={event}
            signedIn={signedIn}
            ended={status?.state === "over"}
            onChange={setEvent}
          />
        </aside>
      </div>

      <MobileBar event={event} ended={status?.state === "over"} />
    </div>
  );
}

function DateBlock({ startsAt }: { startsAt: string }) {
  const { shortDay } = useFormats();
  const now = useNow();
  const locale = shortDay.resolvedOptions().locale;
  const date = new Date(startsAt);
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, options).format(date).toUpperCase();

  return (
    <div
      aria-hidden="true"
      className="flex w-[72px] shrink-0 flex-col items-center rounded-2xl border border-[#9ED0FF]/30 bg-[#0B2E4A] py-2"
    >
      {now === null ? (
        <span className="h-[62px]" />
      ) : (
        <>
          <span className="text-xs font-semibold text-[#9ED0FF]">
            {part({ month: "short" })}
          </span>
          <span className="text-[28px] font-bold leading-tight">
            {date.getDate()}
          </span>
          <span className="text-xs text-white/65">
            {part({ weekday: "short" })}
          </span>
        </>
      )}
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn(panel, "flex gap-3 p-4")}>
      <span className="mt-0.5 text-[#9ED0FF]">{icon}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={kicker}>{label}</span>
        <span className="text-[17px] font-semibold">{value}</span>
        {children ? (
          <span className="text-sm text-white/70">{children}</span>
        ) : null}
      </div>
    </div>
  );
}

function Facts({ event }: { event: OrgEventView }) {
  const t = useTranslations("OrgEvents.Facts");
  const now = useNow();
  const duration = useDuration();

  const where = event.meetingPoint || event.meetingPlace?.name || null;

  return (
    <section
      aria-label={t("label")}
      className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]"
    >
      <Fact
        icon={<CalendarClock className="size-5" />}
        label={t("when")}
        value={<TimeRange startsAt={event.startsAt} endsAt={event.endsAt} />}
      >
        {now === null
          ? "\u00a0"
          : t("whenDetail", {
              duration: duration(
                Date.parse(event.endsAt) - Date.parse(event.startsAt),
              ),
              city: timeZoneCity(),
            })}
      </Fact>
      <Fact
        icon={<MapPin className="size-5" />}
        label={t("where")}
        value={where ?? t("whereUnknown")}
      >
        {event.meetingPlace ? (
          <Link
            href={`/lieux/${event.meetingPlace.slug}`}
            className="text-[#9ED0FF] hover:text-[#CFE8FF]"
          >
            {event.meetingPoint
              ? t("seePlaceNamed", { place: event.meetingPlace.name })
              : t("seePlace")}
          </Link>
        ) : null}
      </Fact>
      <Fact
        icon={<User className="size-5" />}
        label={t("organizer")}
        value={event.createdBy.name}
      />
    </section>
  );
}

function Person({
  participant,
  me,
}: {
  participant: OrgEventParticipant;
  me: boolean;
}) {
  const t = useTranslations("OrgEvents");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm",
        me
          ? "border-[#2E8A5A] bg-[#1D5A3A]/60"
          : "border-[#9ED0FF]/15 bg-[#071A2B]/60",
      )}
    >
      <Avatar name={participant.name} className="size-6 text-[10px]" />
      {me ? t("you", { name: participant.name }) : participant.name}
    </span>
  );
}

function WhoComes({ event }: { event: OrgEventView }) {
  const t = useTranslations("OrgEvents");
  const me = event.myRegistration?.userId ?? null;

  const groups: {
    role: OrgEventRole | null;
    people: OrgEventParticipant[];
  }[] =
    event.roles.length === 0
      ? [{ role: null, people: event.participants }]
      : [
          ...event.roles.map((role) => ({
            role,
            people: event.participants.filter(
              (participant) => participant.role === role.id,
            ),
          })),
          {
            role: null,
            people: event.participants.filter(
              (participant) => !roleById(event.roles, participant.role),
            ),
          },
        ].filter((group) => group.role !== null || group.people.length > 0);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{t("whoComes")}</h2>
        <span className="text-sm text-white/65">
          {t("registrations", { count: event.registrationCount })}
        </span>
      </div>

      {!event.canRegister && event.registrationCount > 0 ? (
        <p className="text-sm text-white/65">{t("listMembersOnly")}</p>
      ) : null}

      {event.roles.length === 0 ? (
        event.canRegister ? (
          event.participants.length === 0 ? (
            <p className="text-sm text-white/70">{t("noParticipants")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {event.participants.map((participant) => (
                <Person
                  key={participant.userId}
                  participant={participant}
                  me={participant.userId === me}
                />
              ))}
            </div>
          )
        ) : null
      ) : (
        <div className={cn(panel, "divide-y divide-[#9ED0FF]/10")}>
          {groups.map(({ role, people }) => {
            const count = role
              ? (event.roleCounts[role.id] ?? 0)
              : (event.roleCounts[""] ?? people.length);
            const missing = role ? missingFor(role, event.roleCounts) : 0;
            return (
              <div key={role?.id ?? ""} className="space-y-2.5 p-4">
                <div className="flex items-center gap-2">
                  <RoleIcon
                    icon={role?.icon}
                    className="size-4 text-[#9ED0FF]"
                  />
                  <span className="font-semibold">
                    {role?.label ?? t("Summary.noRole")}
                  </span>
                  <span
                    className={cn(
                      "text-sm",
                      missing > 0 ? "text-[#F7D2AE]" : "text-white/65",
                    )}
                  >
                    {role && role.wanted !== null
                      ? t("countOfWanted", { count, wanted: role.wanted })
                      : count}
                  </span>
                </div>
                {people.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {people.map((participant) => (
                      <Person
                        key={participant.userId}
                        participant={participant}
                        me={participant.userId === me}
                      />
                    ))}
                  </div>
                ) : event.canRegister && count === 0 ? (
                  <p className="text-sm text-white/55">{t("nobodyInRole")}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** S'inscrire, relire son inscription, la modifier ou se désinscrire. */
function RegistrationPanel({
  event,
  signedIn,
  ended,
  onChange,
}: {
  event: OrgEventView;
  signedIn: boolean;
  ended: boolean;
  onChange: (view: OrgEventView) => void;
}) {
  const t = useTranslations("OrgEvents.Registration");
  const tEvents = useTranslations("OrgEvents");
  const mine = event.myRegistration;
  const active = !!mine && !mine.withdrawn;

  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState(mine?.role ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>(
    mine?.answers ?? {},
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shownAsPlanned, setShownAsPlanned] = useState(false);

  const box =
    "space-y-4 rounded-2xl border border-[#9ED0FF]/25 bg-[#0B2E4A] p-5";

  if (ended || !event.canRegister) {
    return (
      <div className={box}>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm text-white/70">
          {ended
            ? tEvents("ended")
            : signedIn
              ? tEvents("membersOnly")
              : t("signIn")}
        </p>
      </div>
    );
  }

  async function send(method: "PUT" | "DELETE") {
    setPending(true);
    setError(null);
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
      setEditing(false);
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

  /** Reprend l'évènement comme prochaine session, dans le statut. */
  async function showAsPlanned() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/me/presence/planned", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: { orgId: event.orgId, eventId: event.id },
        }),
      });
      if (!response.ok) throw new Error(await errorOf(response));
      setShownAsPlanned(true);
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

  if (active && !editing) {
    const myRole = roleById(event.roles, mine.role);
    const firstAnswer = event.questions
      .map((question) => mine.answers[question.id])
      .find(Boolean);
    return (
      <div className={box}>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1D5A3A] text-[#A8EBC8]">
            <Check className="size-5" />
          </span>
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-lg font-semibold">{t("registered")}</h2>
            <p className="text-sm text-white/70">
              {[
                myRole ? t("roleIs", { role: myRole.label }) : null,
                firstAnswer,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
        {event.squadId ? (
          <Link
            href="/squads"
            className="flex items-center gap-2 rounded-xl bg-[#1D5A3A]/50 px-3 py-2.5 text-sm text-[#D5F5E3] hover:bg-[#1D5A3A]/70"
          >
            <Users className="size-4 shrink-0" />
            {t("squadReady")}
          </Link>
        ) : null}
        {shownAsPlanned ? (
          <p className="rounded-xl bg-[#071A2B]/70 px-3 py-2.5 text-sm text-[#F7D2AE]">
            {t("shownAsPlanned")}
          </p>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => void showAsPlanned()}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[#F2B880]/45 px-3 py-2.5 text-left text-sm text-[#F7D2AE] hover:border-[#F2B880]"
          >
            <CalendarClock className="size-4 shrink-0" />
            {t("showAsPlanned")}
          </button>
        )}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="h-11"
            onClick={() => setEditing(true)}
          >
            {t("editAnswers")}
          </Button>
          <Button
            variant="ghost"
            className="h-11 text-white/75 hover:text-white"
            disabled={pending}
            onClick={() => void send("DELETE")}
          >
            {t("withdraw")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={box}
      onSubmit={(submitted) => {
        submitted.preventDefault();
        void send("PUT");
      }}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">
          {active ? t("editTitle") : t("register")}
        </h2>
        <p className="text-sm text-white/65">
          {t("hint", { name: event.createdBy.name })}
        </p>
      </div>

      {event.roles.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("role")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {event.roles.map((candidate) => {
              const count = event.roleCounts[candidate.id] ?? 0;
              const missing = missingFor(candidate, event.roleCounts);
              const checked = role === candidate.id;
              return (
                <label
                  key={candidate.id}
                  className={cn(
                    "flex min-h-16 cursor-pointer flex-col items-start gap-1 rounded-xl border px-3 py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#9ED0FF]/60",
                    checked
                      ? "border-[#9ED0FF] bg-[#9ED0FF]/15"
                      : "border-[#9ED0FF]/20 hover:border-[#9ED0FF]/45",
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    required
                    className="sr-only"
                    value={candidate.id}
                    checked={checked}
                    onChange={() => setRole(candidate.id)}
                  />
                  <span className="flex items-center gap-1.5 font-semibold">
                    <RoleIcon
                      icon={candidate.icon}
                      className="size-4 text-[#9ED0FF]"
                    />
                    {candidate.label}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      missing > 0 ? "text-[#F7D2AE]" : "text-white/65",
                    )}
                  >
                    {missing > 0 && count === 0
                      ? t("lookingFor", { count: missing })
                      : missing > 0
                        ? t("countMissing", { count, missing })
                        : tEvents("registrations", { count })}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {event.questions.map((question) => (
        <div key={question.id} className="space-y-1.5">
          <label
            className="block text-sm font-medium"
            htmlFor={`answer-${question.id}`}
          >
            {question.label}{" "}
            <span className="font-normal text-white/60">
              · {question.required ? t("required") : t("optional")}
            </span>
          </label>
          <Textarea
            id={`answer-${question.id}`}
            rows={2}
            required={question.required}
            maxLength={ORG_EVENT_ANSWER_MAX_LENGTH}
            className="bg-[#071A2B]"
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

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          disabled={pending}
          className={cn("h-11 w-full text-[15px]", primaryButton)}
        >
          {active ? t("update") : mine ? t("reRegister") : t("register")}
        </Button>
        {active ? (
          <Button
            type="button"
            variant="ghost"
            className="h-11"
            onClick={() => {
              setRole(mine.role);
              setAnswers(mine.answers);
              setEditing(false);
            }}
          >
            {t("cancel")}
          </Button>
        ) : null}
      </div>

      {mine?.withdrawn ? (
        <p className="text-sm text-white/65">{t("withdrawn")}</p>
      ) : null}
    </form>
  );
}

/** Sur téléphone, le panneau est loin : une barre y mène depuis le bas. */
function MobileBar({ event, ended }: { event: OrgEventView; ended: boolean }) {
  const t = useTranslations("OrgEvents.Registration");
  if (ended || !event.canRegister) return null;

  const mine = event.myRegistration;
  const active = !!mine && !mine.withdrawn;
  const myRole = active ? roleById(event.roles, mine.role) : null;

  return (
    <div
      data-bottom-bar
      className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-[#9ED0FF]/25 bg-[#0B2E4A] px-4 pb-6 pt-3 lg:hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">
          {active ? (myRole?.label ?? t("registered")) : event.title}
        </span>
        <span className="text-xs text-white/65">
          {active ? t("registered") : t("openUntilEnd")}
        </span>
      </div>
      <a
        href="#inscription"
        className={cn(
          "inline-flex h-12 items-center rounded-xl px-5 text-base",
          active
            ? "border border-[#9ED0FF] font-semibold text-[#9ED0FF]"
            : primaryButton,
        )}
      >
        {active ? t("editAnswers") : t("register")}
      </a>
    </div>
  );
}
