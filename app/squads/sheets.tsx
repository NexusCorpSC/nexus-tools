"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Copy,
  Crown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Unlink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  RAID_MAX_SQUADS,
  ROLE_LABEL_MAX_LENGTH,
  SQUAD_ROLE_ICON_GROUPS,
  type RaidView,
  type Squad,
  type SquadRoleIcon,
} from "@/types/squad";
import { RoleIcon } from "./role-icon";
import { CodeChip, ConfirmButton } from "./widgets";

/**
 * On a phone the sheet rises from the bottom and takes the width, the way a
 * native sheet does; from `sm` up it is the ordinary centred dialog.
 */
const SHEET =
  "max-h-[calc(100dvh-2rem)] overflow-y-auto border-[#9ED0FF]/20 bg-[#0B3A5A] max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:data-[state=open]:slide-in-from-bottom-4 max-sm:data-[state=closed]:slide-out-to-bottom-4";

/* ------------------------------------------------------------------ */
/* Roles                                                               */
/* ------------------------------------------------------------------ */

type Draft = {
  /** `null` while inventing one; the role's id while editing it. */
  id: string | null;
  label: string;
  icon: SquadRoleIcon;
  group: string;
};

function groupOf(icon: SquadRoleIcon): string {
  const group = SQUAD_ROLE_ICON_GROUPS.find((candidate) =>
    (candidate.icons as readonly string[]).includes(icon),
  );

  return group?.id ?? SQUAD_ROLE_ICON_GROUPS[0].id;
}

