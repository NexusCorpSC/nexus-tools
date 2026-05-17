import type { Metadata } from "next";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import db from "@/lib/db";
import { FactionsExplorer } from "@/app/missions/factions/components";

export const metadata: Metadata = {
  title: "Factions — Missions",
  description:
    "Parcourez toutes les factions du jeu et leurs missions et récompenses.",
  openGraph: {
    title: "Factions — Nexus Tools",
    description:
      "Explorez les factions de Star Citizen et leurs missions.",
    url: "https://tools.nexus.services/missions/factions",
  },
};

export default async function MissionsFactionsPage() {
  const t = await getTranslations("Missions");

  const factions = await db
    .db()
    .collection("factions")
    .aggregate([
      {
        $lookup: {
          from: "missions",
          localField: "_id",
          foreignField: "factionId",
          as: "missions",
        },
      },
      {
        $addFields: {
          missionCount: { $size: "$missions" },
          blueprintIds: {
            $reduce: {
              input: "$missions.blueprints",
              initialValue: [],
              in: { $setUnion: ["$$value", "$$this"] },
            },
          },
        },
      },
      {
        $addFields: {
          blueprintCount: { $size: "$blueprintIds" },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          missionCount: 1,
          blueprintCount: 1,
        },
      },
      { $sort: { name: 1 } },
    ])
    .toArray();

  // Serialize ObjectIds
  const serialized = factions.map((f) => ({
    ...f,
    _id: f._id.toString(),
  })) as { _id: string; name: string; missionCount: number; blueprintCount: number }[];

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
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
            <BreadcrumbPage>{t("factions")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="text-2xl font-bold mb-1">{t("factions")}</h1>
        <p className="text-nexus">{t("factionsHeader")}</p>
      </div>

      <Suspense>
        <FactionsExplorer factions={serialized} />
      </Suspense>
    </div>
  );
}

