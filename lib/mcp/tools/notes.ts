import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getUserNote, saveUserNote } from "@/lib/notes";
import { NOTE_CONTENT_MAX_LENGTH } from "@/types/notes";
import { currentUser, personalTool } from "../auth";
import { confirmParam, confirmWrite, writeOutput } from "../confirm";
import { mdLink, READ_ONLY, siteUrl, toolError, toolResult } from "../format";

/**
 * Le bloc-notes du joueur : une seule note par compte, la même que la page
 * `/notes`, le panneau latéral et l'app (`lib/notes.ts`), avec la même taille
 * maximale.
 */

const NOTES_PATH = "/notes";

const getChallenge = personalTool("get_notes", "notes:read");
const updateChallenge = personalTool("update_notes", "notes:write");

/** Ce qu'un résumé de confirmation montre d'un texte, au plus. */
const PREVIEW_LENGTH = 1500;

function preview(text: string) {
  return text.length > PREVIEW_LENGTH
    ? `“${text.slice(0, PREVIEW_LENGTH)}…” (${text.length} characters in all)`
    : `“${text}”`;
}

export function registerNoteTools(server: McpServer) {
  server.registerTool(
    "get_notes",
    {
      title: "Read my notes",
      description: `Read the signed-in player's scratch pad (one free-text note per account, the one of the site's Notes page and side panel), with when it was last saved. It holds at most ${NOTE_CONTENT_MAX_LENGTH} characters.`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        content: z.string(),
        updatedAt: z.string().optional(),
        length: z.number(),
        maxLength: z.number(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
      scopeChallenge: getChallenge,
    },
    async (_args, ctx) => {
      const user = await currentUser(ctx);
      const note = await getUserNote(new ObjectId(user.id));
      return toolResult(
        {
          content: note.content,
          updatedAt: note.updatedAt ?? undefined,
          length: note.content.length,
          maxLength: NOTE_CONTENT_MAX_LENGTH,
          url: siteUrl(NOTES_PATH),
        },
        note.content
          ? `${mdLink("Your notes", NOTES_PATH)} (last saved ${note.updatedAt}):\n\n${note.content}`
          : `${mdLink("Your notes", NOTES_PATH)} are empty.`,
      );
    },
  );

  server.registerTool(
    "update_notes",
    {
      title: "Write in my notes",
      description: `Write in the signed-in player's scratch pad. mode "append" (default) adds the text at the end, on a new line; "replace" replaces the whole note (an empty text clears it). The note holds at most ${NOTE_CONTENT_MAX_LENGTH} characters. Asks the user to confirm first.`,
      inputSchema: z.object({
        content: z.string().max(NOTE_CONTENT_MAX_LENGTH),
        mode: z.enum(["append", "replace"]).optional(),
        confirm: confirmParam,
      }),
      outputSchema: writeOutput({
        length: z.number(),
        updatedAt: z.string(),
        url: z.string(),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopeChallenge: updateChallenge,
    },
    async ({ content, mode = "append", confirm }, ctx) => {
      const user = await currentUser(ctx);
      const userId = new ObjectId(user.id);
      const current = (await getUserNote(userId)).content;

      let next: string;
      let summary: string;
      if (mode === "append") {
        if (!content.trim()) return toolError("Nothing to add.");
        const separator = current && !current.endsWith("\n") ? "\n" : "";
        next = current + separator + content;
        summary = `Add to the end of ${user.name}'s notes: ${preview(content)}`;
      } else {
        if (content === current) return toolError("Nothing to change.");
        next = content;
        summary = content
          ? `Replace the whole of ${user.name}'s notes (${current.length} characters now) with: ${preview(content)}`
          : `Clear ${user.name}'s notes (${current.length} characters now).`;
      }
      if (next.length > NOTE_CONTENT_MAX_LENGTH) {
        return toolError(
          `Nothing was saved: the notes would hold ${next.length} characters, more than the ${NOTE_CONTENT_MAX_LENGTH} allowed (${current.length} now). Shorten the text, or rewrite the note with mode "replace".`,
        );
      }

      const confirmation = confirmWrite(ctx, summary, confirm);
      if (!confirmation.confirmed) return confirmation.result;

      const note = await saveUserNote(userId, next);
      try {
        revalidatePath(NOTES_PATH);
      } catch {
        // Hors d'une requête Next (tests) : rien à rafraîchir.
      }
      return toolResult(
        {
          status: "done",
          summary,
          length: note.content.length,
          updatedAt: note.updatedAt ?? new Date().toISOString(),
          url: siteUrl(NOTES_PATH),
        },
        `Done: ${mdLink("your notes", NOTES_PATH)} now hold ${note.content.length} characters.`,
      );
    },
  );
}
