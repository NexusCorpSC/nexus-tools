import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  MAX_RADAR_READING,
  RADAR_CONTEXTS,
  identifyRadarSignature,
  type RadarMatch,
} from "@/lib/radar";
import { getRadarSignatures } from "@/lib/radar-signatures";
import { READ_ONLY, siteUrl, toolResult } from "../format";

/**
 * Le scanner de signature radar : la valeur que le scan du jeu affiche,
 * comparée aux signatures connues, comme sur /industry/radar et dans l'app.
 */

const match = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  base: z.number(),
  count: z.number(),
  exact: z.boolean(),
  difference: z.number(),
});

function toMatch(entry: RadarMatch) {
  return {
    id: entry.signature.id,
    name: entry.signature.name,
    category: entry.signature.category,
    base: entry.signature.value,
    count: entry.count,
    exact: entry.exact,
    difference: entry.difference,
  };
}

function line(entry: ReturnType<typeof toMatch>) {
  return (
    `- ${entry.name} (${entry.category}), ${entry.count} × ${entry.base}` +
    (entry.exact ? "" : `, off by ${entry.difference}`)
  );
}

export function registerRadarTools(server: McpServer) {
  server.registerTool(
    "identify_radar_signature",
    {
      title: "Identify a radar signature",
      description:
        "Tell what a radar signature (RS) shown by the in-game scan can be: the known ore, asteroid, salvage or deposit signatures it is a multiple of, and how many rocks or panels make it up (a cluster of N rocks shows N times the base). Exact matches come first, the smallest cluster first; with none, the closest within 1%. Pass context (ship, roc or fps) when you know how the player is scanning, so what they can meet there comes first: 4000 is an I-type asteroid from a ship, a ROC deposit from a ROC. Call it without value to list every known signature. Values follow the latest known patch.",
      inputSchema: z.object({
        value: z
          .number()
          .int()
          .min(1)
          .max(MAX_RADAR_READING)
          .optional()
          .describe(
            "The signature read on the scan, e.g. 12680. Omit to list the known signatures",
          ),
        context: z
          .enum(RADAR_CONTEXTS)
          .optional()
          .describe(
            "How the player scans: ship (ship mining, asteroids, salvage), roc (ROC deposits), fps (hand mining), or all (default)",
          ),
      }),
      outputSchema: z.looseObject({
        value: z.number().optional(),
        matches: z.array(match).optional(),
        approximate: z.array(match).optional(),
        signatures: z
          .array(
            z.looseObject({
              id: z.string(),
              name: z.string(),
              category: z.string(),
              value: z.number(),
            }),
          )
          .optional(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ value, context }) => {
      const signatures = await getRadarSignatures();
      const url = siteUrl("/industry/radar");

      if (value === undefined) {
        return toolResult(
          { signatures, url },
          `Known radar signatures (${signatures.length}), one item each:\n` +
            signatures
              .map((s) => `- ${s.name} (${s.category}): ${s.value}`)
              .join("\n") +
            `\n\nScanner: ${url}`,
        );
      }

      const result = identifyRadarSignature(value, signatures, { context });
      const matches = result.matches.map(toMatch);
      const approximate = result.approximate.map(toMatch);
      const text =
        matches.length > 0
          ? `Radar signature ${result.value} can be:\n${matches.map(line).join("\n")}`
          : approximate.length > 0
            ? `No known signature gives exactly ${result.value}. Closest:\n${approximate.map(line).join("\n")}`
            : `No known signature matches ${result.value}.`;

      return toolResult(
        { value: result.value, matches, approximate, url },
        `${text}\n\nScanner: ${url}`,
      );
    },
  );
}
