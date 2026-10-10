import "server-only";

/**
 * Le journal du serveur MCP : une ligne par requête (méthode, outil, statut,
 * durée), et les erreurs que `mcp-handler` remonte par `onEvent`. Jamais les
 * arguments ni les résultats, qui portent des données de joueurs. La spec
 * 2026-07-28 a déprécié le Logging MCP au profit de journaux côté serveur.
 */

type JsonRpcCall = { method?: unknown; params?: { name?: unknown } };

/** Ce que le corps d'une requête dit d'elle, sans son contenu. */
export async function describeMcpRequest(
  request: Request,
): Promise<{ method: string; tool?: string }[]> {
  if (request.method !== "POST") return [{ method: request.method }];
  let body: unknown;
  try {
    body = await request.clone().json();
  } catch {
    return [{ method: "invalid" }];
  }
  return (Array.isArray(body) ? body : [body]).map((message) => {
    const call = (message ?? {}) as JsonRpcCall;
    const method = typeof call.method === "string" ? call.method : "response";
    const tool =
      (method === "tools/call" || method === "prompts/get") &&
      typeof call.params?.name === "string"
        ? call.params.name
        : undefined;
    return { method, ...(tool && { tool }) };
  });
}

export function logMcpRequest(
  calls: { method: string; tool?: string }[],
  response: Response,
  { startedAt, signedIn }: { startedAt: number; signedIn: boolean },
) {
  console.info(
    JSON.stringify({
      mcp: calls
        .map((call) =>
          call.tool ? `${call.method} ${call.tool}` : call.method,
        )
        .join(", "),
      status: response.status,
      ms: Date.now() - startedAt,
      signedIn,
    }),
  );
}

/** Les erreurs du serveur MCP (`onEvent` de `mcp-handler`). */
export function logMcpEvent(event: {
  type: string;
  error?: Error | string;
  context?: string;
  severity?: string;
}) {
  if (event.type !== "ERROR") return;
  const error = event.error;
  console.error(
    JSON.stringify({
      mcpError: error instanceof Error ? error.message : String(error),
      context: event.context,
      severity: event.severity,
    }),
  );
}
