import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { EMPTY_NOTE, Note } from "@/types/notes";

// One note per user: the userId is the natural key of the collection, and a
// unique index holds the rule (`scripts/ensure-indexes.ts`).
export interface DbNote {
  userId: ObjectId;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export async function getUserNote(userId: ObjectId): Promise<Note> {
  const note = await db
    .db()
    .collection<DbNote>("notes")
    .findOne({ userId }, { projection: { _id: 0 } });

  if (!note) {
    return EMPTY_NOTE;
  }

  return { content: note.content, updatedAt: note.updatedAt };
}

export async function saveUserNote(
  userId: ObjectId,
  content: string,
): Promise<Note> {
  const updatedAt = new Date().toISOString();

  await db
    .db()
    .collection<DbNote>("notes")
    .updateOne(
      { userId },
      {
        $set: { content, updatedAt },
        $setOnInsert: { userId, createdAt: updatedAt },
      },
      { upsert: true },
    );

  return { content, updatedAt };
}
