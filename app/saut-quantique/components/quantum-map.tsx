"use client";

import { useTranslations } from "next-intl";
import type { QtCandidate, QtSystem, QtVector } from "@/lib/quantum-route";

/** En gigamètres, +y vers le haut : le système vu de dessus. */
function toView(point: { x: number; y: number }) {
  return { cx: point.x / 1e9, cy: -point.y / 1e9 };
}

/**
 * Le système vu de dessus : les corps, les balises, la ligne du saut, où en
 * sortir et la cible.
 */
export default function QuantumMap({
  system,
  target,
  candidate,
}: {
  system: QtSystem;
  target: QtVector;
  candidate: QtCandidate | null;
}) {
  const t = useTranslations("QuantumRoute");
  const reach = Math.max(
    5,
    ...[...system.beacons, target].map(
      (point) => Math.max(Math.abs(point.x), Math.abs(point.y)) / 1e9,
    ),
  );
  const extent = reach * 1.12;
  const unit = extent / 48;
  const aim = toView(target);
  const start = candidate?.from ? toView(candidate.from) : null;
  const end = candidate ? toView(candidate.to) : null;
  const exit = candidate ? toView(candidate.exit) : null;

  return (
    <figure className="overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#06121E]">
      <svg
        viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
        role="img"
        aria-label={t("mapLabel")}
        className="mx-auto block aspect-square w-full max-w-md"
      >
        <circle r={unit * 0.9} fill="#FFD27A" />
        {system.bodies.map((body) => (
          <circle
            key={body.slug}
            {...toView(body)}
            r={unit * 0.7}
            fill="#CCE7FF"
            fillOpacity={0.45}
          >
            <title>{body.name}</title>
          </circle>
        ))}
        {system.beacons
          .filter((beacon) => beacon.kind === "place")
          .map((beacon) => (
            <circle
              key={beacon.id}
              {...toView(beacon)}
              r={unit * 0.4}
              fill="#9ED0FF"
              fillOpacity={0.6}
            >
              <title>{beacon.name}</title>
            </circle>
          ))}

        {start && end && (
          <line
            x1={start.cx}
            y1={start.cy}
            x2={end.cx}
            y2={end.cy}
            stroke="#F2F7FC"
            strokeOpacity={0.8}
            strokeWidth={unit * 0.3}
            strokeDasharray={`${unit} ${unit * 0.6}`}
          />
        )}
        {start && <circle {...start} r={unit} fill="#F2F7FC" />}
        {end && (
          <circle
            {...end}
            r={unit}
            fill="none"
            stroke="#F2F7FC"
            strokeWidth={unit * 0.4}
          />
        )}
        {exit && <circle {...exit} r={unit * 0.6} fill="#34D399" />}
        <g>
          <circle
            {...aim}
            r={unit * 1.6}
            fill="none"
            stroke="#FF9F7A"
            strokeWidth={unit * 0.4}
          />
          <circle {...aim} r={unit * 0.5} fill="#FF9F7A" />
        </g>
      </svg>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-2 text-[11px] text-[#9ED0FF]/70">
        <span>
          <span className="mr-1 inline-block size-2 rounded-full bg-[#FF9F7A]" />
          {t("legend.target")}
        </span>
        {exit && (
          <span>
            <span className="mr-1 inline-block size-2 rounded-full bg-emerald-400" />
            {t("legend.exit")}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
