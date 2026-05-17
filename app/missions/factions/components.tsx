"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MagnifyingGlassIcon, UsersIcon, CubeIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";

type FactionSummary = {
  _id: string;
  name: string;
  missionCount: number;
  blueprintCount: number;
};

export function FactionsExplorer({ factions }: { factions: FactionSummary[] }) {
  const t = useTranslations("Missions");
  const [query, setQuery] = useState("");

  const filtered = factions.filter((f) =>
    f.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative max-w-sm">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          className="pl-9"
          placeholder={t("factionsSearchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {t("factionsCount", { count: filtered.length })}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          {t("factionsNoResults")}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((faction) => (
            <Link
              key={faction._id}
              href={`/missions/factions/${faction._id}`}
              className="group flex items-center justify-between gap-4 rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-4 hover:border-[#9ED0FF]/30 hover:bg-[#0B2A42]/80 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center justify-center size-10 rounded-lg bg-blue-900/40 border border-blue-500/20 shrink-0">
                  <UsersIcon className="size-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate group-hover:text-blue-200 transition-colors">
                    {faction.name}
                  </p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <UsersIcon className="size-3" />
                      {t("factionMissionsCount", { count: faction.missionCount })}
                    </span>
                    {faction.blueprintCount > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-purple-300/80">
                        <CubeIcon className="size-3" />
                        {t("blueprintsCount", { count: faction.blueprintCount })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ChevronRightIcon className="size-4 text-muted-foreground shrink-0 group-hover:text-blue-300 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

