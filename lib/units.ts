import { roundQty } from "@/lib/utils";

/**
 * Units that are the same measure at another scale, and how many of each make
 * the unit they are shown in: a refinery yields cSCU, a hangar holds SCU, and
 * 100 cSCU make one SCU. The inventory shows both in SCU, so a resource is one
 * card whatever unit its lots were counted in.
 */
const SCALED_UNITS: Record<string, { unit: string; perUnit: number }> = {
  scu: { unit: "SCU", perUnit: 1 },
  cscu: { unit: "SCU", perUnit: 100 },
};

export type DisplayUnit = {
  /** The unit shown, when there is one. */
  unit?: string;
  /** How many of the stored unit make one of the shown unit. */
  perUnit: number;
};

/** The unit a quantity stored in `unit` is shown in. */
export function displayUnit(unit?: string | null): DisplayUnit {
  const trimmed = unit?.trim();
  if (!trimmed) return { perUnit: 1 };
  return SCALED_UNITS[trimmed.toLowerCase()] ?? { unit: trimmed, perUnit: 1 };
}

/** A quantity stored in `unit`, in the unit it is shown in. */
export function toDisplayQty(quantity: number, unit?: string | null): number {
  return roundQty(quantity / displayUnit(unit).perUnit);
}

/** A quantity typed in the shown unit, back in the stored `unit`. */
export function fromDisplayQty(quantity: number, unit?: string | null): number {
  return roundQty(quantity * displayUnit(unit).perUnit);
}
