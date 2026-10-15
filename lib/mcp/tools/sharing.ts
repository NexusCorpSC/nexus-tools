import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { eventShareTarget } from "@/lib/org-events";
import {
  disableLink,
  inviteUser,
  listInvitations,
  removeUser,
  renewLink,
  shareCandidates,
  sharePanel,
} from "@/lib/share-targets";
import { ShareError, removeShare, shareOf } from "@/lib/shares";
import { eventHref } from "@/types/org-events";
import {
  MAX_INVITES_PER_DAY,
  MAX_SHARES_PER_TARGET,
  SHARE_KINDS,
  type ShareCandidate,
  type ShareKind,
  type SharePanelData,
} from "@/types/shares";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";

/**
 * Le partage avec des joueurs précis, commun aux évènements, aux lieux privés
 * et aux collections de marqueurs : les mêmes fonctions que le panneau
 * « Partager » du site (`lib/share-targets.ts`), la cloche des invitations et
 * « Ne plus voir » (`DELETE /api/me/shares/…`). Seul qui gère l'objet le
 * partage ; un joueur se trouve par son pseudo comme dans le panneau
 * (`shareCandidates`). Le lien de partage n'existe que pour les évènements.
 */

const listChallenge = personalTool("list_shares", "players:read");
const shareChallenge = personalTool("share_with_player", "players:write");
const unshareChallenge = personalTool("unshare", "players:write");
const invitationsChallenge = personalTool("list_invitations", "players:read");
const leaveChallenge = personalTool("leave_share", "players:write");
const createLinkChallenge = personalTool("create_share_link", "players:write");
const revokeLinkChallenge = personalTool("revoke_share_link", "players:write");

const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const KIND_LABELS: Record<ShareKind, string> = {
  event: "event",
  place: "private place",
  markerCollection: "marker collection",
};

const kindInput = z
  .enum(SHARE_KINDS)
  .describe(
    "What is shared: event, place (a private place) or markerCollection",
  );

const idInput = z
  .string()
  .min(1)
  .describe(
    "The event id, the private place's slug, or the marker collection id (from list_marker_collections)",
  );

const shareEntrySchema = z.object({
  playerId: z.string(),
  name: z.string(),
  via: z.enum(["invite", "link"]),
  invitedBy: z.string().optional(),
  since: z.string(),
  seen: z.boolean(),
});

const panelSchema = {
  kind: z.enum(SHARE_KINDS),
  id: z.string(),
  title: z.string(),
  url: z.string(),
  shares: z.array(shareEntrySchema),
  org: z.object({ name: z.string(), memberCount: z.number() }).optional(),
  link: z.object({ url: z.string(), createdAt: z.string() }).optional(),
  allowLink: z.boolean(),
};

/** La fiche de l'objet sur le site. */
async function objectPath(
  kind: ShareKind,
  id: string,
  userId: string,
): Promise<string> {
  if (kind === "place") return `/lieux/${encodeURIComponent(id)}`;
  if (kind === "markerCollection") {
    return `/marqueurs?collection=${encodeURIComponent(id)}`;
  }
  const event = await eventShareTarget(id, userId);
  return eventHref({ orgId: event?.doc.orgId ?? null, id });
}

function shareError(error: unknown, what: string) {
  if (error instanceof ShareError) {
    const reason: Record<ShareError["code"], string> = {
      notFound: "it does not exist or the player cannot see it",
      forbidden: "only the one who manages it can share it",
      invalidInput: "invalid player",
      self: "the player cannot invite themselves",
      userNotFound: "this player does not exist",
      tooManyShares: `it already has ${MAX_SHARES_PER_TARGET} invited players, the limit`,
      tooManyInvites: `the player sent ${MAX_INVITES_PER_DAY} invitations in the last 24 hours, the limit`,
      noLink: "only events have a share link",
    };
    return toolError(`${what}: ${reason[error.code]}.`);
  }
  throw error;
}

/** Le panneau de partage, ou l'erreur à rendre. */
async function panelOf(
  kind: ShareKind,
  id: string,
  userId: string,
  what: string,
): Promise<
  { panel: SharePanelData } | { error: ReturnType<typeof toolError> }
> {
  try {
    return { panel: await sharePanel(kind, id, userId) };
  } catch (error) {
    return { error: shareError(error, what) };
  }
}

function panelOutput(
  kind: ShareKind,
  id: string,
  panel: SharePanelData,
  path: string,
) {
  return {
    kind,
    id,
    title: panel.title,
    url: siteUrl(path),
    shares: panel.shares.map((share) => ({
      playerId: share.userId,
      name: share.name,
      via: share.via,
      invitedBy: share.invitedByName ?? undefined,
      since: share.createdAt,
      seen: share.seen,
    })),
    org: panel.org ?? undefined,
    link: panel.link ?? undefined,
    allowLink: panel.allowLink,
  };
}

