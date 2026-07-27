/**
 * Parsing of the in-game mission log, as read from a screenshot by OCR.
 *
 * The objectives always take this shape, repeated for each delivery:
 *
 *   Deliver 0/[Quantity] SCU of [Resource] to [Destination] above [Planet].
 *     Collect [Resource] from [Origin].
 */

import { MAX_VOLUME } from "@/lib/cargo";

export interface MissionObjective {
  volume: number;
  resource: string;
  destination: string;
  planet: string;
  /** Where the cargo is picked up, from the "Collect ... from ..." line. */
  origin: string;
}

export interface MissionParseResult {
  objectives: MissionObjective[];
  /** Lines that looked like an objective but could not be read. */
  ignored: string[];
}

/*
 * OCR is not perfect on the in-game font, so the patterns stay forgiving:
 * the "0/" prefix may come out as "O/" or be missed entirely, spacing wanders,
 * and the trailing period is optional.
 */
const DELIVER =
  /deliver\s+(?:[0OQ]\s*[/|]\s*)?(\d+)\s*scu\s+of\s+(.+?)\s+to\s+(.+?)\s+above\s+(.+?)\s*[.,;]?\s*$/i;
const COLLECT = /collect\s+(.+?)\s+from\s+(.+?)\s*[.,;]?\s*$/i;

/**
 * Drops the leading bullet, whatever OCR made of it — the diamond glyph comes
 * back as ©, &, <>, * and more depending on the capture.
 */
function cleanLine(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isDeliverLike(line: string): boolean {
  return /deliver/i.test(line) && /scu/i.test(line);
}

/**
 * Reads the objectives out of an OCR dump. Each "Collect" line attaches to the
 * delivery above it, which is the order the game lists them in.
 */
export function parseMissionText(raw: string): MissionParseResult {
  const objectives: MissionObjective[] = [];
  const ignored: string[] = [];

  // The game wraps long objectives, so lines are joined back together before
  // matching: a wrapped "Deliver" line ends mid-sentence.
  const lines = raw
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line !== "");

  const merged: string[] = [];
  for (const line of lines) {
    const previous = merged[merged.length - 1];

    // The game closes every objective with a period, so an objective line
    // without one is a wrapped line waiting for its tail.
    const continues =
      previous !== undefined &&
      /^(deliver|collect)/i.test(previous) &&
      !/\.$/.test(previous) &&
      !/^(deliver|collect)/i.test(line);

    if (continues) {
      merged[merged.length - 1] = `${previous} ${line}`;
    } else {
      merged.push(line);
    }
  }

  for (const line of merged) {
    const deliver = DELIVER.exec(line);

    if (deliver) {
      const volume = Number(deliver[1]);

      if (!Number.isFinite(volume) || volume <= 0 || volume > MAX_VOLUME) {
        ignored.push(line);
        continue;
      }

      objectives.push({
        volume,
        resource: deliver[2].trim(),
        destination: deliver[3].trim(),
        planet: deliver[4].trim(),
        origin: "",
      });
      continue;
    }

    const collect = COLLECT.exec(line);

    if (collect) {
      const last = objectives[objectives.length - 1];
      if (last && !last.origin) {
        last.origin = collect[2].trim();
      }
      continue;
    }

    if (isDeliverLike(line)) {
      ignored.push(line);
    }
  }

  return { objectives, ignored };
}

/** Turns objectives into rows for the quick entry field. */
export function objectivesToQuickEntry(objectives: MissionObjective[]): string {
  return objectives
    .map((objective) =>
      [
        objective.destination,
        objective.resource,
        objective.volume,
        objective.origin,
      ].join(";"),
    )
    .join("\n");
}
