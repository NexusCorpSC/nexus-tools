import type {
  SquadMemberPatch,
  SquadRoleIcon,
  SquadView,
} from "@/types/squad";

/**
 * The squad routes, called from the browser — the same ones the desktop
 * overlay calls, with the session cookie doing the rest.
 *
 * Every call answers the whole view, which is what lets the page show the
 * result of a tap without waiting for its next poll. `squadId` says which of
 * the caller's squads is meant; `null` leaves the choice to the API, which
 * picks the longest-standing membership — the only one, for nearly everybody.
 */

function at(path: string, squadId: string | null): string {
  return squadId ? `${path}?squad=${encodeURIComponent(squadId)}` : path;
}

async function call(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<SquadView> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
    credentials: "same-origin",
  });

  const answer = (await response.json().catch(() => null)) as
    | (Partial<SquadView> & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(answer?.error ?? `HTTP ${response.status}`);
  }

  return {
    squad: answer?.squad ?? null,
    raid: answer?.raid ?? null,
    memberships: answer?.memberships ?? [],
  };
}

export const squadApi = {
  read: (squadId: string | null) => call(at("/api/squads", squadId)),

  create: (name?: string) =>
    call("/api/squads", { method: "POST", body: { name } }),
  join: (code: string) =>
    call("/api/squads/join", { method: "POST", body: { code } }),
  leave: (squadId: string) =>
    call(at("/api/squads/leave", squadId), { method: "POST" }),
  rename: (squadId: string, name: string) =>
    call(at("/api/squads", squadId), { method: "PATCH", body: { name } }),
  announce: (squadId: string, announcements: string) =>
    call(at("/api/squads/announcements", squadId), {
      method: "PATCH",
      body: { announcements },
    }),

  patchMember: (squadId: string, userId: string, patch: SquadMemberPatch) =>
    call(at(`/api/squads/members/${encodeURIComponent(userId)}`, squadId), {
      method: "PATCH",
      body: patch,
    }),
  removeMember: (squadId: string, userId: string) =>
    call(at(`/api/squads/members/${encodeURIComponent(userId)}`, squadId), {
      method: "DELETE",
    }),
  makeLeader: (squadId: string, userId: string) =>
    call(at("/api/squads/leader", squadId), {
      method: "PATCH",
      body: { userId },
    }),

  addRole: (squadId: string, label: string, icon: SquadRoleIcon) =>
    call(at("/api/squads/roles", squadId), {
      method: "POST",
      body: { label, icon },
    }),
  editRole: (
    squadId: string,
    roleId: string,
    patch: { label?: string; icon?: SquadRoleIcon },
  ) =>
    call(at(`/api/squads/roles/${encodeURIComponent(roleId)}`, squadId), {
      method: "PATCH",
      body: patch,
    }),
  removeRole: (squadId: string, roleId: string) =>
    call(at(`/api/squads/roles/${encodeURIComponent(roleId)}`, squadId), {
      method: "DELETE",
    }),

  createRaid: (squadId: string, name?: string) =>
    call(at("/api/squads/raid", squadId), { method: "POST", body: { name } }),
  joinRaid: (squadId: string, code: string) =>
    call(at("/api/squads/raid/join", squadId), {
      method: "POST",
      body: { code },
    }),
  updateRaid: (squadId: string, patch: { name?: string; announcement?: string }) =>
    call(at("/api/squads/raid", squadId), { method: "PATCH", body: patch }),
  leaveRaid: (squadId: string) =>
    call(at("/api/squads/raid", squadId), { method: "DELETE" }),
  unlinkSquad: (squadId: string, targetSquadId: string) =>
    call(
      at(`/api/squads/raid/squads/${encodeURIComponent(targetSquadId)}`, squadId),
      { method: "DELETE" },
    ),
  openRaidSquad: (squadId: string, name?: string) =>
    call(at("/api/squads/raid/squads", squadId), {
      method: "POST",
      body: { name },
    }),
};
