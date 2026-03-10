export type BlueprintStatistics = {
  [statName: string]: { value: string | number; unit?: string };
};

export type BlueprintRecipeStep = {
  [componentName: string]: { quantity: number; unit?: string };
};

export type Blueprint = {
  /**
   * nanoid
   */
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  subcategory?: string;
  imageUrl?: string;
  owned?: boolean;
  /** Tier du blueprint (défaut : 0) */
  tier?: number;
  /** Temps de fabrication en secondes */
  craftingTime?: number;
  /** Statistiques de l'objet fabriqué */
  statistics?: BlueprintStatistics;
  /** Recette de fabrication */
  recipe?: BlueprintRecipeStep[];
};

export type UserBlueprint = {
  blueprintId: Blueprint["id"];
  userId: string;
  addedAt: string;
};
