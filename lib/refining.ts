/**
 * Les ordres de raffinage, ce que la page, le serveur et l'app en partagent :
 * leur forme, la lecture d'une durée et le contrôle de ce qu'un joueur saisit.
 * Rien ici ne touche la base, pour que les composants client puissent
 * l'importer ; l'accès aux données est dans `lib/refining-jobs.ts`.
 */

/** Les méthodes que propose le terminal d'une raffinerie. */
export const REFINING_METHODS = [
  "Cormack Method",
  "Dinyx Solventation",
  "Electrostarolysis",
  "Ferron Exchange",
  "Gaskin Process",
  "Kazen Winnowing",
  "Pyrometric Chromalysis",
  "Thermonatic Deposition",
  "XCR Reaction",
] as const;

/** Un matériau que l'ordre rendra : une ligne du terminal, donc un futur lot. */
export interface RefiningLine {
  name: string;
  /** Sur 1000 ; absente quand le terminal n'en donne pas (matières inertes). */
  quality?: number;
  /** En cSCU, l'unité du terminal. */
  quantity: number;
}

/** Un ordre tel que la page et l'app le reçoivent. */
export interface RefiningJob {
  id: string;
  /** Le nom de la raffinerie : celui du lieu choisi, ou le texte d'un ancien ordre. */
  location: string;
  /** Le lieu de l'inventaire (`locations`) ; absent d'un ancien ordre. */
  locationId?: string;
  method?: string;
  /** Vide pour un ancien ordre, qui n'avait que `content`. */
  lines: RefiningLine[];
  /** Le texte libre d'un ordre saisi avant les lignes. */
  content?: string;
  /** En aUEC. */
  cost?: number;
  note?: string;
  /** En minutes. */
  duration: number;
  /** ISO. */
  startTime: string;
  /** ISO : `startTime` plus `duration`. */
  endTime: string;
}

/** Ce qu'un joueur saisit pour lancer ou modifier un ordre. */
export interface RefiningJobInput {
  locationId: string;
  method?: string;
  lines: RefiningLine[];
  cost?: number;
  note?: string;
  duration: number;
}

/** Ce qu'un joueur envoie dans l'inventaire en collectant un ordre. */
export interface RefiningCollectInput {
  /** Les lignes retenues, en cSCU ; aucune pour retirer l'ordre sans rien ajouter. */
  lines: RefiningLine[];
  locationId: string;
  unit: "cSCU" | "SCU";
  orgVisible: boolean;
}

/** Au-delà, une saisie est plus sûrement une erreur qu'un ordre. */
export const MAX_REFINING_LINES = 40;
const MAX_NAME = 100;
const MAX_NOTE = 500;
/** Trente jours : aucun ordre du jeu ne dure plus. */
const MAX_DURATION = 30 * 24 * 60;

/**
 * Une durée en minutes, depuis « 1d12h30m15s », « 3h35m » ou un nombre de
 * minutes. Les secondes arrondissent à la minute du dessus ; null quand rien
 * ne se lit.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (/^\d+$/.test(text)) {
    const minutes = parseInt(text, 10);
    return minutes > 0 ? minutes : null;
  }
  if (!/^(\d+\s*[dhms]\s*)+$/.test(text)) return null;

  const units: Record<string, number> = { d: 1440, h: 60, m: 1, s: 1 / 60 };
  let minutes = 0;
  for (const [, value, unit] of text.matchAll(/(\d+)\s*([dhms])/g)) {
    minutes += parseInt(value, 10) * units[unit];
  }
  const rounded = Math.ceil(minutes);
  return rounded > 0 ? rounded : null;
}

/** La saisie d'une durée qui redonne `minutes`, comme « 1d3h35m ». */
export function formatDurationInput(minutes: number): string {
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return (
    [days && `${days}d`, hours && `${hours}h`, rest && `${rest}m`]
      .filter(Boolean)
      .join("") || "0m"
  );
}

/** Le temps restant, en minutes entières (arrondi au-dessus), jamais négatif. */
export function minutesLeft(job: Pick<RefiningJob, "endTime">, now: number) {
  return Math.max(0, Math.ceil((Date.parse(job.endTime) - now) / 60_000));
}

export function isFinished(job: Pick<RefiningJob, "endTime">, now: number) {
  return Date.parse(job.endTime) <= now;
}

