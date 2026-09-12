import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { getUserNote, type DbNote } from "@/lib/notes";
import type { Note } from "@/types/notes";
import type { ProjectedChange, Topic } from "./topic";

/**
 * The note topic: the caller's scratch pad, re-read whenever their note is
 * written — from the site, the desktop app, or another device.
 *
 * One note per user, keyed by `userId`, so nothing needs indexing: a change
 * concerns the one user the document names. `updateLookup` puts that field on
 * update events; the upsert that writes a note is an insert the first time
 * and an update after, and both carry it.
 */

export type NoteParams = Record<never, never>;

function userIdOf(change: ProjectedChange): string | null {
  const userId = (change.fullDocument as { userId?: unknown } | null)?.userId;

  if (userId instanceof ObjectId) return userId.toString();
  if (typeof userId === "string") return userId;

  return null;
}

export const noteTopic: Topic<NoteParams, Note> = {
  name: "note",
  collections: ["notes"],

  snapshot(userId) {
    return getUserNote(new ObjectId(userId));
  },

  index() {
    return {};
  },

  affected(change, index) {
    const hit = new Set<string>();
    const userId = userIdOf(change);

    if (userId !== null && index.has(userId)) hit.add(userId);

    return hit;
  },

  async tick(index, previous) {
    const users = [...index.keys()].filter((id) => ObjectId.isValid(id));

    const docs = await db
      .db()
      .collection<DbNote>("notes")
      .find(
        { userId: { $in: users.map((id) => new ObjectId(id)) } },
        { projection: { _id: 0, userId: 1, updatedAt: 1 } },
      )
      .toArray();

    const hit = new Set<string>();

    for (const doc of docs) {
      const userId = doc.userId.toString();
      const key = `notes:${userId}`;

      if (previous.get(key) !== doc.updatedAt) {
        previous.set(key, doc.updatedAt);
        hit.add(userId);
      }
    }

    return hit;
  },
};
