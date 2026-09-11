import type { ItemKind } from "@/types/items";

/**
 * Accent carried by each kind of object, so every surface that shows one —
 * fiche, comparateur — speaks the same colour. Kept out of the fiche sections
 * so a client component can read it without pulling server-only code in.
 */
export const KIND_ACCENT: Record<ItemKind, string> = {
  item: "#9ED0FF",
  vehicle: "#7FD4FF",
  weapon: "#E8472B",
  resource: "#D9A441",
};
