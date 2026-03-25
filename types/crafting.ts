export type BlueprintStatistics = {
  [statName: string]: { value: string | number; unit?: string };
};

export type BlueprintRecipeComponentOption = {
  quantity: number;
  minQuality?: number;
  name: string;
};

export type BlueprintRecipeComponent = {
  name: string;
  options: BlueprintRecipeComponentOption[];
};

export type BlueprintRecipe = {
  craftingTime: number;
  components: BlueprintRecipeComponent[];
};

export type BlueprintRecipeStep = {
  [componentName: string]: {
    quantity: number;
    unit?: string;
    minQuality?: number;
  };
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
  recipe?: BlueprintRecipe;
  /** Où obtenir ce blueprint */
  obtention?: string;
  isDefault?: boolean;
};

export type UserBlueprint = {
  blueprintId: Blueprint["id"];
  userId: string;
  addedAt: string;
};
