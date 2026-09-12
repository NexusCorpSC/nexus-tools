"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Crown,
  MoreHorizontal,
  Pencil,
  Shield,
  Skull,
  Tag,
  UserMinus,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  POSITION_MAX_LENGTH,
  type Squad,
  type SquadMember,
  type SquadMemberPatch,
} from "@/types/squad";
import { RoleIcon, roleOf } from "./role-icon";

/** Longest-standing first, which is also the order of succession. */
export function inJoinOrder(members: SquadMember[]): SquadMember[] {
  return [...members].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/**
 * Whether this user gives the orders — the leader, or a lieutenant they
 * appointed. The same question the API asks; disabling a button here is a
 * courtesy, every act is refused server-side too.
 */
export function commandsSquad(squad: Squad, userId: string): boolean {
  return (
    squad.leaderId === userId ||
    squad.members.some(
      (member) => member.userId === userId && member.lieutenant,
    )
  );
}

export function tally(squads: Squad[]) {
  const members = squads.flatMap((squad) => squad.members);

  return {
    total: members.length,
    // A member who is down is not «ready», whatever their row last said.
    ready: members.filter((member) => member.ready && member.alive).length,
    down: members.filter((member) => !member.alive).length,
  };
}

export interface MemberActions {
  onPatch: (userId: string, patch: SquadMemberPatch) => void;
  onRemove: (userId: string) => void;
  onMakeLeader: (userId: string) => void;
  /** Opens the roles of this squad. */
  onRoles: () => void;
}

/**
 * The roster, one row per member, built for a thumb.
 *
 * Every row is at least 48 pixels tall and its two states — ready, down —
 * are buttons of the same height, since they are what a member taps most.
 * Everything else about a row hides behind the `⋯` at the end, which only
 * appears for whoever may use it.
 */
export function MemberList({
  squad,
  userId,
  commands,
  actions,
}: {
  squad: Squad;
  /** `null` on a squad the reader is not in: those rows are read-only. */
  userId: string | null;
  commands: boolean;
  actions: MemberActions;
}) {
  return (
    <ul className="divide-y divide-[#9ED0FF]/10">
      {inJoinOrder(squad.members).map((member) => (
        <MemberRow
          key={member.userId}
          squad={squad}
          member={member}
          isSelf={member.userId === userId}
          isLeader={squad.leaderId === member.userId}
          editable={member.userId === userId || commands}
          commands={commands}
          onPatch={(patch) => actions.onPatch(member.userId, patch)}
          // Nobody is put out of their own squad, and the leader is never
          // removed — they leave, or hand over first.
          onRemove={
            commands &&
            member.userId !== userId &&
            member.userId !== squad.leaderId
              ? () => actions.onRemove(member.userId)
              : undefined
          }
          onMakeLeader={
            commands && member.userId !== squad.leaderId
              ? () => actions.onMakeLeader(member.userId)
              : undefined
          }
          onRank={
            commands && member.userId !== squad.leaderId
              ? (lieutenant) => actions.onPatch(member.userId, { lieutenant })
              : undefined
          }
          onRoles={actions.onRoles}
        />
      ))}
    </ul>
  );
}

function MemberRow({
  squad,
  member,
  isSelf,
  isLeader,
  editable,
  commands,
  onPatch,
  onRemove,
  onMakeLeader,
  onRank,
  onRoles,
}: {
  squad: Squad;
  member: SquadMember;
  isSelf: boolean;
  isLeader: boolean;
  editable: boolean;
  commands: boolean;
  onPatch: (patch: SquadMemberPatch) => void;
  onRemove?: () => void;
  onMakeLeader?: () => void;
  onRank?: (lieutenant: boolean) => void;
  onRoles: () => void;
}) {
  const t = useTranslations("Squads");
  const [editingPosition, setEditingPosition] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const down = !member.alive;
  // «Down» takes «ready» with it, on screen as in the database.
  const ready = member.ready && member.alive;

  return (
    <li className="flex min-h-12 items-center gap-2 py-1.5">
      <span className="flex w-4 shrink-0 items-center justify-center">
        {isLeader ? (
          <span title={t("leader")}>
            <Crown className="size-4 text-amber-300" aria-hidden="true" />
            <span className="sr-only">{t("leader")}</span>
          </span>
        ) : member.lieutenant ? (
          <span title={t("lieutenant")}>
            <Shield className="size-4 text-sky-300" aria-hidden="true" />
            <span className="sr-only">{t("lieutenant")}</span>
          </span>
        ) : null}
      </span>

      <RolePicker
        squad={squad}
        current={member.role}
        editable={editable}
        canManage={commands}
        onPick={(roleId) => onPatch({ role: roleId })}
        onManage={onRoles}
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            down
              ? "text-red-300 line-through decoration-red-300/60"
              : ready
                ? "text-emerald-300"
                : "text-[#CCE7FF]",
            (isLeader || isSelf) && "font-semibold",
          )}
        >
          {member.name}
        </p>

        {editingPosition ? (
          <PositionField
            value={member.position}
            onDone={(position) => {
              setEditingPosition(false);
              if (position !== member.position) onPatch({ position });
            }}
          />
        ) : member.position ? (
          <button
            type="button"
            disabled={!editable}
            onClick={() => setEditingPosition(true)}
            className={cn(
              "block max-w-full truncate text-left text-xs text-[#9ED0FF]/65",
              editable && "hover:text-[#CCE7FF]",
            )}
          >
            {member.position}
          </button>
        ) : null}
      </div>

      <StateButton
        label={ready ? t("ready") : t("notReady")}
        disabled={!editable || down}
        dimmed={down}
        onClick={() => onPatch({ ready: !member.ready })}
      >
        {ready ? (
          <Check className="size-5 text-emerald-300" aria-hidden="true" />
        ) : (
          <X className="size-5 text-red-300/80" aria-hidden="true" />
        )}
      </StateButton>

      <StateButton
        label={down ? t("down") : t("alive")}
        disabled={!editable}
        onClick={() =>
          onPatch(down ? { alive: true } : { alive: false, ready: false })
        }
      >
        <Skull
          className={cn(
            "size-5",
            down ? "text-red-300" : "text-[#9ED0FF]/30",
          )}
          aria-hidden="true"
        />
      </StateButton>

      {editable ? (
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-[#9ED0FF]/70"
              title={t("actions", { name: member.name })}
            >
              <span className="sr-only">{t("actions", { name: member.name })}</span>
              <MoreHorizontal className="size-5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1">
            <MenuItem
              icon={<Pencil className="size-4 text-[#9ED0FF]/70" />}
              onClick={() => {
                setMenuOpen(false);
                setEditingPosition(true);
              }}
            >
              {t("position")}
            </MenuItem>

            {onRank ? (
              <MenuItem
                icon={<Shield className="size-4 text-sky-300" />}
                onClick={() => {
                  setMenuOpen(false);
                  onRank(!member.lieutenant);
                }}
              >
                {member.lieutenant
                  ? t("dismissLieutenant")
                  : t("appointLieutenant")}
              </MenuItem>
            ) : null}

            {onMakeLeader ? (
              <MenuItem
                icon={<Crown className="size-4 text-amber-300" />}
                onClick={() => {
                  setMenuOpen(false);
                  onMakeLeader();
                }}
              >
                {t("makeLeader")}
              </MenuItem>
            ) : null}

            {onRemove ? (
              <MenuItem
                icon={<UserMinus className="size-4" />}
                tone="danger"
                onClick={() => {
                  setMenuOpen(false);
                  onRemove();
                }}
              >
                {t("removeMember")}
              </MenuItem>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : (
        <span className="w-8 shrink-0" />
      )}
    </li>
  );
}

/** The two states a row shows without being asked: a full-height tap target. */
function StateButton({
  label,
  disabled,
  dimmed,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  dimmed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg transition",
        disabled ? "cursor-default" : "hover:bg-[#9ED0FF]/15 active:bg-[#9ED0FF]/25",
        dimmed && "opacity-30",
      )}
    >
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

function MenuItem({
  icon,
  tone,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  tone?: "danger";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition hover:bg-[#9ED0FF]/10",
        tone === "danger" ? "text-red-300" : "text-[#CCE7FF]",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** The squad's roles, two to a row, and the way into the list that holds them. */
function RolePicker({
  squad,
  current,
  editable,
  canManage,
  onPick,
  onManage,
}: {
  squad: Squad;
  current: string;
  editable: boolean;
  canManage: boolean;
  onPick: (roleId: string) => void;
  onManage: () => void;
}) {
  const t = useTranslations("Squads");
  const [open, setOpen] = useState(false);
  const role = roleOf(squad, current);
  const title = role ? t("role", { label: role.label }) : t("noRole");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          disabled={!editable}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-lg transition",
            role ? "text-[#CCE7FF]" : "text-[#9ED0FF]/35",
            editable ? "hover:bg-[#9ED0FF]/15" : "cursor-default",
          )}
        >
          <span className="sr-only">{editable ? t("pickRole") : title}</span>
          <RoleIcon icon={role?.icon} className="size-5" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-2">
        <div className="grid grid-cols-2 gap-1">
          <RoleChip
            label={t("none")}
            selected={!current}
            onClick={() => {
              onPick("");
              setOpen(false);
            }}
          />

          {squad.roles.map((candidate) => (
            <RoleChip
              key={candidate.id}
              label={candidate.label}
              icon={
                <RoleIcon icon={candidate.icon} className="size-4 shrink-0" />
              }
              selected={candidate.id === current}
              onClick={() => {
                onPick(candidate.id);
                setOpen(false);
              }}
            />
          ))}
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onManage();
            }}
            className="mt-2 flex min-h-9 w-full items-center gap-2 border-t border-[#9ED0FF]/15 px-2 pt-2 text-sm text-[#9ED0FF]/75 transition hover:text-[#CCE7FF]"
          >
            <Tag className="size-4" aria-hidden="true" />
            {t("manageRoles")}
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function RoleChip({
  label,
  icon,
  selected,
  onClick,
}: {
  label: string;
  icon?: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-10 items-center gap-2 rounded-md px-2 text-left text-sm transition",
        selected
          ? "bg-[#9ED0FF]/20 text-[#CCE7FF]"
          : "text-[#9ED0FF]/80 hover:bg-[#9ED0FF]/10",
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}

/** Committed on Enter or on the way out; Escape gives the old value back. */
function PositionField({
  value,
  onDone,
}: {
  value: string;
  onDone: (value: string) => void;
}) {
  const t = useTranslations("Squads");
  const [draft, setDraft] = useState(value);

  return (
    <Input
      aria-label={t("position")}
      value={draft}
      maxLength={POSITION_MAX_LENGTH}
      autoFocus
      placeholder={t("positionPlaceholder")}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => onDone(draft)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(value);
          onDone(value);
        }
      }}
      className="mt-1 h-8 text-xs"
    />
  );
}
