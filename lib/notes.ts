import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import { EMPTY_NOTE, Note } from "@/types/notes";

// One note per user: the userId is the natural key of the collection
export interface DbNote {
  userId: ObjectId;
  content: string;
  createdAt: string;
  updatedAt: string;
}

let indexesPromise: Promise<unknown> | null = null;

// Enforce the "one note per user" rule at the database level. Runs once per
// process, failures are not fatal (the upsert filter already targets one note).
export async function ensureNotesIndexes() {
  if (!indexesPromise) {
    indexesPromise = db
      .db()
      .collection<DbNote>("notes")
      .createIndex({ userId: 1 }, { unique: true })
      .catch((error) => {
        indexesPromise = null;
        console.warn({ error, message: "Could not create notes index" });
      });
  }

  return indexesPromise;
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
  await ensureNotesIndexes();

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
