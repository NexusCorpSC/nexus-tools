import "server-only";
import { after } from "next/server";
import { headers } from "next/headers";
import db from "@/lib/db";

/**
 * Les visites des fiches, comptées par jour : ce qui dit, sur « Ce qui
 * manque », quels trous gênent le plus de monde. Un compteur par fiche et par
 * jour, pas une ligne par visite ; il s'efface au bout de 90 jours.
 */

export type ViewedType = "place" | "item" | "mission";

type DbPageView = {
  type: ViewedType;
  slug: string;
  /** Le jour, à minuit UTC. */
  day: Date;
  count: number;
};

export const pageViews = () => db.db().collection<DbPageView>("pageViews");

/** Les robots d'indexation ne comptent pas : ils visitent tout, également. */
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|curl|wget/i;

function today(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Compte une visite, après la réponse : la page n'attend jamais le compteur. */
export async function recordView(type: ViewedType, slug: string) {
  const agent = (await headers()).get("user-agent") ?? "";
  if (!agent || BOT.test(agent)) return;
  const day = today();
  after(async () => {
    try {
      await pageViews().updateOne(
        { type, slug, day },
        { $inc: { count: 1 } },
        { upsert: true },
      );
    } catch (error) {
      console.error("Visite non comptée", error);
    }
  });
}

/** Les fiches les plus visitées d'un type depuis `days` jours, avec leurs visites. */
export async function mostViewed(
  type: ViewedType,
  days = 30,
  limit = 1000,
): Promise<Map<string, number>> {
  const since = new Date(today().getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await pageViews()
    .aggregate<{ _id: string; views: number }>([
      { $match: { type, day: { $gte: since } } },
      { $group: { _id: "$slug", views: { $sum: "$count" } } },
      { $sort: { views: -1 } },
      { $limit: limit },
    ])
    .toArray();
  return new Map(rows.map((row) => [row._id, row.views]));
}
