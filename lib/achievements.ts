import "server-only";
import type { ObjectId } from "mongodb";
import db from "@/lib/db";
import {
  contributions,
  pointEvents,
  type DbUser,
} from "@/lib/contribution-store";
import { CONTRIBUTION_KINDS } from "@/types/contributions";
import {
  GUARDIAN_GOAL,
  MIN_DISTRICTS,
  MIN_PLANETS,
  PIONEER_TIERS,
  RELIABLE_GOAL,
  type Achievement,
} from "@/types/gamification";

/**
 * Les succès d'un joueur, recalculés depuis ce qu'il a publié : rien n'est
 * compté à part, un succès ne peut donc pas dériver de ce qui s'est passé.
 *
 * Le calcul lit les contributions publiées du joueur, ses bonus de première
 * image et ses signalements retenus, et les lieux de l'arbre qui font un
 * succès (villes et leurs quartiers, systèmes et leurs planètes) : quelques
 * dizaines de documents, pas tout le catalogue.
 */

type TreeNode = {
  slug: string;
  name: string;
  type: string;
  ancestorSlugs?: string[];
};

const places = () => db.db().collection<TreeNode>("gameLocations");

/**
 * Les villes et leurs quartiers, les systèmes et leurs planètes : ce qui fait
 * un succès. L'arbre change rarement, et ce calcul tourne à chaque
 * publication et à chaque lecture de l'app : on le garde quelques minutes.
 */
const LANDMARKS_TTL_MS = 10 * 60 * 1000;
let landmarksCache: { at: number; nodes: Promise<TreeNode[]> } | null = null;

function getLandmarks(): Promise<TreeNode[]> {
  if (!landmarksCache || Date.now() - landmarksCache.at > LANDMARKS_TTL_MS) {
    const nodes = places()
      .find(
        { type: { $in: ["star", "planet", "city", "district"] } },
        {
          projection: { _id: 0, slug: 1, name: 1, type: 1, ancestorSlugs: 1 },
        },
      )
      .toArray();
    landmarksCache = { at: Date.now(), nodes };
    // Une lecture ratée ne reste pas en cache.
    nodes.catch(() => {
      landmarksCache = null;
    });
  }
  return landmarksCache.nodes;
}

/** Le lieu et tous ceux qui le contiennent. */
function lineage(node: TreeNode | undefined, slug: string): string[] {
  return [slug, ...(node?.ancestorSlugs ?? [])];
}

/**
 * Tous les succès, débloqués ou en cours. Un succès déjà débloqué le reste,
 * même si ce qui l'a valu a été annulé depuis : `earned` fait foi.
 */
