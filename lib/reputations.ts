export type FactionLevel = {
  level: number;
  name: string;
  isDefault: boolean;
};

export type Faction = {
  name: string;
  levels: FactionLevel[];
};