/** Les cSCU que rendent les lignes d'un ordre. */
export function totalQuantity(lines: RefiningLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Prêts d'abord, puis par fin la plus proche. */
export function sortJobs<T extends Pick<RefiningJob, "endTime">>(
  jobs: T[],
): T[] {
  return [...jobs].sort((a, b) => Date.parse(a.endTime) - Date.parse(b.endTime));
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

function optionalText(value: unknown, max: number, field: string) {
  if (value === undefined || value === null) return { ok: true as const };
  if (typeof value !== "string" || value.length > max) {
    return { ok: false as const, error: `${field} must be at most ${max} characters` };
  }
  return { ok: true as const, value: value.trim() || undefined };
}

/**
 * Les lignes d'un ordre ou d'une collecte : un nom, une qualité facultative de
 * 0 à 1000, une quantité en cSCU strictement positive.
 */
export function checkLines(
  raw: unknown,
  { allowEmpty }: { allowEmpty: boolean },
): Checked<RefiningLine[]> {
  if (!Array.isArray(raw)) return { ok: false, error: "lines must be an array" };
  if (!allowEmpty && raw.length === 0) {
    return { ok: false, error: "at least one line is required" };
  }
  if (raw.length > MAX_REFINING_LINES) {
    return { ok: false, error: `at most ${MAX_REFINING_LINES} lines` };
  }

  const lines: RefiningLine[] = [];
  for (const line of raw as Record<string, unknown>[]) {
    const name = typeof line?.name === "string" ? line.name.trim() : "";
    if (!name || name.length > MAX_NAME) {
      return { ok: false, error: "every line needs a name" };
    }
    const quality = line.quality;
    if (
      quality !== undefined &&
      quality !== null &&
      (typeof quality !== "number" ||
        !Number.isInteger(quality) ||
        quality < 0 ||
        quality > 1000)
    ) {
      return { ok: false, error: "quality must be an integer from 0 to 1000" };
    }
    const quantity = line.quantity;
    if (
      typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return { ok: false, error: "quantity must be a positive number" };
    }
    lines.push({
      name,
      quality: typeof quality === "number" ? quality : undefined,
      quantity,
    });
  }
  return { ok: true, value: lines };
}

/** Ce qu'un joueur envoie pour lancer ou modifier un ordre. */
export function checkJobInput(raw: unknown): Checked<RefiningJobInput> {
  const body = (raw ?? {}) as Record<string, unknown>;

  if (typeof body.locationId !== "string" || !body.locationId.trim()) {
    return { ok: false, error: "locationId is required" };
  }

  let method: string | undefined;
  if (body.method !== undefined && body.method !== null && body.method !== "") {
    if (
      typeof body.method !== "string" ||
      !(REFINING_METHODS as readonly string[]).includes(body.method)
    ) {
      return { ok: false, error: "unknown method" };
    }
    method = body.method;
  }

  const duration = body.duration;
  if (
    typeof duration !== "number" ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > MAX_DURATION
  ) {
    return { ok: false, error: "duration must be a whole number of minutes" };
  }

  const cost = body.cost;
  if (
    cost !== undefined &&
    cost !== null &&
    (typeof cost !== "number" || !Number.isInteger(cost) || cost < 0)
  ) {
    return { ok: false, error: "cost must be a non-negative integer" };
  }

  const note = optionalText(body.note, MAX_NOTE, "note");
  if (!note.ok) return note;

  const lines = checkLines(body.lines, { allowEmpty: false });
  if (!lines.ok) return lines;

  return {
    ok: true,
    value: {
      locationId: body.locationId.trim(),
      method,
      lines: lines.value,
      cost: typeof cost === "number" ? cost : undefined,
      note: note.value,
      duration,
    },
  };
}

/** Ce qu'un joueur envoie pour collecter un ordre. */
export function checkCollectInput(raw: unknown): Checked<RefiningCollectInput> {
  const body = (raw ?? {}) as Record<string, unknown>;
  const lines = checkLines(body.lines, { allowEmpty: true });
  if (!lines.ok) return lines;

  if (lines.value.length > 0) {
    if (typeof body.locationId !== "string" || !body.locationId.trim()) {
      return { ok: false, error: "locationId is required" };
    }
  }
  if (body.unit !== "cSCU" && body.unit !== "SCU") {
    return { ok: false, error: "unit must be cSCU or SCU" };
  }

  return {
    ok: true,
    value: {
      lines: lines.value,
      locationId: typeof body.locationId === "string" ? body.locationId.trim() : "",
      unit: body.unit,
      orgVisible: body.orgVisible === true,
    },
  };
}
