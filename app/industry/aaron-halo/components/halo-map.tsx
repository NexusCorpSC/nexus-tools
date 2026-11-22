"use client";

import { useTranslations } from "next-intl";
import type { HaloBand, HaloPoint, HaloVector } from "@/lib/aaron-halo";

/** Le système vu de dessus, en gigamètres, +y vers le haut. */
const EXTENT = 48;

function toView(point: { x: number; y: number }) {
  return { cx: point.x / 1e9, cy: -point.y / 1e9 };
}

/**
 * Le trajet sur le plan du système : le halo, la bande visée, les cibles de
 * saut, la ligne du départ à l'arrivée et l'endroit où couper.
 */
export default function HaloMap({
  bands,
  points,
  from,
  to,
  band,
  target,
  position,
}: {
  bands: HaloBand[];
  points: HaloPoint[];
  from: HaloPoint;
  to: HaloPoint | null;
  band: HaloBand;
  target: HaloVector | null;
  position: HaloVector | null;
}) {
  const t = useTranslations("AaronHalo");
  const inner = Math.min(...bands.map((one) => one.inner)) / 1e9;
  const outer = Math.max(...bands.map((one) => one.outer)) / 1e9;
  const start = toView(from);
  const end = to ? toView(to) : null;
  const aim = target ? toView(target) : null;
  const here = position ? toView(position) : null;

  return (
    <figure className="overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#06121E]">
      <svg
        viewBox={`${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`}
        role="img"
        aria-label={t("mapLabel")}
        className="mx-auto block aspect-square w-full max-w-md"
      >
        <circle
          r={(inner + outer) / 2}
          fill="none"
          stroke="#9ED0FF"
          strokeOpacity={0.12}
          strokeWidth={outer - inner}
        />
        <circle
          r={(band.inner + band.outer) / 2e9}
          fill="none"
          stroke="#9ED0FF"
          strokeOpacity={0.7}
          strokeWidth={Math.max(0.25, (band.outer - band.inner) / 1e9)}
        />
        <circle r={0.9} fill="#FFD27A" />

        {points.map((point) => {
          const view = toView(point);
          return (
            <circle
              key={point.id}
              {...view}
              r={point.kind === "planet" ? 0.9 : 0.45}
              fill={point.kind === "planet" ? "#CCE7FF" : "#9ED0FF"}
              fillOpacity={0.55}
            >
              <title>{point.label}</title>
            </circle>
          );
        })}

        {end && (
          <line
            x1={start.cx}
            y1={start.cy}
            x2={end.cx}
            y2={end.cy}
            stroke="#F2F7FC"
            strokeOpacity={0.8}
            strokeWidth={0.3}
            strokeDasharray="1 0.6"
          />
        )}

        <circle {...start} r={1} fill="#F2F7FC" />
        <text
          x={start.cx + 1.5}
          y={start.cy - 1.2}
          fontSize={2.6}
          fill="#F2F7FC"
        >
          {from.label}
        </text>
        {end && to && (
          <>
            <circle
              {...end}
              r={1}
              fill="none"
              stroke="#F2F7FC"
              strokeWidth={0.4}
            />
            <text
              x={end.cx + 1.5}
              y={end.cy - 1.2}
              fontSize={2.6}
              fill="#F2F7FC"
            >
              {to.label}
            </text>
          </>
        )}
        {aim && (
          <g>
            <circle
              {...aim}
              r={1.6}
              fill="none"
              stroke="#34D399"
              strokeWidth={0.4}
            />
            <circle {...aim} r={0.5} fill="#34D399" />
          </g>
        )}
        {here && <circle {...here} r={0.8} fill="#FF9F7A" />}
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-2 text-[11px] text-[#9ED0FF]/70">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-emerald-400" />
          {t("legend.cut")}
        </span>
        {here && (
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-[#FF9F7A]" />
            {t("legend.me")}
          </span>
        )}
        <span>{t("legend.halo")}</span>
      </figcaption>
    </figure>
  );
}
