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
import { Mission } from "@/types/missions";
import {
  ShieldExclamationIcon,
  UsersIcon,
  CurrencyDollarIcon,
  CubeIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

type Props = { params: Promise<{ missionId: string }> };

async function getMission(missionId: string): Promise<Mission | null> {
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(missionId);
  } catch {
    return null;
  }

  const [mission] = await db
    .db()
    .collection("missions")
    .aggregate([
      { $match: { _id: objectId } },
      {
        $lookup: {
          from: "factions",
          localField: "factionId",
          foreignField: "_id",
          as: "faction",
        },
      },
      { $unwind: { path: "$faction", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "blueprints",
          localField: "blueprints",
          foreignField: "_id",
          as: "blueprintDetails",
        },
      },
    ])
    .toArray();

  return mission as unknown as Mission | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { missionId } = await params;
  const mission = await getMission(missionId);
  if (!mission) return { title: "Mission introuvable" };
  return {
    title: mission.title,
    description: mission.description,
  };
}

export default async function MissionDetailPage({ params }: Props) {
  const { missionId } = await params;
  const t = await getTranslations("Missions");
  const mission = await getMission(missionId);

  if (!mission) notFound();

  return (
    <div className="m-2 mx-auto max-w-4xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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
            <BreadcrumbPage className="max-w-xs truncate">
              {mission.title}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Mission header */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-blue-400/70 uppercase tracking-wider">
            {mission.missionType}
          </span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{mission.category}</span>
        </div>
        <h1 className="text-2xl font-bold">{mission.title}</h1>

        {/* Badges */}
        <div className="flex flex-wrap gap-2 pt-1">
          {mission.illegal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-900/50 border border-red-500/30 px-2.5 py-1 text-xs text-red-300">
              <ShieldExclamationIcon className="size-3.5" />
              {t("illegal")}
            </span>
          )}
          {mission.canBeShared && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/40 border border-emerald-500/30 px-2.5 py-1 text-xs text-emerald-300">
              <UsersIcon className="size-3.5" />
              {t("shareable")}
            </span>
          )}
          {mission.faction && (
            <Link
              href={`/missions/factions/${mission.faction._id}`}
              className="inline-flex items-center gap-1 rounded-full bg-blue-900/40 border border-blue-500/30 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-900/60 transition-colors"
            >
              <UsersIcon className="size-3.5" />
              {mission.faction.name}
            </Link>
          )}
          {mission.rewardUEC !== undefined && mission.rewardUEC > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/40 border border-yellow-500/30 px-2.5 py-1 text-xs text-yellow-300">
              <CurrencyDollarIcon className="size-3.5" />
              {mission.rewardUEC.toLocaleString()} aUEC
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-white/5 bg-white/5 p-4">
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {mission.description}
        </p>
      </div>

      {/* Blueprint rewards */}
      {mission.blueprintDetails.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CubeIcon className="size-5 text-purple-400" />
            {t("blueprintRewards")}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {mission.blueprintDetails.map((bp) => (
              <Link
                key={bp._id}
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
    </div>
  );
}

