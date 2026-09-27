/**
 * Parsing of a completed refinery work order, as read from a screenshot by
 * OCR. The panel lists what the refinery gave back, one material a line:
 *
 *   MATERIALS YIELDED (CSCU)     QUALITY    YIELD
 *   [icon] IRON                      325      300
 *   [icon] LINDINIUM                 729      250
 *   ...
 *   YIELD                                  1823 cSCU
 *
 * The same material comes back once per quality, so a line is a lot, not a
 * material: two IRON lines are two lots of iron.
 */

/**
 * The materials a refinery hands back — the `resources` of
 * `assets/blueprints.json`, which is too heavy to ship to the browser, plus
 * the inert materials every order leaves.
 */
export const REFINED_MATERIALS = [
  "Agricium",
  "Aluminum",
  "Aslarite",
  "Beryl",
  "Bexalite",
  "Borase",
  "Copper",
  "Corundum",
  "Gold",
  "Hephaestanite",
  "Inert Materials",
  "Iron",
  "Laranite",
  "Lindinium",
  "Ouratite",
  "Pressurized Ice",
  "Quantainium",
  "Quartz",
  "Riccite",
  "Savrilium",
  "Silicon",
  "Stileron",
  "Taranite",
  "Tin",
  "Titanium",
  "Torite",
  "Tungsten",
] as const;

export interface WorkOrderLine {
  /** The material, snapped to a known one when OCR came close enough. */
  name: string;
  /** Out of 1000; missing when OCR could not read it. */
  quality?: number;
  /** In cSCU, as the panel gives it; missing when OCR could not read it. */
  quantity?: number;
  /** The line as OCR gave it, to show next to a doubtful reading. */
  raw: string;
  /** False when the name matched no known material. */
  known: boolean;
}

export interface WorkOrderParseResult {
  lines: WorkOrderLine[];
  /** The panel's own YIELD total, in cSCU, when it could be read. */
  total?: number;
}

/** A digit, or one of the letters the in-game font's digits are read as. */
const DIGIT = "[0-9OoQDlIi|SsBZz]";

const DIGIT_LOOKALIKES: Record<string, string> = {
  O: "0",
  o: "0",
  Q: "0",
  D: "0",
  l: "1",
  I: "1",
  i: "1",
  "|": "1",
  S: "5",
  s: "5",
  B: "8",
  Z: "2",
  z: "2",
};

/** The number a run of digits — or their look-alike letters — spells out. */
function readNumber(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/[^0-9]/g, (char) => DIGIT_LOOKALIKES[char] ?? "");
  return digits === "" ? undefined : Number(digits);
}

/**
 * Splits a line into the material's name and the numbers after it: the name
 * runs until the first word holding a real digit, and the numbers are the
 * words holding one — a column OCR turned into "TT)" is simply missing.
 */
function splitLine(body: string): { name: string; numbers: string[] } {
  const words = body.split(/\s+/).filter(Boolean);
  const first = words.findIndex((word) => /[0-9]/.test(word));
  const nameWords = first === -1 ? words : words.slice(0, first);
  const numbers =
    first === -1 ? [] : words.slice(first).filter((word) => /[0-9]/.test(word));
  return { name: nameWords.join(" "), numbers };
}

/** The header above the lines, however much of it OCR kept. */
const HEADER = /(?:ualit|yielded|\(c?scu\))/i;

/**
 * The total under the lines, "YIELD 1823", which OCR clips and mangles —
 * "IELD 1823", "[ELD 1823", "ELD 1823\"", "YIL_D 182 3". Told by its word, close enough to
 * "yield", followed by nothing but the number.
 */
function readTotal(line: string): number | undefined {
  const match = line.match(
    new RegExp(`^([^0-9]{2,10}?)\\s+(${DIGIT}[0-9\\s]*?)[^A-Za-z0-9]*$`),
  );
  if (!match) return undefined;
  const word = match[1].toLowerCase().replace(/[^a-z]/g, "");
  if (!word || levenshtein(word, "yield") > 2) return undefined;
  return readNumber(match[2].replace(/\s/g, ""));
}

/** What closes the list, when the total was lost. */
const END = /\b(?:results|work order complete|storage)\b/i;

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * The known material a name read by OCR stands for: the closest one, when it
 * is close enough — "RON" is Iron, "LINDINUM" is Lindinium. A name matching
 * none is kept as read, in title case, to be checked by hand.
 */
export function snapMaterial(read: string): { name: string; known: boolean } {
  const key = read.toLowerCase().replace(/[^a-z]/g, "");
  if (!key) return { name: read.trim(), known: false };

  let best: { name: string; distance: number } | null = null;
  for (const material of REFINED_MATERIALS) {
    const distance = levenshtein(
      key,
      material.toLowerCase().replace(/[^a-z]/g, ""),
    );
    if (!best || distance < best.distance) {
      best = { name: material, distance };
    }
  }

  // A third of the letters may be wrong, never more: short names stay strict.
  if (best && best.distance <= Math.max(1, Math.floor(key.length / 3))) {
    return { name: best.name, known: true };
  }

  const titled = read
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/(^|[\s(-])\p{L}/gu, (letter) => letter.toUpperCase());
  return { name: titled, known: false };
}

/**
 * Reads the materials of a completed work order out of the OCR text.
 *
 * Only the lines between the column header and the total are taken, so the
 * title, the order number and the buttons around the list are never mistaken
 * for a material. When OCR lost the header, every line shaped like one is
 * taken instead.
 */
export function parseWorkOrderText(text: string): WorkOrderParseResult {
  const all = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const headerAt = all.findIndex((line) => HEADER.test(line));
  const lines: WorkOrderLine[] = [];
  let total: number | undefined;

  for (const line of all.slice(headerAt + 1)) {
    const lineTotal = readTotal(line);
    if (lineTotal !== undefined) {
      total = lineTotal;
      break;
    }
    if (END.test(line)) break;

    // The icon in front of each line comes back as "@", "&", "4)" and more.
    const body = line.replace(/^[^A-Za-z]+/, "");
    const { name: rawName, numbers } = splitLine(body);
    if (rawName.replace(/[^A-Za-z]/g, "").length < 3) continue;
    const [rawQuality, rawQuantity] = numbers;

    const { name, known } = snapMaterial(rawName);
    // A known material is taken even with its numbers lost, to be filled in
    // by hand; anything else needs both, or it is more likely stray text —
    // the order's title, when OCR lost the header — than a lot.
    if (!known && rawQuantity === undefined) continue;

    const quality = readNumber(rawQuality);
    lines.push({
      name,
      quality: quality !== undefined && quality <= 1000 ? quality : undefined,
      quantity: readNumber(rawQuantity),
      raw: line,
      known,
    });
  }

  return { lines, total };
}