export async function evaluateAchievements(
  userId: ObjectId,
  earned: NonNullable<DbUser["contrib"]>["achievements"] = [],
): Promise<Achievement[]> {
  const [published, firstMedia, upheld, reviewed] = await Promise.all([
    contributions()
      .find(
        { userId, status: "published" },
        { projection: { _id: 1, kind: 1, target: 1 } },
      )
      .toArray(),
    pointEvents()
      .find(
        { userId, reason: "firstMedia" },
        { projection: { contributionId: 1 } },
      )
      .toArray(),
    pointEvents().countDocuments({ userId, reason: "report" }),
    contributions()
      .find(
        {
          userId,
          status: { $in: ["published", "rejected", "reverted"] },
          $or: [
            { "review.by": { $exists: true } },
            { revert: { $exists: true } },
          ],
        },
        { projection: { status: 1 } },
      )
      .sort({ createdAt: -1 })
      .limit(RELIABLE_GOAL)
      .toArray(),
  ]);

  const publishedIds = new Set(published.map((doc) => String(doc._id)));
  // Une première image annulée depuis ne compte plus : le lieu est de nouveau
  // à prendre.
  const pioneers = firstMedia.filter(
    (event) =>
      event.contributionId && publishedIds.has(String(event.contributionId)),
  ).length;

  const placeSlugs = [
    ...new Set(
      published
        .filter((doc) => doc.target.type === "place")
        .map((doc) => doc.target.slug),
    ),
  ];
  const planSlugs = new Set(
    published
      .filter((doc) => doc.kind === "plan")
      .map((doc) => doc.target.slug),
  );

  const [touched, landmarks] = await Promise.all([
    placeSlugs.length > 0
      ? places()
          .find(
            { slug: { $in: placeSlugs } },
            { projection: { _id: 0, slug: 1, ancestorSlugs: 1 } },
          )
          .toArray()
      : [],
    getLandmarks(),
  ]);
  const bySlug = new Map(touched.map((node) => [node.slug, node]));

  // Chaque lieu touché compte pour lui et pour tout ce qui le contient.
  const reached = new Set(
    placeSlugs.flatMap((slug) => lineage(bySlug.get(slug), slug)),
  );
  const planned = new Set(
    [...planSlugs].flatMap((slug) => lineage(bySlug.get(slug), slug)),
  );

  const results: Achievement[] = [];

  results.push({
    id: "firstStep",
    key: "firstStep",
    progress: { current: Math.min(published.length, 1), goal: 1 },
  });

  for (const { tier, goal } of PIONEER_TIERS) {
    results.push({
      id: `pioneer:${tier}`,
      key: "pioneer",
      tier,
      progress: { current: Math.min(pioneers, goal), goal },
    });
  }

  const cities = landmarks.filter((node) => node.type === "city");
  const districts = landmarks.filter((node) => node.type === "district");
  for (const city of cities) {
    const inside = districts.filter((node) =>
      node.ancestorSlugs?.includes(city.slug),
    );
    if (inside.length < MIN_DISTRICTS) continue;
    results.push({
      id: `cartographer:${city.slug}`,
      key: "cartographer",
      name: city.name,
      progress: {
        current: inside.filter((node) => planned.has(node.slug)).length,
        goal: inside.length,
      },
    });
  }

  const systems = landmarks.filter(
    (node) => node.type === "star" && !node.ancestorSlugs?.length,
  );
  const planets = landmarks.filter((node) => node.type === "planet");
  for (const system of systems) {
    const inside = planets.filter((node) =>
      node.ancestorSlugs?.includes(system.slug),
    );
    if (inside.length < MIN_PLANETS) continue;
    results.push({
      id: `tour:${system.slug}`,
      key: "tour",
      name: system.name,
      progress: {
        current: inside.filter((node) => reached.has(node.slug)).length,
        goal: inside.length,
      },
    });
  }

  const kinds = new Set(published.map((doc) => doc.kind));
  results.push({
    id: "versatile",
    key: "versatile",
    progress: {
      current: CONTRIBUTION_KINDS.filter((kind) => kinds.has(kind)).length,
      goal: CONTRIBUTION_KINDS.length,
    },
  });

  results.push({
    id: "guardian",
    key: "guardian",
    progress: { current: Math.min(upheld, GUARDIAN_GOAL), goal: GUARDIAN_GOAL },
  });

  // D'affilée : le compte s'arrête au refus le plus récent.
  const streak = reviewed.findIndex((doc) => doc.status !== "published");
  results.push({
    id: "reliable",
    key: "reliable",
    progress: {
      current: streak === -1 ? reviewed.length : streak,
      goal: RELIABLE_GOAL,
    },
  });

  const unlocked = new Map(earned.map((entry) => [entry.id, entry]));
  return results
    .map((achievement) => {
      const done = unlocked.get(achievement.id);
      if (done) {
        return {
          ...achievement,
          name: achievement.name ?? done.name,
          at: done.at.toISOString(),
          progress: undefined,
        };
      }
      return achievement;
    })
    .concat(
      // Un succès débloqué dont la ville ou le système a disparu de l'arbre.
      earned
        .filter((entry) => !results.some((result) => result.id === entry.id))
        .map((entry) => ({
          id: entry.id,
          key: entry.id.split(":")[0] as Achievement["key"],
          tier: entry.id.startsWith("pioneer:")
            ? (entry.id.split(":")[1] as Achievement["tier"])
            : undefined,
          name: entry.name,
          at: entry.at.toISOString(),
        })),
    );
}

/** Un succès en cours dont le but est atteint, et pas encore enregistré. */
export function isReached(achievement: Achievement): boolean {
  return (
    !achievement.at &&
    !!achievement.progress &&
    achievement.progress.current >= achievement.progress.goal
  );
}
