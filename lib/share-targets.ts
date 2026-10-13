import "server-only";

import { ObjectId } from "mongodb";
import db from "@/lib/db";
import {
  activeRegistrantIds,
  eventShareTarget,
  eventsByIds,
} from "@/lib/org-events";
import { placeShareTarget, privatePlacesBySlugs } from "@/lib/private-places";
import { siteBaseUrl } from "@/lib/site-url";
import {
  ShareError,
  activeLink,
  createLink,
  inviteToShare,
  listShares,
  myInvitations,
  removeShare,
  revokeLink,
  shares,
  userCards,
} from "@/lib/shares";
import type {
  Invitation,
  InvitationsResponse,
  ShareKind,
  SharePanelData,
} from "@/types/shares";

/**
 * Ce que chaque type d'objet dit au partage : qui peut partager, comment il
 * s'appelle, s'il a un lien, et ce qu'on garde quand le lien est désactivé.
 * Un nouveau type partageable (les marqueurs) s'ajoute ici.
 */
type Target = {
  title: string;
  canManage: boolean;
  allowLink: boolean;
  org: { name: string; memberCount: number } | null;
  /** Ceux qui gardent l'accès quand le lien est désactivé. */
  keepOnRevoke: () => string[];
};

async function resolve(
  kind: ShareKind,
  id: string,
  userId: string,
): Promise<Target> {
  if (kind === "event") {
    const found = await eventShareTarget(id, userId);
    if (!found?.canRead) throw new ShareError("notFound", 404);
    return {
      title: found.doc.title,
      canManage: found.canManage,
      allowLink: true,
      org: { name: found.orgName, memberCount: found.memberCount },
      keepOnRevoke: () => activeRegistrantIds(found.doc),
    };
  }
  const found = await placeShareTarget(id, userId);
  if (!found) throw new ShareError("notFound", 404);
  return {
    title: found.name,
    canManage: found.isOwner,
    allowLink: false,
    org: found.org
      ? { name: found.org.name, memberCount: found.org.memberCount }
      : null,
    keepOnRevoke: () => [],
  };
}

async function managed(
  kind: ShareKind,
  id: string,
  userId: string,
): Promise<Target> {
  const target = await resolve(kind, id, userId);
  if (!target.canManage) throw new ShareError("forbidden", 403);
  return target;
}

function linkUrl(token: string): string {
  return `${siteBaseUrl()}/e/${token}`;
}

/** Le panneau de partage : ses invités, son lien. */
export async function sharePanel(
  kind: ShareKind,
  id: string,
  userId: string,
): Promise<SharePanelData> {
  const target = await managed(kind, id, userId);
  const [entries, link] = await Promise.all([
    listShares(kind, id),
    target.allowLink ? activeLink(kind, id) : Promise.resolve(null),
  ]);
  return {
    title: target.title,
    shares: entries,
    link: link
      ? { url: linkUrl(link.token), createdAt: link.createdAt.toISOString() }
      : null,
    allowLink: target.allowLink,
    org: target.org,
  };
}

export async function inviteUser(
  kind: ShareKind,
  id: string,
  userId: string,
  inviteeId: unknown,
): Promise<void> {
  await managed(kind, id, userId);
  await inviteToShare(kind, id, userId, inviteeId);
}

export async function removeUser(
  kind: ShareKind,
  id: string,
  userId: string,
  guestId: string,
): Promise<void> {
  await managed(kind, id, userId);
  await removeShare(kind, id, guestId);
}

/** Un nouveau lien : l'ancien cesse de marcher. */
export async function renewLink(
  kind: ShareKind,
  id: string,
  userId: string,
): Promise<{ url: string; createdAt: string }> {
  const target = await managed(kind, id, userId);
  if (!target.allowLink) throw new ShareError("noLink", 400);
  const link = await createLink(kind, id, userId, target.keepOnRevoke());
  return { url: linkUrl(link.token), createdAt: link.createdAt.toISOString() };
}

export async function disableLink(
  kind: ShareKind,
  id: string,
  userId: string,
): Promise<void> {
  const target = await managed(kind, id, userId);
  if (!target.allowLink) throw new ShareError("noLink", 400);
  await revokeLink(kind, id, target.keepOnRevoke());
}

/**
 * Les invitations reçues, décrites. Celles dont l'objet a disparu sont
 * effacées au passage.
 */
export async function listInvitations(
  userId: string,
): Promise<InvitationsResponse> {
  const { shares: found, unseen } = await myInvitations(userId);
  const eventIds = found.filter((s) => s.kind === "event").map((s) => s.targetId);
  const placeSlugs = found
    .filter((s) => s.kind === "place")
    .map((s) => s.targetId);
  const [events, places, cards] = await Promise.all([
    eventsByIds(eventIds),
    privatePlacesBySlugs(placeSlugs),
    userCards(found.flatMap((s) => (s.invitedBy ? [s.invitedBy] : []))),
  ]);
  const eventById = new Map(events.map((event) => [String(event._id), event]));
  const placeBySlug = new Map(places.map((place) => [place.slug, place]));
  const orgNames = await orgNamesOf([
    ...new Set(events.map((event) => event.orgId)),
  ]);

  const invitations: Invitation[] = [];
  const gone: string[] = [];
  for (const share of found) {
    const invitedByName = share.invitedBy
      ? (cards.get(share.invitedBy)?.name ?? "")
      : "";
    const base = {
      id: String(share._id),
      kind: share.kind,
      targetId: share.targetId,
      invitedByName,
      createdAt: share.createdAt.toISOString(),
      seen: !!share.seenAt,
    };
    if (share.kind === "event") {
      const event = eventById.get(share.targetId);
      if (!event) {
        gone.push(String(share._id));
        continue;
      }
      invitations.push({
        ...base,
        title: event.title,
        startsAt: event.startsAt,
        orgName: orgNames.get(event.orgId),
        href: `/orgs/${event.orgId}/events/${share.targetId}`,
      });
    } else {
      const place = placeBySlug.get(share.targetId);
      if (!place) {
        gone.push(String(share._id));
        continue;
      }
      invitations.push({
        ...base,
        title: place.name,
        placeType: place.type,
        parentName: place.parentName,
        href: `/lieux/${place.slug}`,
      });
    }
  }
  if (gone.length > 0) {
    await shares().deleteMany({
      _id: { $in: gone.map((id) => new ObjectId(id)) },
    });
  }
  return { invitations, unseen: Math.max(0, unseen - gone.length) };
}

async function orgNamesOf(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const found = await db
    .db()
    .collection<{ _id: string; name: string }>("organizations")
    .find({ _id: { $in: ids } }, { projection: { name: 1 } })
    .toArray();
  return new Map(found.map((org) => [org._id, org.name]));
}
