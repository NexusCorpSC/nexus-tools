"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronsUpDown,
  Flag,
  ListChecks,
  Loader2,
  LogOut,
  Megaphone,
  Pencil,
  Plus,
  Users,
  WifiOff,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ANNOUNCEMENTS_MAX_LENGTH,
  RAID_NAME_MAX_LENGTH,
  SQUAD_NAME_MAX_LENGTH,
  type RaidView,
  type Squad,
  type SquadMembership,
  type SquadView,
} from "@/types/squad";
import { squadApi } from "./api";
import { commandsSquad, MemberList, tally, type MemberActions } from "./members";
import { RaidBoard } from "./raid";
import { RaidSheet, RolesSheet } from "./sheets";
import { useSquadView } from "./use-squad-view";
import { CodeChip, ConfirmButton } from "./widgets";

/**
 * The squad, on a screen that may be four inches wide.
 *
 * One column, everything under the thumb: the two states of a row are the
 * biggest targets, the rest of a row hides behind its menu, and the sheets
 * that manage roles and the raid rise from the bottom. Wider than a phone,
 * the same layout simply breathes — the raid goes to two columns, nothing
 * else moves, so the site and the desktop overlay read the same way.
 *
 * Three states, as the overlay: no squad, a squad, a squad in a raid; and one
 * reader who is in several squads — the organiser of a raid, who opened the
 * raid's other squads and is offered to switch between them.
 */

type Sheet = { kind: "roles"; squadId: string } | { kind: "raid" } | null;

