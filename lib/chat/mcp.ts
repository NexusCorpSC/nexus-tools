import "server-only";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolApprovalStatus, ToolSet } from "ai";
import { auth } from "@/lib/auth";
import { POST as mcpRoute } from "@/app/mcp/route";
import {
  MCP_SCOPES,
  OIDC_SCOPES,
  mcpResource,
  oauthIssuer,
} from "@/lib/mcp/oauth-config";

/**
 * Les outils de Nexus Chat : ceux du serveur MCP du site, sans en dupliquer
 * une ligne. Le chat est un client MCP comme Claude.ai ou VS Code, au nom du
 * joueur connecté, avec les mêmes contrôles.
 *
 * - Pas de réseau : les requêtes du client vont droit au gestionnaire de la
 *   route `/mcp`, dans le même processus.
 * - Le jeton est un JWT court signé par le site pour le joueur, comme ceux de
 *   l'OAuth (audience `/mcp`), avec toutes les portées : le joueur a ouvert
 *   le chat sur son propre compte.
 * - Les écritures restent confirmées. Le client MCP de l'AI SDK ne sait pas
 *   répondre aux demandes de saisie du protocole 2026-07-28 : il se présente
 *   sans élicitation, et le serveur passe par le paramètre `confirm`
 *   (`lib/mcp/confirm.ts`). Le chat retire ce paramètre de ce que voit le
 *   modèle ; avant d'exécuter un outil qui écrit, il l'appelle sans `confirm`
 *   pour obtenir le résumé du serveur (rien n'est écrit), le montre au joueur
 *   avec Confirmer / Refuser (`toolApproval`), et ne rappelle l'outil avec
 *   `confirm: true` qu'après son accord.
 */

/** Le nom sous lequel le chat se présente au serveur MCP et dans ses journaux. */
export const CHAT_CLIENT_ID = "nexus-chat";

/** Durée de vie du jeton du chat : une réponse, outils compris. */
const TOKEN_TTL_SECONDS = 10 * 60;

async function chatToken(userId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const { token } = await auth.api.signJWT({
    body: {
      payload: {
        sub: userId,
        iss: oauthIssuer(),
        aud: mcpResource(),
        azp: CHAT_CLIENT_ID,
        client_id: CHAT_CLIENT_ID,
        scope: [...OIDC_SCOPES, ...MCP_SCOPES].join(" "),
        iat: now,
        exp: now + TOKEN_TTL_SECONDS,
      },
    },
  });
  return token;
}

/** Un `fetch` qui sert les requêtes du client MCP par la route, sans réseau. */
const inProcessFetch: typeof fetch = async (input, init) =>
  mcpRoute(new Request(input, init));

export interface ChatTools {
  client: MCPClient;
  tools: ToolSet;
  /** Avant chaque appel : faut-il la confirmation du joueur, et sur quel résumé. */
  approval: (toolName: string, input: unknown) => Promise<ToolApprovalStatus>;
}

interface ToolDefinition {
  name: string;
  inputSchema: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  } & Record<string, unknown>;
  _meta?: { ui?: { visibility?: string[] } } & Record<string, unknown>;
}

/** Un outil réservé aux vues MCP Apps (bouton d'une vue), que le modèle ne voit pas. */
function appOnly(definition: ToolDefinition): boolean {
  const visibility = definition._meta?.ui?.visibility;
  return Array.isArray(visibility) && !visibility.includes("model");
}

/** Le texte d'un résultat d'outil MCP. */
function resultText(result: unknown): string {
  const raw = (result as { content?: unknown } | null)?.content;
  const content = Array.isArray(raw) ? raw : [];
  return content
    .filter(
      (block): block is { type: "text"; text: string } =>
        !!block &&
        typeof block === "object" &&
        (block as { type?: unknown }).type === "text" &&
        typeof (block as { text?: unknown }).text === "string",
    )
    .map((block) => block.text)
    .join("\n");
}

/** Ouvre le client MCP du chat pour `userId`. À fermer en fin de réponse. */
export async function openChatTools(userId: string): Promise<ChatTools> {
  const client = await createMCPClient({
    name: CHAT_CLIENT_ID,
    transport: {
      type: "http",
      url: mcpResource(),
      headers: { Authorization: `Bearer ${await chatToken(userId)}` },
      fetch: inProcessFetch,
    },
  });

  try {
    const definitions: ToolDefinition[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(
        cursor ? { params: { cursor } } : undefined,
      );
      definitions.push(...(page.tools as ToolDefinition[]));
      cursor = page.nextCursor;
    } while (cursor);

    const visible = definitions.filter((definition) => !appOnly(definition));
    const writes = new Set(
      visible
        .filter((definition) => definition.inputSchema.properties?.confirm)
        .map((definition) => definition.name),
    );

    // Ce que voit le modèle : les outils, sans le paramètre `confirm`.
    const stripped = visible.map((definition) => {
      if (!writes.has(definition.name)) return definition;
      const properties = { ...definition.inputSchema.properties };
      delete properties.confirm;
      return {
        ...definition,
        inputSchema: {
          ...definition.inputSchema,
          properties,
          required: definition.inputSchema.required?.filter(
            (name) => name !== "confirm",
          ),
        },
      };
    });

    const converted = client.toolsFromDefinitions({
      tools: stripped,
    } as Parameters<MCPClient["toolsFromDefinitions"]>[0]);

    const tools: ToolSet = {};
    for (const [name, tool] of Object.entries(converted)) {
      if (!writes.has(name) || !tool.execute) {
        tools[name] = tool;
        continue;
      }
      const execute = tool.execute;
      // Atteint seulement après l'accord du joueur (`approval` ci-dessous).
      tools[name] = {
        ...tool,
        execute: (input, options) =>
          execute({ ...(input as object), confirm: true }, options),
      };
    }

    const approval = async (
      toolName: string,
      input: unknown,
    ): Promise<ToolApprovalStatus> => {
      if (!writes.has(toolName)) return "not-applicable";
      // L'outil appelé sans `confirm` rend le résumé de ce qu'il ferait, sans
      // rien écrire.
      const preview = await client.callTool({
        name: toolName,
        arguments: (input ?? {}) as Record<string, unknown>,
      });
      const { isError, structuredContent } = preview as {
        isError?: boolean;
        structuredContent?: { status?: unknown; summary?: unknown };
      };
      const status = structuredContent?.status;
      const summary = structuredContent?.summary;
      if (!isError && status === "confirmation_required") {
        return {
          type: "user-approval",
          reason: typeof summary === "string" ? summary : resultText(preview),
        };
      }
      // Une erreur (argument refusé, stock épuisé…) : rien à confirmer, le
      // modèle reçoit la raison.
      return {
        type: "denied",
        reason: resultText(preview) || "The tool refused this call.",
      };
    };

    return { client, tools, approval };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}