function candidateLabel(candidate: ShareCandidate): string {
  return `${candidate.name} (player: ${candidate.userId}${candidate.isFriend ? ", friend" : ""})`;
}

export function registerSharingTools(server: McpServer) {
  server.registerTool(
    "list_shares",
    {
      title: "See who something is shared with",
      description:
        "Show who one of the signed-in player's events, private places or marker collections is shared with: the players invited one by one or come through the share link, the organization whose members already see it, and the event's share link. Only for what the player manages. Player ids are what unshare takes.",
      inputSchema: z.object({ kind: kindInput, id: idInput }),
      outputSchema: z.object(panelSchema),
      annotations: READ_ONLY,
      scopeChallenge: listChallenge,
    },
    async ({ kind, id }, ctx) => {
      const user = await currentUser(ctx);
      const read = await panelOf(kind, id, user.id, "Cannot show its sharing");
      if ("error" in read) return read.error;
      const { panel } = read;
      const path = await objectPath(kind, id, user.id);
      const output = panelOutput(kind, id, panel, path);
      const lines = output.shares.map(
        (share) =>
          `- ${share.name} (player: ${share.playerId}) — ${
            share.via === "invite"
              ? `invited${share.invitedBy ? ` by ${share.invitedBy}` : ""}`
              : "came through the share link"
          } on ${share.since.slice(0, 10)}${share.seen ? "" : ", not seen yet"}`,
      );
      return toolResult(
        output,
        `Sharing of the ${KIND_LABELS[kind]} ${mdLink(panel.title, path)}:\n` +
          (panel.org
            ? `The ${panel.org.memberCount} members of ${panel.org.name} already see it.\n`
            : "") +
          (lines.length
            ? `${lines.length} players have it through sharing:\n${lines.join("\n")}`
            : "No player has it through sharing.") +
          (panel.allowLink
            ? `\n\nShare link: ${panel.link ? panel.link.url : "none"}`
            : ""),
      );
    },
  );

  server.registerTool(
    "share_with_player",
    {
      title: "Share with a player",
      description:
        "Invite a player on one of the signed-in player's events, private places or marker collections: they see it at once and get a notification. The player is found by the start of their name, friends first, as in the site's Share panel. Only for what the player manages. Asks the user to confirm first.",
      inputSchema: z.object({
        kind: kindInput,
        id: idInput,
        player: z
          .string()
          .min(1)
          .max(40)
          .describe("The player's name, or its beginning"),
        playerId: z
          .string()
          .optional()
          .describe(
            "To pick among several players of that name: the player id this tool listed",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput(panelSchema),
      annotations: WRITE,
      scopeChallenge: shareChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const read = await panelOf(
        args.kind,
        args.id,
        user.id,
        "Cannot share it",
      );
      if ("error" in read) return read.error;
      let candidates: ShareCandidate[];
      try {
        candidates = await shareCandidates(
          args.kind,
          args.id,
          user.id,
          args.player,
        );
      } catch (error) {
        return shareError(error, "Cannot share it");
      }
      const wanted = args.player.trim().toLowerCase();
      const exact = candidates.filter(
        (candidate) => candidate.name.toLowerCase() === wanted,
      );
      const pool = exact.length ? exact : candidates;
      const found = args.playerId
        ? candidates.find((candidate) => candidate.userId === args.playerId)
        : pool.length === 1
          ? pool[0]
          : undefined;
      if (!found) {
        return toolError(
          candidates.length === 0
            ? `No player whose name starts with “${args.player}”.`
            : args.playerId
              ? `Player ${args.playerId} is not among the players named “${args.player}”: ${candidates.map(candidateLabel).join(", ")}.`
              : `Several players match “${args.player}”: ${candidates.map(candidateLabel).join(", ")}. Ask the user which one, then call again with its playerId.`,
        );
      }
      if (found.hasAccess) {
        return toolError(
          `${found.name} already has the ${KIND_LABELS[args.kind]} “${read.panel.title}”.`,
        );
      }

      const summary = `Share the ${KIND_LABELS[args.kind]} “${read.panel.title}” with ${found.name}${found.isFriend ? " (friend)" : ""}: they see it at once and get a notification.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let panel: SharePanelData;
      try {
        await inviteUser(args.kind, args.id, user.id, found.userId);
        panel = await sharePanel(args.kind, args.id, user.id);
      } catch (error) {
        return shareError(error, "Nothing was shared");
      }
      const path = await objectPath(args.kind, args.id, user.id);
      return toolResult(
        {
          status: "done",
          summary,
          ...panelOutput(args.kind, args.id, panel, path),
        },
        `Done: ${found.name} now has ${mdLink(panel.title, path)}.`,
      );
    },
  );

  server.registerTool(
    "unshare",
    {
      title: "Stop sharing with a player",
      description:
        "Take a player's access away from one of the signed-in player's events, private places or marker collections, whether they were invited or came through the share link. Only for what the player manages; the players come from list_shares. Asks the user to confirm first.",
      inputSchema: z.object({
        kind: kindInput,
        id: idInput,
        player: z
          .string()
          .min(1)
          .describe("The player id from list_shares, or their exact name"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput(panelSchema),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: unshareChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const read = await panelOf(
        args.kind,
        args.id,
        user.id,
        "Cannot change its sharing",
      );
      if ("error" in read) return read.error;
      const wanted = args.player.trim().toLowerCase();
      const byId = read.panel.shares.find(
        (share) => share.userId === args.player,
      );
      const byName = read.panel.shares.filter(
        (share) => share.name.toLowerCase() === wanted,
      );
      const guest = byId ?? (byName.length === 1 ? byName[0] : undefined);
      if (!guest) {
        return toolError(
          byName.length > 1
            ? `Several players named “${args.player}” have it: pass the player id from list_shares.`
            : `${args.player} does not have “${read.panel.title}” through sharing. Those who do: ${
                read.panel.shares
                  .map((share) => `${share.name} (player: ${share.userId})`)
                  .join(", ") || "nobody"
              }.`,
        );
      }

      const summary = `Stop sharing the ${KIND_LABELS[args.kind]} “${read.panel.title}” with ${guest.name}: they no longer see it.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let panel: SharePanelData;
      try {
        await removeUser(args.kind, args.id, user.id, guest.userId);
        panel = await sharePanel(args.kind, args.id, user.id);
      } catch (error) {
        return shareError(error, "Nothing was changed");
      }
      const path = await objectPath(args.kind, args.id, user.id);
      return toolResult(
        {
          status: "done",
          summary,
          ...panelOutput(args.kind, args.id, panel, path),
        },
        `Done: ${guest.name} no longer has ${mdLink(panel.title, path)}.`,
      );
    },
  );

  server.registerTool(
    "list_invitations",
    {
      title: "List what was shared with me",
      description:
        "List the invitations the signed-in player received, newest first (the site's bell): events, private places and marker collections another player shared with them, with who invited them and a link to open each. Does not mark them seen. kind and targetId are what leave_share takes.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        total: z.number(),
        unseen: z.number(),
        invitations: z.array(
          z.object({
            kind: z.enum(SHARE_KINDS),
            targetId: z.string(),
            title: z.string(),
            invitedBy: z.string().optional(),
            invitedAt: z.string(),
            seen: z.boolean(),
            startsAt: z.string().optional(),
            orgName: z.string().optional(),
            placeType: z.string().optional(),
            parentName: z.string().optional(),
            markerCount: z.number().optional(),
            url: z.string(),
          }),
        ),
      }),
      annotations: READ_ONLY,
      scopeChallenge: invitationsChallenge,
    },
    async (_args, ctx) => {
      const user = await currentUser(ctx);
      const { invitations, unseen } = await listInvitations(user.id);
      const entries = invitations.map((invitation) => ({
        kind: invitation.kind,
        targetId: invitation.targetId,
        title: invitation.title,
        invitedBy: invitation.invitedByName || undefined,
        invitedAt: invitation.createdAt,
        seen: invitation.seen,
        startsAt: invitation.startsAt,
        orgName: invitation.orgName,
        placeType: invitation.placeType,
        parentName: invitation.parentName,
        markerCount: invitation.markerCount,
        url: siteUrl(invitation.href),
      }));
      const lines = invitations.map((invitation) => {
        const details = [
          invitation.startsAt ? `starts ${invitation.startsAt}` : undefined,
          invitation.orgName,
          invitation.placeType,
          invitation.parentName ? `in ${invitation.parentName}` : undefined,
          invitation.markerCount !== undefined
            ? `${invitation.markerCount} markers`
            : undefined,
          invitation.invitedByName
            ? `from ${invitation.invitedByName}`
            : undefined,
          invitation.seen ? undefined : "new",
        ].filter(Boolean);
        return `- ${KIND_LABELS[invitation.kind]} ${mdLink(invitation.title, invitation.href)} (${invitation.kind}: ${invitation.targetId}) — ${details.join(", ")}`;
      });
      return toolResult(
        { total: entries.length, unseen, invitations: entries },
        lines.length
          ? `${lines.length} invitations (${unseen} new):\n${lines.join("\n")}`
          : "No invitation: nothing was shared with you.",
      );
    },
  );

  server.registerTool(
    "leave_share",
    {
      title: "Stop seeing something shared with me",
      description:
        "Give up an event, private place or marker collection another player shared with the signed-in player (by invitation or through a share link): they no longer see it. A registration to an event stays. kind and targetId come from list_invitations or list_marker_collections. Asks the user to confirm first.",
      inputSchema: z.object({
        kind: kindInput,
        id: z
          .string()
          .min(1)
          .describe(
            "The shared object's id: targetId from list_invitations, or the collection id",
          ),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({ removed: z.boolean() }),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: leaveChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const share = await shareOf(args.kind, args.id, user.id);
      if (!share) {
        return toolError(
          `Nothing of kind ${args.kind} with id ${args.id} is shared with you.`,
        );
      }
      const { invitations } = await listInvitations(user.id);
      const title = invitations.find(
        (invitation) =>
          invitation.kind === args.kind && invitation.targetId === args.id,
      )?.title;
      const what = `the ${KIND_LABELS[args.kind]} ${title ? `“${title}”` : args.id}`;
      const summary = `Stop seeing ${what}, shared with you: it leaves your lists until someone shares it again.`;
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;
      const removed = await removeShare(args.kind, args.id, user.id);
      if (!removed) {
        return toolError(
          `Nothing was changed: ${what} is no longer shared with you.`,
        );
      }
      return toolResult(
        { status: "done", summary, removed: true },
        `Done: you no longer see ${what}.`,
      );
    },
  );

  server.registerTool(
    "create_share_link",
    {
      title: "Create an event share link",
      description:
        "Create the share link of one of the events the signed-in player manages: anyone who has the link can open the event, even without an account. If the event already had one, the old link stops working and those who came through it lose access unless they registered. Events only. Asks the user to confirm first.",
      inputSchema: z.object({
        eventId: z.string().min(1).describe("The event id"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput(panelSchema),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: createLinkChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const read = await panelOf(
        "event",
        args.eventId,
        user.id,
        "Cannot create its link",
      );
      if ("error" in read) return read.error;
      const { panel: before } = read;
      if (!before.allowLink) {
        return shareError(
          new ShareError("noLink", 400),
          "Cannot create its link",
        );
      }
      const comers = before.shares.filter((share) => share.via === "link");
      const summary =
        `Create a share link for the event “${before.title}”: anyone who has it can open the event.` +
        (before.link
          ? ` The current link stops working` +
            (comers.length
              ? `, and the ${comers.length} players who came through it lose access unless they registered.`
              : ".")
          : "");
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let panel: SharePanelData;
      try {
        await renewLink("event", args.eventId, user.id);
        panel = await sharePanel("event", args.eventId, user.id);
      } catch (error) {
        return shareError(error, "Nothing was changed");
      }
      const path = await objectPath("event", args.eventId, user.id);
      return toolResult(
        {
          status: "done",
          summary,
          ...panelOutput("event", args.eventId, panel, path),
        },
        `Done: the share link of ${mdLink(panel.title, path)} is ${panel.link?.url ?? "ready"}.`,
      );
    },
  );

  server.registerTool(
    "revoke_share_link",
    {
      title: "Disable an event share link",
      description:
        "Disable the share link of one of the events the signed-in player manages: the link stops working, and those who came through it lose access unless they registered. Players invited one by one keep it. Events only. Asks the user to confirm first.",
      inputSchema: z.object({
        eventId: z.string().min(1).describe("The event id"),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput(panelSchema),
      annotations: { ...WRITE, destructiveHint: true },
      scopeChallenge: revokeLinkChallenge,
    },
    async (args, ctx) => {
      const user = await currentUser(ctx);
      const read = await panelOf(
        "event",
        args.eventId,
        user.id,
        "Cannot disable its link",
      );
      if ("error" in read) return read.error;
      const { panel: before } = read;
      if (!before.link) {
        return toolError(
          `The event “${before.title}” has no active share link.`,
        );
      }
      const comers = before.shares.filter((share) => share.via === "link");
      const summary =
        `Disable the share link of the event “${before.title}”: the link stops working` +
        (comers.length
          ? `, and the ${comers.length} players who came through it lose access unless they registered.`
          : ".");
      const confirmation = confirmWrite(ctx, summary, args.confirm);
      if (!confirmation.confirmed) return confirmation.result;

      let panel: SharePanelData;
      try {
        await disableLink("event", args.eventId, user.id);
        panel = await sharePanel("event", args.eventId, user.id);
      } catch (error) {
        return shareError(error, "Nothing was changed");
      }
      const path = await objectPath("event", args.eventId, user.id);
      return toolResult(
        {
          status: "done",
          summary,
          ...panelOutput("event", args.eventId, panel, path),
        },
        `Done: the share link of ${mdLink(panel.title, path)} no longer works.`,
      );
    },
  );
}
