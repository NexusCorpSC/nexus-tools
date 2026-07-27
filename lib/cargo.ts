/**
 * Cargo manifest domain logic.
 *
 * Splits a cargo volume expressed in SCU into the standard Star Citizen
 * container sizes, so a hauler knows exactly how many boxes of each size to
 * load for a given destination.
 */

export const CONTAINER_SIZES = [32, 24, 16, 8, 4, 2, 1] as const;

export type ContainerSize = (typeof CONTAINER_SIZES)[number];

export interface Transport {
  id: string;
  name: string;
  capacity: number;
}

/**
 * Ships available out of the box. Administrators can extend or replace this
 * list from /admin/cargo-ships; these are the fallback when none is stored.
 */
export const DEFAULT_TRANSPORTS: Transport[] = [
  { id: "hull-b", name: "Hull B", capacity: 512 },
  { id: "railen", name: "Railen", capacity: 640 },
  { id: "ironclad", name: "Ironclad", capacity: 2160 },
];

/** Pseudo transport letting the user type an arbitrary capacity. */
export const CUSTOM_TRANSPORT_ID = "custom";

export const DEFAULT_TRANSPORT_ID = "ironclad";
export const DEFAULT_MAX_CONTAINER: ContainerSize = 16;

export const MAX_SHIP_NAME_LENGTH = 80;
export const MAX_SHIP_CAPACITY = 1_000_000;

/** Below this many SCU left, the remaining capacity is flagged as tight. */
export const LOW_CAPACITY_THRESHOLD = 50;

export const MAX_VOLUME = 100_000;

export interface CargoLine {
  id: string;
  destination: string;
  content: string;
  /** "Emplacement": where the cargo sits (pad, hangar, warehouse...). */
  location: string;
  /** Optional mission the line belongs to; groups rows in the table. */
  mission: string;
  volume: number;
  /** Largest container size allowed when this line was computed. */
  maxContainer: ContainerSize;
  /** Container counts, aligned with CONTAINER_SIZES. */
  quantities: number[];
}

export interface DestinationTotals {
  destination: string;
  volume: number;
  quantities: number[];
  lineCount: number;
}

export function emptyQuantities(): number[] {
  return CONTAINER_SIZES.map(() => 0);
}

export function isContainerSize(value: number): value is ContainerSize {
  return (CONTAINER_SIZES as readonly number[]).includes(value);
}

export function findTransport(
  transports: Transport[],
  id: string,
): Transport | undefined {
  return transports.find((transport) => transport.id === id);
}

/**
 * Turns a ship name into a stable, readable identifier. Manifests reference
 * ships by id from the browser, so ids must not change when a ship is renamed.
 */
export function toShipId(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      // Truncating last, then trimming, so a cut mid-separator cannot leave a
      // dangling hyphen behind.
      .slice(0, MAX_SHIP_NAME_LENGTH)
      .replace(/^-+|-+$/g, "") || "ship"
  );
}

/**
 * Greedily fills the largest allowed containers first. Because 1 SCU is part of
 * the size list, the decomposition is always exact for a positive integer
 * volume.
 */
export function splitVolume(volume: number, maxContainer: number): number[] {
  let remaining = Math.max(0, Math.floor(volume));

  return CONTAINER_SIZES.map((size) => {
    if (size > maxContainer) {
      return 0;
    }

    const count = Math.floor(remaining / size);
    remaining -= count * size;
    return count;
  });
}

export function sumQuantities(lines: CargoLine[]): number[] {
  return lines.reduce<number[]>((totals, line) => {
    line.quantities.forEach((quantity, index) => {
      totals[index] += quantity;
    });
    return totals;
  }, emptyQuantities());
}

export function totalVolume(lines: CargoLine[]): number {
  return lines.reduce((total, line) => total + line.volume, 0);
}

/** Total number of physical boxes, all sizes combined. */
export function containerCount(quantities: number[]): number {
  return quantities.reduce((total, quantity) => total + quantity, 0);
}

export function groupByDestination(lines: CargoLine[]): DestinationTotals[] {
  const groups = new Map<string, CargoLine[]>();

  for (const line of lines) {
    const existing = groups.get(line.destination);
    if (existing) {
      existing.push(line);
    } else {
      groups.set(line.destination, [line]);
    }
  }

  return [...groups.entries()]
    .map(([destination, groupLines]) => ({
      destination,
      volume: totalVolume(groupLines),
      quantities: sumQuantities(groupLines),
      lineCount: groupLines.length,
    }))
    .sort((a, b) => a.destination.localeCompare(b.destination));
}