/** The squad's own list of jobs: rename, re-draw, invent, remove. */
export function RolesSheet({
  squad,
  editable,
  busy,
  onAdd,
  onEdit,
  onRemove,
  onClose,
}: {
  squad: Squad;
  editable: boolean;
  busy: boolean;
  onAdd: (label: string, icon: SquadRoleIcon) => Promise<boolean>;
  onEdit: (
    roleId: string,
    patch: { label: string; icon: SquadRoleIcon },
  ) => Promise<boolean>;
  onRemove: (roleId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Squads");
  const [draft, setDraft] = useState<Draft | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={SHEET}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {draft ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDraft(null)}
                title={t("back")}
              >
                <span className="sr-only">{t("back")}</span>
                <ArrowLeft className="size-4" />
              </Button>
            ) : null}
            {draft ? (draft.id ? t("editRole") : t("newRole")) : t("roles")}
          </DialogTitle>
          {!draft ? (
            <DialogDescription>{t("rolesIntro")}</DialogDescription>
          ) : null}
        </DialogHeader>

        {draft ? (
          <RoleEditor
            draft={draft}
            busy={busy}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={async () => {
              const label = draft.label.trim();
              if (!label) return;

              const saved = draft.id
                ? await onEdit(draft.id, { label, icon: draft.icon })
                : await onAdd(label, draft.icon);

              if (saved) setDraft(null);
            }}
          />
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-[#9ED0FF]/10">
              {squad.roles.map((role) => (
                <li key={role.id} className="flex min-h-11 items-center gap-3">
                  <RoleIcon icon={role.icon} className="size-5 shrink-0 text-[#CCE7FF]" />
                  <span className="min-w-0 flex-1 truncate text-sm text-[#CCE7FF]">
                    {role.label}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-[#9ED0FF]/40">
                    {role.base ? t("baseRole") : t("customRole")}
                  </span>

                  {editable ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t("editRoleNamed", { label: role.label })}
                      onClick={() =>
                        setDraft({
                          id: role.id,
                          label: role.label,
                          icon: role.icon,
                          group: groupOf(role.icon),
                        })
                      }
                    >
                      <span className="sr-only">
                        {t("editRoleNamed", { label: role.label })}
                      </span>
                      <Pencil className="size-4" />
                    </Button>
                  ) : null}

                  {editable && !role.base ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-red-300 hover:bg-red-500/20 hover:text-red-200"
                      title={t("deleteRole", { label: role.label })}
                      disabled={busy}
                      onClick={() => onRemove(role.id)}
                    >
                      <span className="sr-only">
                        {t("deleteRole", { label: role.label })}
                      </span>
                      <Trash2 className="size-4" />
                    </Button>
                  ) : editable ? (
                    <span className="size-8 shrink-0" />
                  ) : null}
                </li>
              ))}
            </ul>

            {editable ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setDraft({
                    id: null,
                    label: "",
                    icon: "crosshair",
                    group: "combat",
                  })
                }
              >
                <Plus />
                {t("newRole")}
              </Button>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A name, and a glyph out of the bank — nothing else makes a role. */
function RoleEditor({
  draft,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  busy: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const t = useTranslations("Squads");
  const group =
    SQUAD_ROLE_ICON_GROUPS.find((candidate) => candidate.id === draft.group) ??
    SQUAD_ROLE_ICON_GROUPS[0];
  const named = Boolean(draft.label.trim());

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="role-label">{t("roleName")}</Label>
        <Input
          id="role-label"
          value={draft.label}
          maxLength={ROLE_LABEL_MAX_LENGTH}
          autoFocus
          placeholder={t("roleNamePlaceholder")}
          onChange={(event) => onChange({ ...draft, label: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>{t("icon")}</Label>

        <div className="flex flex-wrap gap-1.5">
          {SQUAD_ROLE_ICON_GROUPS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => onChange({ ...draft, group: candidate.id })}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition",
                candidate.id === group.id
                  ? "bg-[#9ED0FF]/25 text-[#CCE7FF]"
                  : "bg-[#061E30]/60 text-[#9ED0FF]/70 hover:text-[#CCE7FF]",
              )}
            >
              {t(`roleGroups.${candidate.id}`)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
          {group.icons.map((icon) => (
            <button
              key={icon}
              type="button"
              title={icon}
              onClick={() => onChange({ ...draft, icon })}
              className={cn(
                "flex h-11 items-center justify-center rounded-md border transition",
                icon === draft.icon
                  ? "border-[#9ED0FF]/60 bg-[#9ED0FF]/20 text-[#CCE7FF]"
                  : "border-[#9ED0FF]/15 bg-[#061E30]/50 text-[#9ED0FF]/70 hover:text-[#CCE7FF]",
              )}
            >
              <span className="sr-only">{icon}</span>
              <RoleIcon icon={icon} className="size-5" />
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={!named || busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* The raid                                                            */
/* ------------------------------------------------------------------ */

/**
 * What the raid is made of: link a squad in by code, start one, put one out —
 * or open one, empty but for its organiser, for the players still to come.
 *
 * Commanding your own squad is enough to take it in or out. The rest — the
 * unlinking of somebody else's squad, the opening of a new one — asks for the
 * lead squad, and the buttons simply do not appear otherwise.
 */
export function RaidSheet({
  squad,
  raid,
  userId,
  editable,
  busy,
  onStart,
  onEnter,
  onQuit,
  onUnlink,
  onOpenSquad,
  onSwitch,
  onClose,
}: {
  squad: Squad;
  raid: RaidView | null;
  userId: string;
  editable: boolean;
  busy: boolean;
  onStart: () => void;
  onEnter: (code: string) => Promise<boolean>;
  onQuit: () => void;
  onUnlink: (squadId: string) => void;
  onOpenSquad: () => void;
  onSwitch: (squadId: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("Squads");
  const [code, setCode] = useState("");

  const leads = Boolean(raid && raid.leadSquadId === squad.id && editable);
  const full = Boolean(raid && raid.squads.length >= RAID_MAX_SQUADS);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={SHEET}>
        <DialogHeader>
          <DialogTitle>{raid ? t("manageRaid") : t("createRaid")}</DialogTitle>
          <DialogDescription>{t("raidIntro")}</DialogDescription>
        </DialogHeader>

        {raid ? (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-[#9ED0FF]/60">
                  {t("linkedSquads")}
                </span>
                <span className="text-xs text-[#9ED0FF]/50">
                  {raid.squads.length} ·{" "}
                  {t("players", {
                    count: raid.squads.reduce(
                      (total, sub) => total + sub.members.length,
                      0,
                    ),
                  })}
                </span>
              </div>

              <ul className="space-y-1.5">
                {raid.squads.map((sub) => {
                  const mine = sub.members.some(
                    (member) => member.userId === userId,
                  );

                  return (
                    <li
                      key={sub.id}
                      className="flex min-h-11 items-center gap-2 rounded-lg border border-[#9ED0FF]/15 bg-[#061E30]/50 px-3 py-1.5"
                    >
                      <span
                        className={cn(
                          "min-w-0 truncate text-sm font-semibold",
                          mine ? "text-[#CCE7FF]" : "text-[#9ED0FF]",
                        )}
                      >
                        {sub.name}
                      </span>

                      {raid.leadSquadId === sub.id ? (
                        <span title={t("leadSquad")}>
                          <Crown className="size-4 shrink-0 text-amber-300" aria-hidden="true" />
                          <span className="sr-only">{t("leadSquad")}</span>
                        </span>
                      ) : null}

                      <span className="min-w-0 flex-1 truncate text-xs text-[#9ED0FF]/60">
                        {t("players", { count: sub.members.length })}
                      </span>

                      {/* Only the codes of the squads you are in are yours to hand out. */}
                      {mine ? <CodeChip code={sub.code} /> : null}

                      {mine && sub.id !== squad.id ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title={t("switchTo", { name: sub.name })}
                          onClick={() => onSwitch(sub.id)}
                        >
                          <span className="sr-only">
                            {t("switchTo", { name: sub.name })}
                          </span>
                          <ArrowLeftRight className="size-4" />
                        </Button>
                      ) : null}

                      {leads && sub.id !== squad.id ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-red-300 hover:bg-red-500/20 hover:text-red-200"
                          title={t("unlink", { name: sub.name })}
                          disabled={busy}
                          onClick={() => onUnlink(sub.id)}
                        >
                          <span className="sr-only">
                            {t("unlink", { name: sub.name })}
                          </span>
                          <Unlink className="size-4" />
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>

            {leads ? (
              <div className="space-y-1">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy || full}
                  title={full ? t("raidFull", { max: RAID_MAX_SQUADS }) : undefined}
                  onClick={onOpenSquad}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                  {t("newSquad")}
                </Button>
                <p className="text-xs text-[#9ED0FF]/60">
                  {full
                    ? t("raidFull", { max: RAID_MAX_SQUADS })
                    : t("newSquadHint")}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9ED0FF]/10 pt-3">
              <p className="flex items-center gap-2 text-sm text-[#9ED0FF]/70">
                <Copy className="size-4" aria-hidden="true" />
                {t("raidCode")}
                <CodeChip code={raid.code} tone="raid" />
              </p>

              {editable ? (
                <ConfirmButton
                  variant="outline"
                  size="sm"
                  className="border-red-300/40 text-red-300 hover:bg-red-500/20 hover:text-red-200"
                  confirmLabel={t("leaveRaidConfirm", { name: squad.name })}
                  disabled={busy}
                  onConfirm={() => {
                    onQuit();
                    onClose();
                  }}
                >
                  <Unlink />
                  {t("leaveRaid")}
                </ConfirmButton>
              ) : null}
            </div>
          </div>
        ) : editable ? (
          <div className="space-y-4">
            <Button className="w-full sm:w-auto" disabled={busy} onClick={onStart}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />}
              {t("createRaid")}
            </Button>

            <form
              className="flex items-center gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const typed = code.trim();
                if (typed && (await onEnter(typed))) onClose();
              }}
            >
              <Input
                aria-label={t("raidCode")}
                value={code}
                placeholder={t("codePlaceholder")}
                spellCheck={false}
                autoCapitalize="characters"
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                className="font-mono uppercase tracking-widest"
              />
              <Button type="submit" variant="secondary" disabled={busy || !code.trim()}>
                {t("linkSquad")}
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-[#9ED0FF]/70">{t("onlyCommandersRaid")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
