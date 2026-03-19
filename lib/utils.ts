import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Arrondit une quantité à 10 décimales pour éviter les erreurs de flottants
 * lors des additions/soustractions (ex: 0.1 + 0.2 → 0.3 et non 0.30000000000000004).
 */
export function roundQty(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}
