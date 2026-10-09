import "server-only";
import {
  requestToResourceInput,
  verifyAccessTokenRequest,
} from "better-auth/oauth2";
import {
  requireScopes,
  type AuthInfo,
  type ServerContext,
} from "@modelcontextprotocol/server";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import {
  mcpResource,
  oauthIssuer,
  type McpScope,
  type OidcScope,
} from "./oauth-config";

/**
 * L'accès au compte depuis le serveur MCP.
 *
 * Les outils publics restent anonymes. Les outils personnels exigent un jeton
 * OAuth émis par le site (`lib/auth.ts`) pour la ressource `/mcp`, avec leur
 * portée : `PERSONAL_TOOLS` est la liste qu'en tient la route, qui répond 401
 * à un appel anonyme pour que le client lance la connexion, et chaque outil
 * pose un `scopeChallenge` qui répond 403 quand la portée manque.
 */
export const PERSONAL_TOOLS: Record<string, McpScope | OidcScope> = {};

/** Déclare un outil personnel et rend le `scopeChallenge` à lui donner. */
export function personalTool(name: string, scope: McpScope | OidcScope) {
  PERSONAL_TOOLS[name] = scope;
  return requireScopes(scope);
}

/** Vérifie le jeton d'une requête `/mcp` : JWT signé par le site, pour `/mcp`. */
export async function verifyMcpToken(
  request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const payload = await verifyAccessTokenRequest(
    requestToResourceInput(request),
    {
      verifyOptions: { issuer: oauthIssuer(), audience: mcpResource() },
      jwksUrl: `${oauthIssuer()}/jwks`,
    },
  );
  if (typeof payload.sub !== "string") return undefined;
  return {
    token: bearerToken,
    clientId: String(payload.azp ?? payload.client_id ?? ""),
    scopes: String(payload.scope ?? "")
      .split(" ")
      .filter(Boolean),
    expiresAt: payload.exp,
    resource: new URL(mcpResource()),
    extra: { userId: payload.sub },
  };
}

/**
 * Les noms des outils personnels qu'une requête appelle. Lu sur une copie du
 * corps, avant le SDK : un appel anonyme doit recevoir le 401 de connexion,
 * pas une erreur d'outil.
 */
export async function personalToolsCalled(request: Request): Promise<string[]> {
  if (request.method !== "POST") return [];
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return [];
  }
  const messages = Array.isArray(body) ? body : [body];
  return messages.flatMap((message) => {
    const call = message as { method?: string; params?: { name?: string } };
    return call?.method === "tools/call" &&
      typeof call.params?.name === "string" &&
      call.params.name in PERSONAL_TOOLS
      ? [call.params.name]
      : [];
  });
}

export type McpUser = { id: string; name: string };

/**
 * Le joueur au nom duquel l'outil agit. La route garantit qu'un outil
 * personnel n'est jamais appelé sans jeton ; l'erreur ne sert qu'en défense.
 */
export async function currentUser(ctx: ServerContext): Promise<McpUser> {
  const userId = ctx.http?.authInfo?.extra?.userId;
  if (typeof userId !== "string" || !ObjectId.isValid(userId)) {
    throw new Error("Sign in to Nexus Tools to use this tool.");
  }
  const user = await db
    .db()
    .collection("users")
    .findOne(
      { _id: new ObjectId(userId) },
      { projection: { name: 1, banned: 1 } },
    );
  if (!user || user.banned)
    throw new Error("This Nexus account is not available.");
  return { id: userId, name: String(user.name ?? "") };
}
