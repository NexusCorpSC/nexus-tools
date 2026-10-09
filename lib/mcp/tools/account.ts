import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { currentUser, personalTool } from "../auth";
import { READ_ONLY, toolResult } from "../format";

const whoamiChallenge = personalTool("whoami", "profile");

export function registerAccountTools(server: McpServer) {
  server.registerTool(
    "whoami",
    {
      title: "Connected Nexus account",
      description:
        "Return the Nexus Tools account the assistant acts for, and the access it was granted. Calling it without being signed in starts the sign-in.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        userId: z.string(),
        name: z.string(),
        scopes: z.array(z.string()),
      }),
      annotations: READ_ONLY,
      scopeChallenge: whoamiChallenge,
    },
    async (_args, ctx) => {
      const user = await currentUser(ctx);
      const scopes = ctx.http?.authInfo?.scopes ?? [];
      return toolResult(
        { userId: user.id, name: user.name, scopes },
        `Signed in to Nexus Tools as ${user.name}.\nGranted access: ${scopes.join(", ") || "none"}.`,
      );
    },
  );
}
