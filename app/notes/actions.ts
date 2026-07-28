"use server";

import { ObjectId } from "mongodb";
import Ajv from "ajv";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { getUserNote, saveUserNote } from "@/lib/notes";
import { Note, NOTE_CONTENT_MAX_LENGTH } from "@/types/notes";

const ajv = new Ajv();

const validateContent = ajv.compile({
  type: "string",
  maxLength: NOTE_CONTENT_MAX_LENGTH,
});

async function getAuthenticatedUserId() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || !session.user) {
    throw new Error("User not authenticated");
  }

  return new ObjectId(session.user.id);
}

// Read the note of the current user (used by the side panel on open)
export async function getNoteAction(): Promise<Note> {
  const userId = await getAuthenticatedUserId();

  return getUserNote(userId);
}

// Create or update the note of the current user
export async function saveNoteAction(content: string): Promise<Note> {
  const userId = await getAuthenticatedUserId();

  if (!validateContent(content)) {
    console.warn({
      errors: validateContent.errors,
      message: "Invalid note content",
    });
    throw new Error("Invalid note content");
  }

  const note = await saveUserNote(userId, content);

  revalidatePath("/notes");

  return note;
}
