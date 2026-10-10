import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  MCP_CACHE_HINTS,
  MCP_INSTRUCTIONS,
  MCP_SERVER_INFO,
  registerNexusServer,
} from "@/lib/mcp/server";
import {
  PERSONAL_TOOLS,
  personalToolsCalled,
  verifyMcpToken,
} from "@/lib/mcp/auth";
import {
  describeMcpRequest,
  logMcpEvent,
  logMcpRequest,
} from "@/lib/mcp/logging";
import { mcpResource } from "@/lib/mcp/oauth-config";

/**
 * Le serveur MCP (https://modelcontextprotocol.io), en Streamable HTTP.
 *
 * `mcp-handler` 2 sert la spec 2026-07-28 (sans état) et, depuis la même route,
 * les clients 2025 en mode sans session. Le contenu du serveur vit dans
 * `lib/mcp/`.
 *
 * L'authentification est facultative : sans jeton, les outils publics
 * répondent ; un outil personnel appelé sans jeton reçoit un 401 dont
 * l'en-tête `WWW-Authenticate` mène le client à la connexion OAuth du site.
 */
export const maxDuration = 60;

const mcpHandler = createMcpHandler(registerNexusServer, {
  serverInfo: MCP_SERVER_INFO,
  instructions: MCP_INSTRUCTIONS,
  cacheHints: MCP_CACHE_HINTS,
  verboseLogs: process.env.NODE_ENV === "development",
  onEvent: logMcpEvent,
});

const resourceMetadataPath = "/.well-known/oauth-protected-resource/mcp";

const authenticated = withMcpAuth(mcpHandler, verifyMcpToken, {
  required: false,
  resourceMetadataPath,
  resourceUrl: new URL(mcpResource()).origin,
});

async function serve(request: Request): Promise<Response> {
  if (!request.headers.get("authorization")) {
    const personal = await personalToolsCalled(request);
    if (personal.length > 0) {
      // Le 401 de connexion, qui annonce les portées des outils demandés.
      return withMcpAuth(mcpHandler, verifyMcpToken, {
        required: true,
        requiredScopes: [
          ...new Set(personal.map((name) => PERSONAL_TOOLS[name])),
        ],
        resourceMetadataPath,
        resourceUrl: new URL(mcpResource()).origin,
      })(request);
    }
  }
  return authenticated(request);
}

async function handler(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const calls = await describeMcpRequest(request);
  const response = await serve(request);
  logMcpRequest(calls, response, {
    startedAt,
    signedIn: !!request.headers.get("authorization"),
  });
  return response;
}

export { handler as GET, handler as POST, handler as DELETE };
