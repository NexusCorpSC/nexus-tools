"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";
import type { VehiclePlans } from "@/types/items";

// three et le modèle ne descendent que si quelqu'un ouvre la vue 3D.
const ShipViewer = dynamic(
  () => import("./ship-viewer").then((module) => module.ShipViewer),
  { ssr: false },
);

/** Les vues plates, dans l'ordre où on les regarde. */
const VIEWS = ["top", "side", "front"] as const;

type View = (typeof VIEWS)[number] | "holo";

/**
 * Les plans du véhicule : les vues orthographiques et, quand il existe, le
 * modèle 3D. Une seule à l'écran à la fois — ce sont les mêmes coques sous
 * trois angles, les empiler n'apprendrait rien de plus.
 */
export function VehiclePlansSection({
  plans,
  name,
  accent,
  scale,
}: {
  plans: VehiclePlans;
  name: string;
  accent: string;
  scale?: string;
}) {
  const t = useTranslations("Items.Vehicle");

  const available = useMemo<View[]>(
    () => [
      ...VIEWS.filter((view) => plans[view]),
      ...(plans.holo ? (["holo"] as const) : []),
    ],
    [plans],
  );
  const [view, setView] = useState<View>(() => available[0]);

  // Une vue peut disparaître d'un import à l'autre : l'onglet retenu retombe
  // alors sur la première disponible plutôt que d'afficher du vide.
  const current = available.includes(view) ? view : available[0];
  if (!current) return null;

  const image = current === "holo" ? undefined : plans[current];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {available.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => setView(candidate)}
            aria-pressed={candidate === current}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              candidate === current
                ? "bg-[#092F49]/70"
                : "border-[#9ED0FF]/25 text-nexus hover:border-[#9ED0FF]/50",
            )}
            style={
              candidate === current
                ? { borderColor: accent, color: accent }
                : undefined
            }
          >
            {t(`plans.${candidate}`)}
          </button>
        ))}

        <span className="h-px flex-1 bg-[#9ED0FF]/15" />

        {image && (
          <a
            href={image}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-nexus/70 transition-colors hover:text-nexus"
          >
            {t("plansOpen")}
            <ArrowTopRightOnSquareIcon className="size-3.5" />
          </a>
        )}
      </div>

      <div className="relative h-[340px] overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/45 sm:h-[420px]">
        <div
          className="absolute inset-0 opacity-35"
          style={{
            backgroundImage:
              "linear-gradient(rgba(158,208,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(158,208,255,0.08) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {image ? (
          <Image
            key={image}
            src={image}
            alt={t("plansAlt", { name, view: t(`plans.${current}`) })}
            fill
            sizes="(max-width: 640px) 100vw, 896px"
            className="object-contain p-4"
          />
        ) : (
          <ShipViewer url={plans.holo!} accent={accent} />
        )}

        {scale && current !== "holo" && (
          <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[10px] uppercase tracking-[0.14em] text-nexus/45">
            {scale}
          </p>
        )}
      </div>
    </div>
  );
}
