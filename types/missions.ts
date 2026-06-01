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
};

export type FactionWithBlueprints = {
  _id: string;
  name: string;
  blueprints: MissionBlueprint[];
};

