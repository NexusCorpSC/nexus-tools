export type MissionBlueprint = {
  _id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  imageUrl?: string;
  /** Si l'utilisateur est connecté, indique s'il possède ce blueprint */
  owned?: boolean;
};

export type MissionFaction = {
  _id: string;
  name: string;
};

export type Mission = {
  _id: string;
  category: string;
  missionType: string;
  title: string;
  description: string;
  canBeShared: boolean;
  illegal: boolean;
  rewardUEC?: number;
  faction?: MissionFaction;
  blueprintDetails: MissionBlueprint[];
  /** Version du jeu dont la mission a disparu ; absente tant qu'elle existe. */
  removedInVersion?: string;
  /** La mission dans laquelle la source a fusionné celle-ci. */
  replacedBy?: string;
  /** Où elle se joue, ajouté par la communauté. */
  placeSlugs?: string[];
  /** Une astuce de joueur. */
  tip?: string;
};

export type FactionWithBlueprints = {
  _id: string;
  name: string;
  blueprints: MissionBlueprint[];
};
