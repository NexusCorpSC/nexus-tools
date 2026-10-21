import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  timelineEndTime,
  type TimelineEventSummary,
  type TimelineEventType,
} from "@/types/timeline-events";
import { timelinePath } from "./components";

/** Deux lignes : ce qui se joue dans l'univers, et les salons, Free Fly et fêtes. */
const LANES: { id: "ingame" | "shows"; types: TimelineEventType[] }[] = [
  { id: "ingame", types: ["ingame", "economy"] },
  { id: "shows", types: ["expo", "freefly", "festival"] },
];

const DOT: Record<TimelineEventSummary["status"], string> = {
  live: "bg-[#7FF0D0] shadow-[0_0_0_4px_rgba(127,240,208,0.25)]",
  upcoming: "bg-[#F7D68F]",
  announced: "bg-[#F7D68F]",
  ended: "",
};

/**
 * La frise : une colonne par année, de la plus ancienne à l'année en cours,
 * chaque évènement placé à sa date et étiré sur sa durée. Elle suit les filtres
 * de l'historique.
 */
export async function Frieze({ events }: { events: TimelineEventSummary[] }) {
  const t = await getTranslations("Timeline");
  const dated = events.filter((event) => event.startAt);
  const now = new Date();
  const firstYear = Math.min(
    now.getUTCFullYear(),
    ...dated.map((event) => new Date(event.startAt!).getUTCFullYear()),
  );
  const lastYear = Math.max(
    now.getUTCFullYear(),
    ...dated.map((event) => new Date(event.startAt!).getUTCFullYear()),
  );
  const years = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => firstYear + index,
  );
  const from = Date.UTC(firstYear, 0, 1);
  const span = Date.UTC(lastYear + 1, 0, 1) - from;
  const position = (time: number) =>
    Math.min(100, Math.max(0, ((time - from) / span) * 100));

  return (
    <div className="space-y-2 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] px-5 pb-3 pt-4">
      <div className="overflow-x-auto">
        <div
          className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3"
          style={{ minWidth: Math.max(640, years.length * 140) }}
        >
          <span />
          <div
            className="grid border-b border-[#9ED0FF]/20 pb-1.5 font-mono text-xs text-muted-foreground"
            style={{ gridTemplateColumns: `repeat(${years.length}, minmax(0, 1fr))` }}
          >
            {years.map((year) => (
              <span key={year}>{year}</span>
            ))}
          </div>
          {LANES.map((lane) => (
            <div key={lane.id} className="contents">
              <span className="self-center text-xs text-muted-foreground">
                {t(`lanes.${lane.id}`)}
              </span>
              <ul className="relative h-9 border-b border-dashed border-[#9ED0FF]/15">
                {dated
                  .filter((event) => lane.types.includes(event.type))
                  .map((event) => {
                    const start = new Date(event.startAt!).getTime();
                    const end = Math.min(
                      timelineEndTime(event),
                      Math.max(start, now.getTime()),
                    );
                    const left = position(start);
                    const width = Math.max(0, position(end) - left);
                    return (
                      <li key={event.id}>
                        <Link
                          href={timelinePath(event.slug)}
                          title={event.name}
                          aria-label={event.name}
                          className={`absolute top-2.5 h-3.5 min-w-3.5 rounded-full hover:ring-2 hover:ring-[#E3F1FF]/60 focus-visible:ring-2 focus-visible:ring-[#E3F1FF] focus-visible:outline-none ${
                            DOT[event.status] ||
                            (lane.id === "ingame" ? "bg-[#9ED0FF]" : "bg-[#F7D68F]/80")
                          }`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        />
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("friezeHint")}</p>
    </div>
  );
}
