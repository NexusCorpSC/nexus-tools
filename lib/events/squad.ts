import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import type { DbSquad } from "@/lib/squads";
import type { DbRaid } from "@/lib/raids";
import { currentSquadView } from "@/lib/squad-view";
import type { SquadView } from "@/types/squad";
import type { ProjectedChange, Topic, TopicIndex } from "./topic";

/**
 * The squad topic: the caller's `SquadView`, re-read whenever a squad or raid
 * it depends on changes.
 *
 * A user's view depends on more than their own squad: every sub-squad of the
 * raid, and every squad they are a member of (the switcher). Those ids are
 * indexed after each read, and a change is routed by id — which is what makes
 * a *removal* reach them: the update that takes a member out of a squad no
 * longer lists them, and the delete of a squad's last member carries no
 * document at all, so matching on the document's members alone would miss
 * exactly the transitions that turn a view into `{ squad: null }`.
 *
 * Two more paths bring in documents the index cannot know yet: a `join` puts
 * the user in a squad they were not in (`members.userId`), and a squad linking
 * into the raid carries `raidId` (`raids`).
 */

export type SquadParams = { squadId: string | null };

function idsOf(view: SquadView): { squads: Set<string>; raids: Set<string> } {
  const squads = new Set<string>();
  const raids = new Set<string>();

  if (view.squad) squads.add(view.squad.id);

  if (view.raid) {
    raids.add(view.raid.id);
    for (const squad of view.raid.squads) squads.add(squad.id);
  }

  for (const membership of view.memberships) {
    squads.add(membership.id);
    if (membership.raidId) raids.add(membership.raidId);
  }

  return { squads, raids };
}

function memberIdsOf(doc: ProjectedChange["fullDocument"]): string[] {
  const members = (doc as { members?: { userId?: unknown }[] } | null)?.members;
  if (!Array.isArray(members)) return [];

  return members
    .map((member) => member?.userId)
    .filter((userId): userId is string => typeof userId === "string");
}

function raidIdOf(change: ProjectedChange): string | null {
  const stored =
    (change.fullDocument as { raidId?: unknown } | null)?.raidId ??
    change.updatedFields?.raidId;

  return typeof stored === "string" ? stored : null;
}

function objectIds(ids: Iterable<string>): ObjectId[] {
  const out: ObjectId[] = [];
  for (const id of ids) if (ObjectId.isValid(id)) out.push(new ObjectId(id));
  return out;
}

/** What each watched document looked like last tick, as one comparable string. */
function squadMark(doc: Pick<DbSquad, "version" | "raidId" | "members">): string {
  return `${doc.version}|${doc.raidId ?? ""}|${doc.members.map((m) => m.userId).join(",")}`;
}

function raidMark(doc: Pick<DbRaid, "updatedAt" | "leadSquadId">): string {
  return `${doc.updatedAt}|${doc.leadSquadId}`;
}

/** The users whose view one change may have altered. */
function affected(change: ProjectedChange, index: TopicIndex): Set<string> {
  const hit = new Set<string>();

  if (change.collection === "squads") {
    const raidId = raidIdOf(change);
    const members = memberIdsOf(change.fullDocument);

    for (const [userId, entry] of index) {
      if (
        entry.squads?.has(change.id) ||
        (raidId !== null && entry.raids?.has(raidId)) ||
        members.includes(userId)
      ) {
        hit.add(userId);
      }
    }
  } else if (change.collection === "raids") {
    for (const [userId, entry] of index) {
      if (entry.raids?.has(change.id)) hit.add(userId);
    }
  }

  return hit;
}

export const squadTopic: Topic<SquadParams, SquadView> = {
  name: "squad",
  collections: ["squads", "raids"],

  snapshot(userId, params) {
    return currentSquadView(userId, params.squadId);
  },

  index(_userId, view) {
    return idsOf(view);
  },

  affected,

  async tick(index, previous) {
    const users = new Set<string>();
    const squads = new Set<string>();
    const raids = new Set<string>();

    for (const [userId, entry] of index) {
      users.add(userId);
      for (const id of entry.squads ?? []) squads.add(id);
      for (const id of entry.raids ?? []) raids.add(id);
    }

    const [squadDocs, raidDocs] = await Promise.all([
      db
        .db()
        .collection<DbSquad>("squads")
        .find(
          {
            $or: [
              { _id: { $in: objectIds(squads) } },
              { "members.userId": { $in: [...users] } },
              { raidId: { $in: [...raids] } },
            ],
          },
          { projection: { _id: 1, version: 1, raidId: 1, "members.userId": 1 } },
        )
        .toArray(),
      db
        .db()
        .collection<DbRaid>("raids")
        .find(
          { _id: { $in: objectIds(raids) } },
          { projection: { _id: 1, updatedAt: 1, leadSquadId: 1 } },
        )
        .toArray(),
    ]);

    const hit = new Set<string>();
    const seen = new Set<string>();

    const route = (change: ProjectedChange) => {
      for (const userId of affected(change, index)) hit.add(userId);
    };

    for (const doc of squadDocs) {
      const id = doc._id.toString();
      const key = `squads:${id}`;
      const mark = squadMark(doc);
      seen.add(key);

      if (previous.get(key) !== mark) {
        previous.set(key, mark);
        route({
          collection: "squads",
          operationType: "update",
          id,
          fullDocument: { raidId: doc.raidId, members: doc.members },
        });
      }
    }

    for (const doc of raidDocs) {
      const id = doc._id.toString();
      const key = `raids:${id}`;
      const mark = raidMark(doc);
      seen.add(key);

      if (previous.get(key) !== mark) {
        previous.set(key, mark);
        route({ collection: "raids", operationType: "update", id });
      }
    }

    // Gone since last tick: a squad disbanded, a raid released.
    for (const key of [...previous.keys()]) {
      if (seen.has(key)) continue;
      previous.delete(key);

      const [collection, id] = key.split(":", 2);
      route({ collection, operationType: "delete", id, fullDocument: null });
    }

    return hit;
  },
};