export function SquadBoard({
  initialView,
  userId,
}: {
  initialView: SquadView;
  userId: string;
}) {
  const t = useTranslations("Squads");

  /** The squad the page looks at, `null` for the one the API picks. */
  const [current, setCurrent] = useState<string | null>(null);
  const { view, run, busy, offline } = useSquadView(initialView, current, userId);

  /** `null` is «whatever fits»: a squad in a raid opens on the raid. */
  const [pinned, setPinned] = useState<"squad" | "raid" | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);

  const squad = view.squad;
  const raid = view.raid;
  const raiding = Boolean(raid) && (pinned ?? "raid") === "raid";

  function rosterOf(squadId: string): Squad | null {
    if (squad?.id === squadId) return squad;
    return raid?.squads.find((sub) => sub.id === squadId) ?? null;
  }

  /*
   * Derived rather than synchronised: a sheet whose squad is gone — put out
   * of the raid, or left — simply has nothing to show, and closes by not
   * rendering. Likewise a `current` the reader is no longer in: every write
   * names the squad it acts on from the view, so a stale choice only ever
   * reaches the read, which the API answers with what the reader still has.
   */
  const rolesTarget = sheet?.kind === "roles" ? rosterOf(sheet.squadId) : null;

  /** The row actions on one squad the reader is in — on screen or in the raid. */
  function actionsFor(target: Squad): MemberActions {
    return {
      onPatch: (memberId, patch) =>
        void run(() => squadApi.patchMember(target.id, memberId, patch)),
      onRemove: (memberId) =>
        void run(() => squadApi.removeMember(target.id, memberId)),
      onMakeLeader: (memberId) =>
        void run(() => squadApi.makeLeader(target.id, memberId)),
      onRoles: () => setSheet({ kind: "roles", squadId: target.id }),
    };
  }

  const commands = Boolean(squad && commandsSquad(squad, userId));
  const leads = Boolean(raid && squad && raid.leadSquadId === squad.id && commands);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-2">
        {squad && raid ? (
          <ViewSwitch
            view={raiding ? "raid" : "squad"}
            onChange={setPinned}
          />
        ) : (
          <Users className="size-5 shrink-0 text-[#9ED0FF]/70" aria-hidden="true" />
        )}

        <Title
          squad={squad}
          raid={raid}
          raiding={raiding}
          editable={Boolean(squad && commands && (!raiding || leads))}
          onRename={(name) => {
            if (!squad) return;
            void run(() =>
              raiding
                ? squadApi.updateRaid(squad.id, { name })
                : squadApi.rename(squad.id, name),
            );
          }}
        />

        {!raiding && squad && view.memberships.length > 1 ? (
          <SquadSwitcher
            current={squad.id}
            memberships={view.memberships}
            onPick={setCurrent}
          />
        ) : null}

        {raiding && raid ? <CodeChip code={raid.code} tone="raid" /> : null}
        {!raiding && squad ? <CodeChip code={squad.code} /> : null}

        {offline ? (
          <span
            className="flex items-center gap-1 text-xs text-amber-300"
            title={t("offline")}
          >
            <WifiOff className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("offline")}</span>
          </span>
        ) : null}
      </header>

      {!squad ? (
        <NoSquad
          busy={busy}
          onCreate={() => void run(() => squadApi.create())}
          onJoin={(code) => run(() => squadApi.join(code))}
        />
      ) : raiding && raid ? (
        <>
          <Announcement
            value={raid.announcement}
            editable={leads}
            placeholder={t("raidAnnouncement")}
            tone="raid"
            onSave={(announcement) =>
              run(() => squadApi.updateRaid(squad.id, { announcement }))
            }
          />

          <RaidBoard raid={raid} userId={userId} actionsFor={actionsFor} />

          <Footer counts={tally(raid.squads)}>
            {leads ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => squadApi.raidReadyCheck(squad.id))}
              >
                <ListChecks />
                {t("raidReadyCheck")}
              </Button>
            ) : null}

            <Button variant="secondary" size="sm" onClick={() => setSheet({ kind: "raid" })}>
              <Flag />
              {t("manageRaid")}
            </Button>
          </Footer>
        </>
      ) : (
        <>
          {raid?.announcement ? (
            <Announcement
              value={raid.announcement}
              editable={false}
              placeholder={t("raidAnnouncement")}
              tone="raid"
              onSave={async () => false}
            />
          ) : null}

          <Announcement
            value={squad.announcements}
            editable={commands}
            placeholder={t("announcement")}
            onSave={(announcements) =>
              run(() => squadApi.announce(squad.id, announcements))
            }
          />

          <MemberList
            squad={squad}
            userId={userId}
            commands={commands}
            actions={actionsFor(squad)}
          />

          <Footer counts={tally([squad])}>
            {commands ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => void run(() => squadApi.readyCheck(squad.id))}
              >
                <ListChecks />
                {t("readyCheck")}
              </Button>
            ) : null}

            <Button variant="secondary" size="sm" onClick={() => setSheet({ kind: "raid" })}>
              <Flag />
              {raid ? t("manageRaid") : t("createRaid")}
            </Button>

            <ConfirmButton
              variant="outline"
              size="sm"
              className="border-red-300/40 text-red-300 hover:bg-red-500/20 hover:text-red-200"
              confirmLabel={t("leaveConfirm", { name: squad.name })}
              disabled={busy}
              onConfirm={() =>
                void run(() => squadApi.leave(squad.id), {
                  then: () => setCurrent(null),
                })
              }
            >
              <LogOut />
              {t("leave")}
            </ConfirmButton>
          </Footer>
        </>
      )}

      <p className="text-xs text-[#9ED0FF]/50">{t("appHint")}</p>

      {rolesTarget ? (
        <RolesSheet
          squad={rolesTarget}
          editable={commandsSquad(rolesTarget, userId)}
          busy={busy}
          onAdd={(label, icon) =>
            run(() => squadApi.addRole(rolesTarget.id, label, icon))
          }
          onEdit={(roleId, patch) =>
            run(() => squadApi.editRole(rolesTarget.id, roleId, patch))
          }
          onRemove={(roleId) =>
            void run(() => squadApi.removeRole(rolesTarget.id, roleId))
          }
          onClose={() => setSheet(null)}
        />
      ) : null}

      {squad && sheet?.kind === "raid" ? (
        <RaidSheet
          squad={squad}
          raid={raid}
          userId={userId}
          editable={commands}
          busy={busy}
          onStart={() => void run(() => squadApi.createRaid(squad.id))}
          onEnter={(code) => run(() => squadApi.joinRaid(squad.id, code))}
          onQuit={() => void run(() => squadApi.leaveRaid(squad.id))}
          onUnlink={(targetId) =>
            void run(() => squadApi.unlinkSquad(squad.id, targetId))
          }
          onOpenSquad={() => void run(() => squadApi.openRaidSquad(squad.id))}
          onSwitch={(squadId) => {
            setCurrent(squadId);
            setPinned("squad");
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* No squad yet                                                        */
/* ------------------------------------------------------------------ */

function NoSquad({
  busy,
  onCreate,
  onJoin,
}: {
  busy: boolean;
  onCreate: () => void;
  onJoin: (code: string) => Promise<boolean>;
}) {
  const t = useTranslations("Squads");
  const [code, setCode] = useState("");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#9ED0FF]/75">{t("noSquad")}</p>

      <Button className="w-full sm:w-auto" disabled={busy} onClick={onCreate}>
        {busy ? <Loader2 className="animate-spin" /> : <Plus />}
        {t("createSquad")}
      </Button>

      <form
        className="flex items-center gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          const typed = code.trim();
          if (typed && (await onJoin(typed))) setCode("");
        }}
      >
        <Input
          aria-label={t("squadCode")}
          value={code}
          placeholder={t("codePlaceholder")}
          spellCheck={false}
          autoCapitalize="characters"
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          className="font-mono uppercase tracking-widest"
        />
        <Button type="submit" variant="secondary" disabled={busy || !code.trim()}>
          {t("join")}
        </Button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

/**
 * Which roster is on screen. Two segments, the lit one being where you are:
 * a full-width pair of tabs on a phone, a compact pill beside the title on
 * anything wider.
 */
function ViewSwitch({
  view,
  onChange,
}: {
  view: "squad" | "raid";
  onChange: (view: "squad" | "raid") => void;
}) {
  const t = useTranslations("Squads");

  return (
    <div
      role="group"
      aria-label={t("view")}
      className="grid w-full grid-cols-2 rounded-lg border border-[#9ED0FF]/20 bg-[#061E30]/50 p-0.5 sm:inline-flex sm:w-auto"
    >
      <Segment active={view === "squad"} onClick={() => onChange("squad")}>
        <Users className="size-4" aria-hidden="true" />
        {t("viewSquad")}
      </Segment>
      <Segment active={view === "raid"} onClick={() => onChange("raid")}>
        <Flag className="size-4" aria-hidden="true" />
        {t("viewRaid")}
      </Segment>
    </div>
  );
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex min-h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition",
        active
          ? "bg-[#9ED0FF]/25 text-[#CCE7FF]"
          : "text-[#9ED0FF]/60 hover:text-[#CCE7FF]",
      )}
    >
      {children}
    </button>
  );
}

