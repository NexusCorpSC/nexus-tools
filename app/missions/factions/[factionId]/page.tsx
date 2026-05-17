import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getTranslations } from "next-intl/server";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { FactionDb } from "@/lib/data/factions";
import { MissionBlueprint, Mission } from "@/types/missions";
import {
  ShieldExclamationIcon,
  UsersIcon,
  CurrencyDollarIcon,
  CubeIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

type Props = { params: Promise<{ factionId: string }> };

type FactionWithMissions = FactionDb & {
  missions: Mission[];
  blueprints: MissionBlueprint[];
};

async function getFactionData(factionId: string): Promise<FactionWithMissions | null> {
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(factionId);
  } catch {
    return null;
  }

  const faction = await db
    .db()
    .collection<FactionDb>("factions")
    .findOne({ _id: objectId });

  if (!faction) return null;

  const missions = await db
    .db()
    .collection("missions")
    .aggregate([
      { $match: { factionId: objectId } },
      {
        $lookup: {
          from: "blueprints",
          localField: "blueprints",
          foreignField: "_id",
          as: "blueprintDetails",
        },
      },
      { $sort: { title: 1 } },
    ])
    .toArray() as unknown as Mission[];

  // Collect unique blueprints across all missions
  const bpMap = new Map<string, MissionBlueprint>();
  for (const m of missions) {
    for (const bp of m.blueprintDetails) {
      bpMap.set(bp._id.toString(), bp);
    }
  }

  return {
    ...faction,
    missions,
    blueprints: Array.from(bpMap.values()),
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { factionId } = await params;
  const data = await getFactionData(factionId);
  if (!data) return { title: "Faction introuvable" };
  return {
    title: `Missions — ${data.name}`,
    description: `Toutes les missions de la faction ${data.name} dans Star Citizen.`,
  };
}

export default async function FactionMissionsPage({ params }: Props) {
  const { factionId } = await params;
  const t = await getTranslations("Missions");
  const data = await getFactionData(factionId);

  if (!data) notFound();

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/missions">{t("title")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{data.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">
          <UsersIcon className="inline size-6 mr-2 text-blue-400" />
          {data.name}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("factionMissionsCount", { count: data.missions.length })}
        </p>
      </div>

      {/* Blueprint rewards summary */}
      {data.blueprints.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CubeIcon className="size-5 text-purple-400" />
            {t("factionBlueprintRewards")}
            <span className="text-sm font-normal text-muted-foreground">
              ({data.blueprints.length})
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.blueprints.map((bp) => (
              <Link
                key={bp._id.toString()}
                href={`/crafting/blueprints/${bp.slug}`}
                className="flex items-center gap-3 rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-3 hover:border-[#9ED0FF]/30 hover:bg-[#0B2A42]/80 transition-all"
              >
                {bp.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={bp.imageUrl}
                    alt={bp.name}
                    className="size-10 rounded-lg object-cover bg-white/5 shrink-0"
                  />
                ) : (
                  <div className="size-10 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                    <CubeIcon className="size-5 text-purple-400/60" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{bp.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TagIcon className="size-3" />
                    {bp.category}
                    {bp.subcategory && ` · ${bp.subcategory}`}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Mission list */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{t("missionsList")}</h2>
        {data.missions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("noMissions")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.missions.map((m) => (
              <Link
                key={m._id.toString()}
                href={`/missions/${m._id}`}
                className="group flex flex-col rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-4 gap-3 hover:border-[#9ED0FF]/30 hover:bg-[#0B2A42]/80 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-blue-400/70 uppercase tracking-wider mb-1">
                      {m.missionType}
                    </p>
                    <h3 className="font-semibold text-sm leading-snug group-hover:text-blue-200 transition-colors line-clamp-2">
                      {m.title}
                    </h3>
                  </div>
                  {m.illegal && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-900/50 border border-red-500/30 px-2 py-0.5 text-xs text-red-300 shrink-0">
                      <ShieldExclamationIcon className="size-3" />
                      {t("illegal")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {m.description}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-auto pt-1 border-t border-white/5">
                  {m.canBeShared && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300/70">
                      <UsersIcon className="size-3" />
                      {t("shareable")}
                    </span>
                  )}
                  {m.rewardUEC !== undefined && m.rewardUEC > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-yellow-300/70">
                      <CurrencyDollarIcon className="size-3" />
                      {m.rewardUEC.toLocaleString()} aUEC
                    </span>
                  )}
                  {m.blueprintDetails.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-purple-300/80 font-medium">
                      <CubeIcon className="size-3" />
                      {t("blueprintsCount", {
                        count: m.blueprintDetails.length,
                      })}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

