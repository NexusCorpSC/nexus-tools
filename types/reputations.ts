export type FactionLevel = {
  level: number;
  name: string;
  isDefault: boolean;
};

export type FactionCareer = {
  name: string;
  levels: FactionLevel[];
};

export type Faction = {
  name: string;
  standings: string[];
  defaultStanding: string;
  careers: FactionCareer[];
};

export type PlayerReputations = {
  [factionName: string]: {
    standing: string;
    careers: {
      [careerName: string]: {
        level: FactionLevel;
      };
    };
  };
};
