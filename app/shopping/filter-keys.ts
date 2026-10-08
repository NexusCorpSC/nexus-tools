/**
 * Les clés de l'adresse que lisent les filtres de la marketplace. La page
 * serveur les relit et les garde d'une page à l'autre ; la colonne de
 * filtres les efface. Hors du module client pour être lisible des deux.
 */
export const FILTER_KEYS = [
  "q",
  "type",
  "category",
  "system",
  "min",
  "max",
  "size",
  "stock",
  "sort",
] as const;