/** The name of the squad, or of the raid — the same pencil either way. */
function Title({
  squad,
  raid,
  raiding,
  editable,
  onRename,
}: {
  squad: Squad | null;
  raid: RaidView | null;
  raiding: boolean;
  editable: boolean;
  onRename: (name: string) => void;
}) {
  const t = useTranslations("Squads");
  const [editing, setEditing] = useState(false);
  const name = raiding && raid ? raid.name : (squad?.name ?? t("title"));

  if (editing) {
    return (
      <NameField
        value={name}
        max={raiding ? RAID_NAME_MAX_LENGTH : SQUAD_NAME_MAX_LENGTH}
        onDone={(next) => {
          setEditing(false);
          const trimmed = next.trim();
          if (trimmed && trimmed !== name) onRename(trimmed);
        }}
      />
    );
  }

  return (
    <>
      <h1 className="min-w-0 flex-1 truncate text-xl font-bold sm:text-2xl">
        {name}
      </h1>

      {editable ? (
        <Button
          variant="ghost"
          size="icon-sm"
          title={raiding ? t("renameRaid") : t("renameSquad")}
          onClick={() => setEditing(true)}
        >
          <span className="sr-only">
            {raiding ? t("renameRaid") : t("renameSquad")}
          </span>
          <Pencil className="size-4" />
        </Button>
      ) : null}
    </>
  );
}

