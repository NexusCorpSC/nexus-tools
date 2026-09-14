import "server-only";
import db from "@/lib/db";
import { planFeedFor, type DbPlan } from "@/lib/plans";
import type { PlanFeed } from "@/types/plan";
import type { ProjectedChange, Topic, TopicIndex } from "./topic";

/**
 * The plan topic: every live plan de vol of the caller's scope, re-read
 * whenever one of them is written.
 *
 * **`collections` is `["plans"]`, and that is load-bearing.** `planStrokes` is
 * not watched: it is the busiest collection in the product, and the hub re-reads
 * a topic's view once per connected member on every change it sees — the
 * fingerprint suppresses the *send*, never the *read*. A stroke in a raid of
 * twenty therefore costs twenty reads of this view, which is why `planFeedFor`
 * is two indexed `find`s with projections and no aggregation, and why the view
 * carries no drawing and no long text. `lib/plans.ts` explains the other half
 * of the bargain: every stroke write also writes to `plans`.
 *
 * **`"squads"` is deliberately absent too.** A squad joining or leaving a raid
 * does change which plans its members see, but adding the collection here would
 * mark this topic dirty on every «prêt» toggle — the most frequent write there
 * is — for the sake of an event that happens twice a night. The client watches
 * `squad.raidId` on the squad topic it already receives, and refetches over
 * HTTP when it moves.
 *
 * Two routing paths, as the squad topic needs two: by plan id, which is what
 * reaches a reader when a plan they already see is written or deleted (a delete
 * carries no document at all), and by `ownerId`, which is what reaches them
 * when a plan they have never seen is created.
 */

export type PlanParams = { squadId: string | null };

function ownerIdOf(change: ProjectedChange): string | null {
  const ownerId = (change.fullDocument as { ownerId?: unknown } | null)?.ownerId;

  return typeof ownerId === "string" ? ownerId : null;
}

function affected(change: ProjectedChange, index: TopicIndex): Set<string> {
  const hit = new Set<string>();
  const owner = ownerIdOf(change);

  for (const [userId, entry] of index) {
    if (entry.plans?.has(change.id)) {
      hit.add(userId);
      continue;
    }

    if (owner !== null && entry.owners?.has(owner)) hit.add(userId);
  }

  return hit;
}

/** What a plan looks like to the ticker: one string that changes when it does. */
function planMark(doc: Pick<DbPlan, "version" | "archivedAt">): string {
  return `${doc.version}:${doc.archivedAt ?? ""}`;
}

export const planTopic: Topic<PlanParams, PlanFeed> = {
  name: "plan",
  collections: ["plans"],

  snapshot(userId, params) {
    return planFeedFor(userId, params.squadId);
  },

  index(_userId, view) {
    const plans = new Set(view.plans.map((plan) => plan.id));
    const owners = new Set<string>();

    if (view.ownerId) owners.add(view.ownerId);

    return { plans, owners };
  },

  affected,

  async tick(index, previous) {
    const owners = new Set<string>();

    for (const [, entry] of index) {
      for (const id of entry.owners ?? []) owners.add(id);
    }

    if (owners.size === 0) {
      previous.clear();
      return new Set<string>();
    }

    const docs = await db
      .db()
      .collection<DbPlan>("plans")
      .find(
        { ownerId: { $in: [...owners] } },
        { projection: { _id: 1, ownerId: 1, version: 1, archivedAt: 1 } },
      )
      .toArray();

    const hit = new Set<string>();
    const seen = new Set<string>();

    const route = (change: ProjectedChange) => {
      for (const userId of affected(change, index)) hit.add(userId);
    };

    for (const doc of docs) {
      const id = doc._id.toString();
      const key = `plans:${id}`;
      const mark = planMark(doc);
      seen.add(key);

      if (previous.get(key) !== mark) {
        previous.set(key, mark);
        route({
          collection: "plans",
          operationType: "update",
          id,
          fullDocument: { ownerId: doc.ownerId },
        });
      }
    }

    // Gone since the last round: a plan deleted, or an owner nobody watches any
    // more. The document is unreadable by then, so only the id can route it.
    for (const key of [...previous.keys()]) {
      if (seen.has(key)) continue;
      previous.delete(key);

      const [, id] = key.split(":", 2);
      route({
        collection: "plans",
        operationType: "delete",
        id,
        fullDocument: null,
      });
    }

    return hit;
  },
};
