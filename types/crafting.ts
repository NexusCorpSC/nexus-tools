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
  owned?: boolean;
};

export type UserBlueprint = {
  blueprintId: Blueprint["id"];
  userId: string;
  addedAt: string;
};
