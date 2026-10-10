import "server-only";
import {
  CLIENT_CAPABILITIES_META_KEY,
  inputRequired,
  inputResponse,
  type CallToolResult,
  type InputRequiredResult,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { z } from "zod";
import { toolResult } from "./format";

/**
 * Les écritures des outils MCP (inventaire, contributions, commandes…) sont
 * toujours confirmées par le joueur avant d'avoir lieu.
 *
 * Un client qui sait demander une saisie (élicitation, protocole 2026-07-28)
 * reçoit une demande de confirmation : l'outil répond `input_required`, le
 * client montre le résumé au joueur et rappelle l'outil avec sa réponse. Les
 * autres (protocole 2025 : la route, sans état, ne peut pas leur envoyer de
 * requête) reçoivent le résumé en réponse, rien n'est fait, et l'assistant
 * rappelle l'outil avec `confirm: true` une fois que le joueur a dit oui.
 */

export const WRITE_STATUSES = [
  "done",
  "confirmation_required",
  "cancelled",
] as const;

/** Le schéma de sortie d'un outil qui écrit : son statut, puis ce qu'il rend une fois fait. */
export function writeOutput<T extends z.ZodRawShape>(shape: T) {
  return z.object({
    status: z.enum(WRITE_STATUSES),
    summary: z.string(),
    ...z.object(shape).partial().shape,
  });
}

/** Le paramètre `confirm` de chaque outil qui écrit. */
export const confirmParam = z
  .boolean()
  .optional()
  .describe(
    "Only for clients that cannot show a confirmation form: set to true after the user approved the summary this tool returned. Ignored when the client supports elicitation.",
  );

const confirmationSchema = z.object({
  confirm: z
    .boolean()
    .default(true)
    .describe("Confirm this change to your Nexus Tools account"),
});

export function supportsElicitation(ctx: ServerContext): boolean {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const capabilities = envelope?.[CLIENT_CAPABILITIES_META_KEY] as
    | { elicitation?: { form?: unknown } & Record<string, unknown> }
    | undefined;
  const elicitation = capabilities?.elicitation;
  // `elicitation: {}` vaut le formulaire (règle d'avant les modes).
  return (
    !!elicitation &&
    (elicitation.form !== undefined || Object.keys(elicitation).length === 0)
  );
}

export type Confirmation =
  | { confirmed: true }
  | { confirmed: false; result: CallToolResult | InputRequiredResult };

/**
 * Demande au joueur de confirmer `summary` — une phrase qui dit exactement ce
 * qui va changer. `{ confirmed: true }` : l'outil peut écrire. Sinon, l'outil
 * rend `result` tel quel.
 */
export function confirmWrite(
  ctx: ServerContext,
  summary: string,
  confirm: boolean | undefined,
): Confirmation {
  if (supportsElicitation(ctx)) {
    const response = inputResponse(ctx.mcpReq.inputResponses, "confirm");
    if (response.kind === "missing") {
      return {
        confirmed: false,
        result: inputRequired({
          inputRequests: {
            confirm: inputRequired.elicit({
              message: summary,
              requestedSchema: confirmationSchema,
            }),
          },
        }),
      };
    }
    if (
      response.kind === "elicit" &&
      response.action === "accept" &&
      response.content?.confirm !== false
    ) {
      return { confirmed: true };
    }
    return {
      confirmed: false,
      result: toolResult(
        { status: "cancelled", summary },
        `The user declined: nothing was changed.\n\n${summary}`,
      ),
    };
  }

  if (confirm === true) return { confirmed: true };
  return {
    confirmed: false,
    result: toolResult(
      { status: "confirmation_required", summary },
      `${summary}\n\nNothing was changed yet. Show this to the user and ask them to confirm; once they agree, call this tool again with the same arguments and confirm: true.`,
    ),
  };
}
