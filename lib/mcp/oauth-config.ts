/**
 * Ce que le serveur d'autorisation (`lib/auth.ts`) et le serveur MCP
 * (`app/mcp/route.ts`) doivent dire pareil : l'adresse de la ressource
 * protégée, l'émetteur des jetons et les portées.
 *
 * Pas de `server-only` : l'écran de consentement lit les portées.
 */

export function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

/** L'identifiant de la ressource (RFC 8707) : l'adresse du serveur MCP. */
export function mcpResource(): string {
  return `${siteOrigin()}/mcp`;
}

/** L'émetteur des jetons : le serveur better-auth, sous `/api/auth`. */
export function oauthIssuer(): string {
  return `${siteOrigin()}/api/auth`;
}

/**
 * Les portées qu'un assistant peut demander. Les outils publics n'en exigent
 * aucune ; chaque outil personnel exige la sienne (`lib/mcp/auth.ts`).
 */
export const MCP_SCOPES = [
  "inventory:read",
  "inventory:write",
  "marketplace:read",
  "marketplace:write",
  "contributions:write",
] as const;

export type McpScope = (typeof MCP_SCOPES)[number];

export const OIDC_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
] as const;
export type OidcScope = (typeof OIDC_SCOPES)[number];
