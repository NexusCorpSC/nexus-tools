import {
  CargoLine,
  ContainerSize,
  DEFAULT_MAX_CONTAINER,
  DEFAULT_TRANSPORT_ID,
  isContainerSize,
  MAX_VOLUME,
  splitVolume,
} from "@/lib/cargo";

export const STORAGE_KEY = "nexus-tools:cargo-manifest:v1";

export interface ManifestState {
  transportId: string;
  /** Capacity used when the custom transport is selected. */
  customCapacity: number;
  maxContainer: ContainerSize;
  lines: CargoLine[];
}

export const initialManifestState: ManifestState = {
  transportId: DEFAULT_TRANSPORT_ID,
  customCapacity: 1000,
  maxContainer: DEFAULT_MAX_CONTAINER,
  lines: [],
};

function sanitizeLine(raw: unknown): CargoLine | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const line = raw as Record<string, unknown>;
  const volume = Number(line.volume);

  if (
    typeof line.id !== "string" ||
    !Number.isFinite(volume) ||
    volume <= 0 ||
    volume > MAX_VOLUME
  ) {
    return null;
  }

  const maxContainer =
    typeof line.maxContainer === "number" && isContainerSize(line.maxContainer)
      ? line.maxContainer
      : DEFAULT_MAX_CONTAINER;

  const sanitizedVolume = Math.floor(volume);

  return {
    id: line.id,
    destination: typeof line.destination === "string" ? line.destination : "",
    content: typeof line.content === "string" ? line.content : "",
    location: typeof line.location === "string" ? line.location : "",
    volume: sanitizedVolume,
    maxContainer,
    // Quantities are derived from the volume and the maximum container size:
    // recomputing is cheap and rules out stale or corrupted stored counts.
    quantities: splitVolume(sanitizedVolume, maxContainer),
  };
}

/** Reads the manifest from localStorage, ignoring anything malformed. */
export function loadManifest(): ManifestState {
  if (typeof window === "undefined") {
    return initialManifestState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return initialManifestState;
    }

    const parsed = JSON.parse(raw) as Partial<ManifestState>;
    const customCapacity = Number(parsed.customCapacity);

    return {
      transportId:
        typeof parsed.transportId === "string"
          ? parsed.transportId
          : initialManifestState.transportId,
      customCapacity:
        Number.isFinite(customCapacity) && customCapacity > 0
          ? Math.floor(customCapacity)
          : initialManifestState.customCapacity,
      maxContainer:
        typeof parsed.maxContainer === "number" &&
        isContainerSize(parsed.maxContainer)
          ? parsed.maxContainer
          : initialManifestState.maxContainer,
      lines: Array.isArray(parsed.lines)
        ? parsed.lines
            .map(sanitizeLine)
            .filter((line): line is CargoLine => line !== null)
        : [],
    };
  } catch {
    return initialManifestState;
  }
}

function saveManifest(state: ManifestState): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private mode): the manifest stays in memory.
  }
}

/*
 * Tiny external store so the manifest can be read with useSyncExternalStore:
 * the server renders the empty manifest and the browser swaps in the stored
 * one right after hydration, without a hydration mismatch.
 */

let snapshot: ManifestState | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeToManifest(listener: () => void): () => void {
  listeners.add(listener);

  // Keep tabs of the same browser in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) {
      snapshot = loadManifest();
      emit();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getManifestSnapshot(): ManifestState {
  snapshot ??= loadManifest();
  return snapshot;
}

export function getManifestServerSnapshot(): ManifestState {
  return initialManifestState;
}

export function updateManifest(
  updater: (current: ManifestState) => ManifestState,
): void {
  snapshot = updater(getManifestSnapshot());
  saveManifest(snapshot);
  emit();
}
