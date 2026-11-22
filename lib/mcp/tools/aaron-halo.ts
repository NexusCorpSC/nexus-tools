import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  DEFAULT_HALO_BAND,
  DEFAULT_HALO_BANDS,
  HALO_POINTS,
  findHaloPoint,
  haloBandRoutes,
  haloGigametres,
  haloMegametres,
  haloRoute,
  type HaloPass,
} from "@/lib/aaron-halo";
import { READ_ONLY, siteUrl, toolResult } from "../format";

/**
 * Naviguer vers une bande de l'Aaron Halo : à quelle distance restante couper
 * le saut quantique, comme sur /industry/aaron-halo et dans l'app.
 */

const POINT_IDS = HALO_POINTS.map((point) => point.id) as [string, ...string[]];

const pass = z.object({
  band: z.number(),
  cutAtGm: z.number(),
  enterGm: z.number(),
  exitGm: z.number(),
  windowMm: z.number(),
});

function toPass(entry: HaloPass) {
  return {
    band: entry.band.id,
    cutAtGm: haloGigametres(entry.targetRemaining),
    enterGm: haloGigametres(entry.enterRemaining),
    exitGm: haloGigametres(entry.exitRemaining),
    windowMm: haloMegametres(entry.width),
  };
}

function pageUrl(from: string, band: number, to?: string) {
  const params = new URLSearchParams({ from, band: String(band) });
  if (to) params.set("to", to);
  return siteUrl(`/industry/aaron-halo?${params}`);
}

export function registerAaronHaloTools(server: McpServer) {
  server.registerTool(
    "plan_aaron_halo_route",
    {
      title: "Plan a quantum jump into the Aaron Halo",
      description:
        "Get into a band of the Aaron Halo, Stanton's asteroid belt (bands 1 to 10, band 5 the densest): the halo has no quantum beacon, so the player jumps between two points whose straight line crosses it and cuts the jump when the HUD's remaining distance to the destination reaches cutAtGm (in gigametres; the window runs from enterGm to exitGm, windowMm wide). With from and to, every band the route crosses. With from and band but no to, the destinations from there whose route crosses that band, widest window (easiest) first. Points are Stanton's Lagrange stations and planets, by id (arc-l1, cru-l4, hurston…).",
      inputSchema: z.object({
        from: z.enum(POINT_IDS).describe("Departure, e.g. arc-l1"),
        to: z
          .enum(POINT_IDS)
          .optional()
          .describe(
            "Destination, e.g. cru-l4. Omit to list the destinations that cross band",
          ),
        band: z
          .number()
          .int()
          .min(1)
          .max(DEFAULT_HALO_BANDS.length)
          .optional()
          .describe(
            `The band aimed at, 1 to 10 (default ${DEFAULT_HALO_BAND})`,
          ),
      }),
      outputSchema: z.looseObject({
        from: z.string(),
        to: z.string().optional(),
        band: z.number(),
        lengthGm: z.number().optional(),
        passes: z.array(pass).optional(),
        destinations: z
          .array(z.looseObject({ to: z.string(), label: z.string(), pass }))
          .optional(),
        url: z.string(),
      }),
      annotations: READ_ONLY,
    },
    async ({ from: fromId, to: toId, band = DEFAULT_HALO_BAND }) => {
      const from = findHaloPoint(fromId)!;
      const to = findHaloPoint(toId);

      if (to && to.id !== from.id) {
        const route = haloRoute(from, to);
        const passes = route.passes.map(toPass);
        const url = pageUrl(from.id, band, to.id);
        const text =
          passes.length > 0
            ? `${from.label} → ${to.label} (${haloGigametres(route.length)} Gm) crosses:\n` +
              passes
                .map(
                  (one) =>
                    `- band ${one.band}: cut at ${one.cutAtGm} Gm remaining (window ${one.enterGm} → ${one.exitGm} Gm, ${one.windowMm} Mm)`,
                )
                .join("\n")
            : `${from.label} → ${to.label} does not cross the Aaron Halo.`;
        return toolResult(
          {
            from: from.id,
            to: to.id,
            band,
            lengthGm: haloGigametres(route.length),
            passes,
            url,
          },
          `${text}\n\nNavigator: ${url}`,
        );
      }

      const destinations = haloBandRoutes(from, band).map((entry) => ({
        to: entry.to.id,
        label: entry.to.label,
        pass: toPass(entry.pass),
      }));
      const url = pageUrl(from.id, band);
      const text =
        destinations.length > 0
          ? `From ${from.label}, routes crossing band ${band}, widest window first:\n` +
            destinations
              .map(
                (one) =>
                  `- to ${one.label}: cut at ${one.pass.cutAtGm} Gm remaining (window ${one.pass.windowMm} Mm)`,
              )
              .join("\n")
          : `No route from ${from.label} crosses band ${band}.`;
      return toolResult(
        { from: from.id, band, destinations, url },
        `${text}\n\nNavigator: ${url}`,
      );
    },
  );
}
