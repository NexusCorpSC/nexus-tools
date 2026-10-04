export type FactionLevel = {
  /** Position relative au rang par défaut : négative en dessous (Hostile, Not Eligible), 0 au défaut. */
  level: number;
  name: string;
  isDefault: boolean;
  /** Nom technique du rang dans le jeu (`Technician_Rank2`), posé par l'import. */
  gameName?: string;
  /** Réputation à atteindre pour ce rang, posée par l'import. */
  minReputation?: number;
};

export type FactionCareer = {
  name: string;
  levels: FactionLevel[];
  /** Nom technique du barème dans le jeu (`Security_MercenaryGuild`), posé par l'import. */
  gameScope?: string;
};

export type Faction = {
  name: string;
  standings: string[];
  defaultStanding: string;
  careers: FactionCareer[];
  /** GUID de la faction dans le jeu, posé par l'import. */
  gameId?: string;
  description?: string;
  lawful?: boolean;
  focus?: string;
  headquarters?: string;
  /** Version du jeu où la faction a disparu de la source ; elle reste pour les joueurs qui l'ont suivie. */
  removedInVersion?: string;
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
