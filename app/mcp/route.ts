import { createMcpHandler } from "mcp-handler";
import {
  MCP_CACHE_HINTS,
  MCP_INSTRUCTIONS,
  MCP_SERVER_INFO,
  registerNexusServer,
} from "@/lib/mcp/server";

/**
 * Le serveur MCP (https://modelcontextprotocol.io), en Streamable HTTP.
 *
 * `mcp-handler` 2 sert la spec 2026-07-28 (sans état) et, depuis la même route,
 * les clients 2025 en mode sans session. Le contenu du serveur vit dans
 * `lib/mcp/`.
 */
export const maxDuration = 60;

const handler = createMcpHandler(registerNexusServer, {
  serverInfo: MCP_SERVER_INFO,
  instructions: MCP_INSTRUCTIONS,
  cacheHints: MCP_CACHE_HINTS,
  verboseLogs: process.env.NODE_ENV === "development",
});

export { handler as GET, handler as POST, handler as DELETE };
