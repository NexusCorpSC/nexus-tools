/**
 * Parsing of the in-game mission log, as read from a screenshot by OCR.
 *
 * The objectives always take this shape, repeated for each delivery:
 *
 *   Deliver 0/[Quantity] SCU of [Resource] to [Destination] above [Planet].
 *     Collect [Resource] from [Origin].
 *
 * The station is "above" the planet it orbits, and "on" it when the drop-off
 * sits on the surface — Area18 on ArcCorp, Orison on Crusader.
 */

import {
  type BulkParseResult,
  MAX_VOLUME,
  type ParsedBulkLine,
  parseBulk,
} from "@/lib/cargo";

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
 * the trailing period is optional, digits come back as the letters they look
 * like, and even the "Deliver" verb is sometimes lost — the "N SCU of ... to
 * ..." shape carries the objective on its own.
 */

/** A digit, or one of the letters the in-game font's digits are read as. */
const DIGIT = "[0-9OoQlIiSBZ]";

/** The already-delivered count, "0/", which is dropped. */
const DELIVERED = `(?:${DIGIT}{1,5}\\s*[/|\\\\]\\s*)?`;

/** Prepositions between the destination and the body it belongs to. */
const BODY = "above|on|over|at";

const DELIVER = new RegExp(
  `(?:deliver\\s+)?${DELIVERED}(${DIGIT}{1,5})\\s*scu\\s+of\\s+(.+?)\\s+to\\s+` +
    `(.+?)(?:\\s+(?:${BODY})\\s+(.+?))?\\s*[.,;:]?\\s*$`,
  "i",
);

const COLLECT = /collect\s+(.+?)\s+from\s+(.+?)\s*[.,;:]?\s*$/i;

/**
 * Where an objective starts. The verb opens one; so does a bare "0/3 SCU", but
 * only when it is not the quantity of a "Deliver" just read.
 */
const OBJECTIVE_START = new RegExp(
  `\\b(?:(deliver|collect)|${DIGIT}{1,5}\\s*[/|\\\\]\\s*${DIGIT}{1,5}\\s*scu)\\b`,
  "gi",
);

const OPENS_OBJECTIVE = new RegExp(`^(?:${OBJECTIVE_START.source})`, "i");
const HAS_OBJECTIVE = new RegExp(OBJECTIVE_START.source, "i");

/** How far back a quantity is checked for the verb it may belong to. */
const VERB_LOOKBACK = 12;

/** Letters standing in for a digit, mapped back to the digit they look like. */
const DIGIT_LOOKALIKES: Record<string, string> = {
  O: "0",
  o: "0",
  Q: "0",
  l: "1",
  I: "1",
  i: "1",
  S: "5",
  B: "8",
  Z: "2",
};

/** The number a run of digits — or their look-alike letters — spells out. */
function readQuantity(raw: string): number {
  const digits = raw.replace(/[^0-9]/g, (char) => DIGIT_LOOKALIKES[char] ?? "");

  return digits === "" ? Number.NaN : Number(digits);
}

/**
 * Repairs the lowercase l the in-game font hands back as a capital I, as in
 * "Audio-VisuaI Equipment". Only ever inside a word, where a capital cannot be
 * genuine, so "Area18" and "ArcCorp" are left alone.
 */
function repairGlyphs(text: string): string {
  return text.replace(/(\p{Ll})I(?=\p{Ll}|[^\p{L}]|$)/gu, "$1l");
}

/** A resource or place name as it should be written on the sheet. */
function cleanName(raw: string): string {
  return repairGlyphs(raw.replace(/\s+/g, " ").trim())
    .replace(/[.,;:]+$/, "")
    .trim();
}

