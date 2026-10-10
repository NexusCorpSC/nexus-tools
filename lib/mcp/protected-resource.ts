import { generateProtectedResourceMetadata } from "mcp-handler";
import {
  MCP_SCOPES,
  mcpResource,
  oauthIssuer,
  OIDC_SCOPES,
} from "./oauth-config";

/**
 * Les métadonnées de ressource protégée du serveur MCP (RFC 9728) : où se
 * connecter, et quelles portées demander. Le client les trouve par l'en-tête
 * `WWW-Authenticate` d'une réponse 401 de `/mcp`.
 */
export function protectedResourceResponse(): Response {
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [oauthIssuer()],
    resourceUrl: mcpResource(),
    additionalMetadata: {
      resource_name: "Nexus Tools",
      scopes_supported: [...OIDC_SCOPES, ...MCP_SCOPES],
      bearer_methods_supported: ["header"],
    },
  });
  return Response.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
