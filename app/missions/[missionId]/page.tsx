import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
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
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getPlacesBySlugs } from "@/lib/places";
import { placeTrail } from "@/lib/place-icons";
import { recordView } from "@/lib/page-views";
import { PointsChip } from "@/components/points-chip";
import { OpenContributionsBanner } from "@/app/contributions/open-banner";
import { POINTS } from "@/types/contributions";
import { MapPinIcon, LightBulbIcon } from "@heroicons/react/24/outline";

type Props = { params: Promise<{ missionId: string }> };

async function getMission(
  missionId: string,
  userId?: string,
): Promise<Mission | null> {
  let objectId: ObjectId;
  try {
    objectId = new ObjectId(missionId);
  } catch {
    return null;
  }

  const blueprintLookupPipeline = userId
    ? [
        { $match: { $expr: { $in: ["$_id", "$$blueprintIds"] } } },
        {
          $lookup: {
            from: "user-blueprints",
            let: { bpId: { $toString: "$_id" } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$blueprintId", "$$bpId"] },
                      { $eq: ["$userId", userId] },
                    ],
                  },
                },
              },
            ],
            as: "ownership",
          },
        },
        {
          $addFields: {
            owned: {
              $cond: [
                {
                  $or: [
                    { $eq: ["$isDefault", true] },
                    { $gt: [{ $size: "$ownership" }, 0] },
                  ],
                },
                true,
                false,
              ],
            },
          },
        },
      ]
    : [{ $match: { $expr: { $in: ["$_id", "$$blueprintIds"] } } }];

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
          let: { blueprintIds: "$blueprints" },
          pipeline: blueprintLookupPipeline,
          as: "blueprintDetails",
        },
      },
      { $addFields: { replacedBy: { $toString: "$replacedBy" } } },
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
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const mission = await getMission(missionId, userId);

  if (!mission) notFound();
  // Fusionnée par la source dans une autre mission : le lien suit. Pas de
  // redirection permanente, que les navigateurs gardent en cache : un patch
  // suivant peut ramener la mission.
  if (mission.replacedBy) redirect(`/missions/${mission.replacedBy}`);
  await recordView("mission", missionId);
  const places = await getPlacesBySlugs(mission.placeSlugs);

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
          <span className="text-xs text-muted-foreground">
            {mission.category}
          </span>
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

      {mission.removedInVersion && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
          {t("removedFromGame", { version: mission.removedInVersion })}
        </p>
      )}

      {/* Description */}
      <div className="rounded-xl border border-white/5 bg-white/5 p-4">
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
          {mission.description}
        </p>
      </div>

      <OpenContributionsBanner type="mission" slug={missionId} />

      {/* Lieux et astuce, de la communauté */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MapPinIcon className="size-5 text-[#9ED0FF]" />
            {t("placesTitle")}
          </h2>
          {session?.user && (
            <Link
              href={`/missions/${missionId}/contribuer`}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              {t("contribute")}
              <PointsChip points={POINTS.edit} />
            </Link>
          )}
        </div>
        {places.length > 0 ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {places.map((place) => (
              <li key={place.slug}>
                <Link
                  href={`/lieux/${place.slug}`}
                  className="block rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-3 transition-all hover:border-[#9ED0FF]/30"
                >
                  <span className="block text-sm font-medium">
                    {place.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {placeTrail(place)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{t("noPlaces")}</p>
        )}
        {mission.tip && (
          <div className="flex gap-2 rounded-xl border border-[#F5C46B]/30 bg-[#F5C46B]/6 p-4 text-sm leading-relaxed">
            <LightBulbIcon className="size-5 shrink-0 text-[#F7D68F]" />
            <p className="whitespace-pre-line">{mission.tip}</p>
          </div>
        )}
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
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{bp.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <TagIcon className="size-3" />
                    {bp.category}
                    {bp.subcategory && ` · ${bp.subcategory}`}
                  </p>
                </div>
                {bp.owned !== undefined &&
                  (bp.owned ? (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-xs font-semibold bg-green-500/20 text-green-300 border border-green-500/30 rounded-full">
                      {t("blueprintOwned")}
                    </span>
                  ) : (
                    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 text-xs font-semibold bg-white/5 text-muted-foreground border border-white/10 rounded-full">
                      {t("blueprintNotOwned")}
                    </span>
                  ))}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