/** Comparable form of a name, with OCR's case and glyph noise removed. */
function nameKey(name: string): string {
  return repairGlyphs(name)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Drops the leading bullet, whatever OCR made of it — the diamond glyph comes
 * back as ©, &, <>, * and more depending on the capture, and often enough as a
 * lone letter O, which no amount of punctuation stripping catches.
 */
function cleanLine(raw: string): string {
  return raw
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^[OoQ0e]\s+(?=[\p{L}\p{N}])/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The same bullet, left behind at the tail of the objective before it — every
 * glyph `cleanLine` drops at the head, and the letter OCR sometimes reads in
 * its place. The leading `\s+` is what keeps the objective's own period: a
 * terminator has no space in front of it.
 */
function trimTrailingBullet(line: string): string {
  return line.replace(/\s+[^\p{L}\p{N}]*[OoQ0e]?[^\p{L}\p{N}]*$/u, "").trim();
}

/**
 * Cuts a line holding several objectives back apart.
 *
 * One line per line on screen is the normal case, but a log read as a single
 * block — or pasted from somewhere that lost its newlines — arrives with every
 * objective run together, which no single pattern can read.
 */
function splitObjectives(line: string): string[] {
  const starts: number[] = [];

  for (const match of line.matchAll(OBJECTIVE_START)) {
    const index = match.index ?? 0;

    // A quantity belongs to the "Deliver" right in front of it; standing on
    // its own, it is an objective whose verb the capture lost.
    if (!match[1]) {
      const before = line.slice(Math.max(0, index - VERB_LOOKBACK), index);

      if (/deliver[\s,;:]*$/i.test(before)) {
        continue;
      }
    }

    starts.push(index);
  }

  // Anything else — a heading, a reward, a stray word — is left as it is for
  // the caller to make sense of.
  if (starts.length === 0) {
    return [line];
  }

  return starts
    .map((start, position) => line.slice(start, starts[position + 1]))
    .map((segment) => trimTrailingBullet(segment.trim()))
    .filter((segment) => segment !== "");
}

function isObjectiveLike(line: string): boolean {
  return (
    /scu/i.test(line) && (/deliver/i.test(line) || OPENS_OBJECTIVE.test(line))
  );
}

/**
 * Hangs a "Collect" line on its delivery. The line names the resource a second
 * time, so it can find its own even when the log was read out of order or the
 * "Deliver" above it was missed; failing that it falls back to the last
 * delivery still waiting for an origin, which is the order the game lists them.
 */
function attachOrigin(
  objectives: MissionObjective[],
  resource: string,
  origin: string,
): void {
  if (origin === "") {
    return;
  }

  const waiting = objectives.filter((objective) => objective.origin === "");
  const key = nameKey(resource);

  let target = waiting[waiting.length - 1];

  for (let index = waiting.length - 1; index >= 0; index -= 1) {
    if (nameKey(waiting[index].resource) === key) {
      target = waiting[index];
      break;
    }
  }

  if (target) {
    target.origin = origin;
  }
}

/**
 * Reads the objectives out of an OCR dump. Each "Collect" line attaches to the
 * delivery above it, which is the order the game lists them in.
 */
export function parseMissionText(raw: string): MissionParseResult {
  // The game wraps long objectives, so lines are joined back together before
  // matching: a wrapped objective ends mid-sentence.
  const objectives: MissionObjective[] = [];
  const ignored: string[] = [];

  const lines = raw
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => line !== "");

  const merged: string[] = [];
  for (const line of lines) {
    const previous = merged[merged.length - 1];

    // The game closes every objective with a period, so an objective line
    // without one is a wrapped line waiting for its tail. The terminator is
    // matched as loosely as the patterns below read it, since OCR turns the
    // period into a comma or a semicolon often enough.
    const continues =
      previous !== undefined &&
      HAS_OBJECTIVE.test(previous) &&
      !/[.,;:]$/.test(previous) &&
      !OPENS_OBJECTIVE.test(line);

    if (continues) {
      merged[merged.length - 1] = `${previous} ${line}`;
    } else {
      merged.push(line);
    }
  }

  for (const segment of merged.flatMap(splitObjectives)) {
    // "Deliver" is optional in the pattern, so a "Collect" line is kept away
    // from it rather than risk being read as a truncated delivery.
    const deliver = /^collect\b/i.test(segment) ? null : DELIVER.exec(segment);

    if (deliver) {
      const volume = readQuantity(deliver[1]);

      if (!Number.isFinite(volume) || volume <= 0 || volume > MAX_VOLUME) {
        ignored.push(segment);
        continue;
      }

      objectives.push({
        volume,
        resource: cleanName(deliver[2]),
        destination: cleanName(deliver[3]),
        planet: cleanName(deliver[4] ?? ""),
        origin: "",
      });
      continue;
    }

    const collect = COLLECT.exec(segment);

    if (collect) {
      attachOrigin(objectives, cleanName(collect[1]), cleanName(collect[2]));
      continue;
    }

    if (isObjectiveLike(segment)) {
      ignored.push(segment);
    }
  }

  return { objectives, ignored };
}

/** Objectives as cargo lines: the pickup station becomes the location. */
export function objectivesToBulkLines(
  objectives: MissionObjective[],
): ParsedBulkLine[] {
  return objectives.map((objective) => ({
    destination: objective.destination,
    content: objective.resource,
    volume: objective.volume,
    location: objective.origin,
    mission: "",
  }));
}

export interface QuickEntryParseResult extends BulkParseResult {
  /** Which format the text was read as, for wording the feedback. */
  source: "objectives" | "rows";
}

/**
 * Reads the quick entry field, which accepts both formats: the usual
 * `Destination;Contenu;Volume;Emplacement` rows, and mission log text pasted
 * straight from the game — or from the OCR debug box.
 */
export function parseQuickEntry(raw: string): QuickEntryParseResult {
  const mission = parseMissionText(raw);

  if (mission.objectives.length > 0) {
    return {
      parsed: objectivesToBulkLines(mission.objectives),
      invalid: mission.ignored,
      source: "objectives",
    };
  }

  return { ...parseBulk(raw), source: "rows" };
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
