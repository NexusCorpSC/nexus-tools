import type {
  Faction,
  FactionCareer,
  FactionLevel,
  PlayerReputations,
} from "@/types/reputations";

/** Les familles sous lesquelles /reps regroupe les factions. */
export type CareerFamily = "guild" | "hauling" | "faction" | "trade";

export const CAREER_FAMILIES: CareerFamily[] = [
  "guild",
  "hauling",
  "faction",
  "trade",
];

/**
 * La famille d'une carrière, d'après le nom technique de son barème quand
 * l'import l'a posé, sinon d'après son nom.
 */
export function careerFamily(career: FactionCareer): CareerFamily {
  const key = `${career.gameScope ?? ""} ${career.name}`.toLowerCase();
  if (/factionreputation|missionproviderreputation|\bstanding\b/.test(key))
    return "faction";
  if (/hauling/.test(key)) return "hauling";
  if (/wikelo|barter|trade/.test(key)) return "trade";
  return "guild";
}

export function factionFamily(faction: Faction): CareerFamily {
  return faction.careers[0] ? careerFamily(faction.careers[0]) : "faction";
}

/**
 * Le standing Hostile / Neutral / Ally fait doublon avec un barème
 * « Standing », qui va déjà de Hostile à Elite Contractor : on le masque.
 */
export function showsStanding(faction: Faction): boolean {
  return (
    faction.standings.length > 0 &&
    !faction.careers.some((career) => careerFamily(career) === "faction")
  );
}

export function defaultLevel(career: FactionCareer): FactionLevel | undefined {
  return career.levels.find((level) => level.isDefault) ?? career.levels[0];
}

/**
 * Le rang du barème que le joueur a choisi : la copie gardée chez le joueur
 * est retrouvée par son nom technique, sinon par son nom ; sans choix, le
 * rang par défaut.
 */
export function currentLevel(
  faction: Faction,
  career: FactionCareer,
  reputations: PlayerReputations,
): FactionLevel | undefined {
  const saved = reputations[faction.name]?.careers?.[career.name]?.level;
  if (saved) {
    const found =
      (saved.gameName
        ? career.levels.find((level) => level.gameName === saved.gameName)
        : undefined) ??
      career.levels.find((level) => level.name === saved.name);
    if (found) return found;
  }
  return defaultLevel(career);
}

/** Une faction commencée : un rang au-dessus (ou en dessous) du défaut, ou un standing changé. */
export function isStarted(
  faction: Faction,
  reputations: PlayerReputations,
): boolean {
  const standing = reputations[faction.name]?.standing;
  if (
    showsStanding(faction) &&
    standing &&
    standing !== faction.defaultStanding
  )
    return true;
  return faction.careers.some((career) => {
    const level = currentLevel(faction, career, reputations);
    return level ? !level.isDefault : false;
  });
}

export function isMaxed(
  faction: Faction,
  reputations: PlayerReputations,
): boolean {
  return faction.careers.some((career) => {
    const level = currentLevel(faction, career, reputations);
    return (
      !!level &&
      career.levels.length > 1 &&
      career.levels[career.levels.length - 1].name === level.name
    );
  });
}

/** Minuscules sans accents : « securite » trouve « Sécurité ». */
export function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function matchesSearch(faction: Faction, needle: string): boolean {
  if (!needle) return true;
  return [
    faction.name,
    ...faction.careers.flatMap((career) => [
      career.name,
      ...career.levels.map((level) => level.name),
    ]),
  ].some((text) => fold(text).includes(needle));
}

/**
 * Le ton d'un rang dans sa barre : en dessous du défaut (Hostile, Not
 * Eligible), au défaut, en progression, ou parmi les deux derniers rangs
 * d'un long barème (le dernier d'un court).
 */
export function levelTone(
  career: FactionCareer,
  level: FactionLevel | undefined,
): "below" | "default" | "progress" | "top" {
  if (!level || level.isDefault) return "default";
  if (level.level < 0) return "below";
  const index = career.levels.findIndex((option) => option.name === level.name);
  const count = career.levels.length;
  const threshold = count >= 4 ? count - 2 : count - 1;
  return index >= threshold ? "top" : "progress";
}