export const SORT_KEYS = [
  "manifest",
  "destination",
  "content",
  "location",
  "volume",
  "boxes",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

export interface ManifestFilters {
  /** Free text matched against every text field of a line. */
  search: string;
  mission: string;
  destination: string;
  location: string;
}

export const EMPTY_FILTERS: ManifestFilters = {
  search: "",
  mission: "",
  destination: "",
  location: "",
};

/**
 * Facet value standing for "lines that have nothing in this field". An empty
 * string already means "no filter", hence the dedicated marker.
 */
export const UNASSIGNED_FILTER = "__unassigned__";

function matchesFacet(value: string, filter: string): boolean {
  if (!filter) {
    return true;
  }

  return filter === UNASSIGNED_FILTER ? value === "" : value === filter;
}

export function hasActiveFilters(filters: ManifestFilters): boolean {
  return Object.values(filters).some((value) => value !== "");
}

export function filterLines(
  lines: CargoLine[],
  filters: ManifestFilters,
): CargoLine[] {
  const search = filters.search.trim().toLowerCase();

  return lines.filter((line) => {
    if (
      !matchesFacet(line.mission, filters.mission) ||
      !matchesFacet(line.destination, filters.destination) ||
      !matchesFacet(line.location, filters.location)
    ) {
      return false;
    }

    if (!search) {
      return true;
    }

    return [line.destination, line.content, line.location, line.mission].some(
      (field) => field.toLowerCase().includes(search),
    );
  });
}

/** Sorts a copy of the lines; "manifest" keeps the order they were added in. */
export function sortLines(
  lines: CargoLine[],
  key: SortKey,
  direction: SortDirection,
): CargoLine[] {
  if (key === "manifest") {
    return direction === "asc" ? [...lines] : [...lines].reverse();
  }

  const factor = direction === "asc" ? 1 : -1;

  return [...lines].sort((a, b) => {
    switch (key) {
      case "volume":
        return (a.volume - b.volume) * factor;
      case "boxes":
        return (
          (containerCount(a.quantities) - containerCount(b.quantities)) * factor
        );
      default:
        return a[key].localeCompare(b[key]) * factor;
    }
  });
}

/** Fields a bulk edit can rewrite; an absent key is left untouched. */
export interface BulkLineChanges {
  destination?: string;
  content?: string;
  location?: string;
  mission?: string;
}

export function hasBulkChanges(changes: BulkLineChanges): boolean {
  return Object.keys(changes).length > 0;
}

export function applyBulkChanges(
  lines: CargoLine[],
  ids: Iterable<string>,
  changes: BulkLineChanges,
): CargoLine[] {
  const targets = new Set(ids);

  if (targets.size === 0 || !hasBulkChanges(changes)) {
    return lines;
  }

  return lines.map((line) =>
    targets.has(line.id) ? { ...line, ...changes } : line,
  );
}

export interface MissionGroup {
  mission: string;
  lines: CargoLine[];
  volume: number;
  quantities: number[];
}

/**
 * Splits the manifest into mission groups, in order of first appearance, so
 * the table can show one block per mission. Lines without a mission end up in
 * a single trailing group keyed by an empty string.
 */
export function groupByMission(lines: CargoLine[]): MissionGroup[] {
  const groups = new Map<string, CargoLine[]>();

  for (const line of lines) {
    const existing = groups.get(line.mission);
    if (existing) {
      existing.push(line);
    } else {
      groups.set(line.mission, [line]);
    }
  }

  return [...groups.entries()]
    .sort(([a], [b]) => {
      // Unassigned lines stay last, everything else keeps insertion order.
      if (a === b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return 0;
    })
    .map(([mission, groupLines]) => ({
      mission,
      lines: groupLines,
      volume: totalVolume(groupLines),
      quantities: sumQuantities(groupLines),
    }));
}

export function hasMissions(lines: CargoLine[]): boolean {
  return lines.some((line) => line.mission !== "");
}

export interface ParsedBulkLine {
  destination: string;
  content: string;
  volume: number;
  location: string;
  mission: string;
}

/**
 * Parses a single bulk row: `Destination;Contenu;Volume;Emplacement[;Mission]`.
 * The mission is optional. Returns null when the row is malformed so the
 * caller can report it.
 */
export function parseBulkLine(raw: string): ParsedBulkLine | null {
  const parts = raw.split(";").map((part) => part.trim());

  if (parts.length < 4) {
    return null;
  }

  const [destination, content, volumeRaw, location] = parts;
  const mission = parts[4] ?? "";

  if (!destination || !volumeRaw) {
    return null;
  }

  const volume = Number(volumeRaw.replace(",", "."));

  if (!Number.isFinite(volume)) {
    return null;
  }

  const rounded = Math.floor(volume);

  if (rounded <= 0 || rounded > MAX_VOLUME) {
    return null;
  }

  return { destination, content, volume: rounded, location, mission };
}

export interface BulkParseResult {
  parsed: ParsedBulkLine[];
  invalid: string[];
}

export function parseBulk(raw: string): BulkParseResult {
  const parsed: ParsedBulkLine[] = [];
  const invalid: string[] = [];

  for (const rawLine of raw.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    const line = parseBulkLine(trimmed);
    if (line) {
      parsed.push(line);
    } else {
      invalid.push(trimmed);
    }
  }

  return { parsed, invalid };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[";\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Semicolon separated export. The four leading columns follow the bulk import
 * format so an export can be pasted straight back into the bulk dialog.
 */
export function linesToCsv(lines: CargoLine[]): string {
  const header = [
    "Destination",
    "Contenu",
    "Volume",
    "Emplacement",
    "Mission",
    ...CONTAINER_SIZES.map(String),
  ];

  const rows = lines.map((line) =>
    [
      line.destination,
      line.content,
      line.volume,
      line.location,
      line.mission,
      ...line.quantities,
    ].map(csvCell),
  );

  const totals = sumQuantities(lines);
  const totalRow = ["TOTAL", "", totalVolume(lines), "", "", ...totals].map(
    csvCell,
  );

  return [header, ...rows, totalRow].map((row) => row.join(";")).join("\n");
}