function NameField({
  value,
  max,
  onDone,
}: {
  value: string;
  max: number;
  onDone: (value: string) => void;
}) {
  const t = useTranslations("Squads");
  const [draft, setDraft] = useState(value);

  return (
    <Input
      aria-label={t("name")}
      value={draft}
      maxLength={max}
      autoFocus
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onDone(draft);
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onDone(value);
        }
      }}
      className="min-w-0 flex-1 text-lg font-bold"
    />
  );
}

/**
 * The squads the reader is in, for the one reader who is in several: the
 * organiser of a raid, who opened its squads.
 */
function SquadSwitcher({
  current,
  memberships,
  onPick,
}: {
  current: string;
  memberships: SquadMembership[];
  onPick: (squadId: string) => void;
}) {
  const t = useTranslations("Squads");
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" title={t("switchSquad")}>
          <span className="sr-only">{t("switchSquad")}</span>
          <ChevronsUpDown className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[#9ED0FF]/50">
          {t("mySquads")}
        </p>
        {memberships.map((membership) => (
          <button
            key={membership.id}
            type="button"
            onClick={() => {
              onPick(membership.id);
              setOpen(false);
            }}
            className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[#CCE7FF] transition hover:bg-[#9ED0FF]/10"
          >
            <Users
              className={cn(
                "size-4 shrink-0",
                membership.id === current ? "text-[#CCE7FF]" : "text-[#9ED0FF]/60",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{membership.name}</span>
            {membership.id === current ? (
              <Check className="size-4 shrink-0 text-emerald-300" aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Announcement, footer                                                */
/* ------------------------------------------------------------------ */

/**
 * Text until someone writes it. Edited with an explicit save rather than on
 * every keystroke: on a phone the keyboard covers half the screen, and a
 * message read by the whole raid deserves a «done».
 */
function Announcement({
  value,
  editable,
  placeholder,
  tone,
  onSave,
}: {
  value: string;
  editable: boolean;
  placeholder: string;
  tone?: "raid";
  onSave: (value: string) => Promise<boolean>;
}) {
  const t = useTranslations("Squads");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  if (!value && !editable) return null;

  const frame = cn(
    "rounded-lg border-l-2 px-3 py-2",
    tone === "raid"
      ? "border-amber-300/60 bg-amber-300/[0.07]"
      : "border-[#9ED0FF]/40 bg-[#9ED0FF]/[0.06]",
  );

  if (editing) {
    return (
      <form
        className={cn(frame, "space-y-2")}
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          const saved = await onSave(draft);
          setSaving(false);
          if (saved) setEditing(false);
        }}
      >
        <Textarea
          aria-label={placeholder}
          value={draft}
          maxLength={ANNOUNCEMENTS_MAX_LENGTH}
          rows={3}
          autoFocus
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Check />}
            {t("save")}
          </Button>
        </div>
      </form>
    );
  }

  const body = (
    <>
      <Megaphone
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "raid" ? "text-amber-300/80" : "text-[#9ED0FF]/60",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "min-w-0 flex-1 whitespace-pre-wrap text-sm leading-relaxed",
          value ? "text-[#CCE7FF]" : "text-[#9ED0FF]/45",
        )}
      >
        {value || placeholder}
      </span>
    </>
  );

  if (!editable) {
    return <div className={cn(frame, "flex items-start gap-2")}>{body}</div>;
  }

  return (
    <button
      type="button"
      title={t("edit")}
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={cn(frame, "flex w-full items-start gap-2 text-left transition hover:bg-[#9ED0FF]/10")}
    >
      {body}
      <Pencil className="mt-0.5 size-4 shrink-0 text-[#9ED0FF]/50" aria-hidden="true" />
    </button>
  );
}

function Footer({
  counts,
  children,
}: {
  counts: { ready: number; total: number; down: number };
  children: React.ReactNode;
}) {
  const t = useTranslations("Squads");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9ED0FF]/10 pt-3">
      <p className="text-sm text-[#9ED0FF]/80">
        {t("readyCount", { ready: counts.ready, total: counts.total })}
        {counts.down ? (
          <span className="text-red-300">
            {" · "}
            {t("downCount", { count: counts.down })}
          </span>
        ) : null}
      </p>

      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
