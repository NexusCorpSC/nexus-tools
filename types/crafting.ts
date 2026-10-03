export type BlueprintStatistics = {
  [statName: string]: { value: string | number; unit?: string };
};

export type BlueprintRecipeComponentOption = {
  quantity: number;
  minQuality?: number;
  /** `SCU` pour une ressource, `unit` pour un objet (imports). */
  unit?: string;
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
  // Les champs suivants ne sont posés que par l'import des données du jeu
  // (`npm run import:game-data`), sur les blueprints qui en viennent.
  /** GUID du blueprint dans le jeu : la clé qu'un ré-import retrouve. */
  gameId?: string;
  /** Le nom en jeu, que l'administrateur peut avoir remplacé dans `name`. */
  gameName?: string;
  gameTag?: string;
  /** GUID de l'objet fabriqué (le `source.id` des objets importés du wiki). */
  productEntityClass?: string;
  /** Les slugs qu'un renommage en jeu a remplacés, qui redirigent ici. */
  previousSlugs?: string[];
  /** Version du jeu dont le blueprint a disparu. */
  removedInVersion?: string;
};

export type UserBlueprint = {
  blueprintId: Blueprint["id"];
  userId: string;
  addedAt: string;
};
