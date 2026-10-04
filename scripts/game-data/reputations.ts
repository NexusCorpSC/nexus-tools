/**
 * La liste des factions de /reps (le document `configuration` de clé
 * `reputations`) tenue à jour depuis les barèmes de réputation du wiki.
 *
 * Les réputations des joueurs sont rangées sous le nom de la faction, puis
 * de la carrière, et gardent une copie du rang choisi : quand le jeu renomme
 * l'un d'eux, l'import déplace aussi ce que les joueurs ont saisi, pour
 * qu'aucune progression ne se perde.
 *
 * Les règles de l'import des données du jeu tiennent ici aussi :
 *   - une faction est retrouvée par son GUID, sinon par son nom (casse et
 *     espaces ignorés) ; une carrière par le nom technique de son barème,
 *     sinon par son nom, sinon parce qu'elle est la seule de la faction ;
 *   - rien n'est supprimé : une faction qui disparaît du wiki est marquée
 *     `removedInVersion`, une faction saisie à la main que le wiki ne connaît
 *     pas reste telle quelle, comme les carrières qu'il ne donne pas (il n'en
 *     donne qu'une par faction) ;
 *   - le standing (Hostile, Neutral, Ally) n'est pas au wiki : celui d'une
 *     faction existante est gardé.
 */

import type {
  Faction,
  FactionCareer,
  FactionLevel,
  PlayerReputations,
} from "@/types/reputations";
import { factionKey, newReport, note, sameValue, type Report } from "./plan";
import type { GameReputationFaction } from "./source";

/** Le standing des factions créées, celui que toutes les factions saisies à la main avaient. */
export const DEFAULT_STANDINGS = ["Hostile", "Neutral", "Ally"];

/**
 * Les noms courts saisis à la main avant l'import, que la comparaison par
 * nom ne peut pas deviner.
 */
const ALIASES: Record<string, string> = {
  udm: "unified distribution management",
};

const nameKey = (name: string) => {
  const key = factionKey(name);
  return ALIASES[key] ?? key;
};

/** `<= PLACEHOLDER =>`, `[PH] Hostile` : des factions que le jeu n'a pas encore nommées. */
const isPlaceholder = (name: string) => /<=.*=>|^\[PH\]/i.test(name);

/**
 * Les noms servent de clés dans les réputations des joueurs (`reputations.<faction>.careers.<carrière>`) :
 * un point ou un `$` en tête casserait le chemin Mongo.
 */
const isSafeKey = (name: string) =>
  !name.includes(".") && !name.startsWith("$");

type Ladder = NonNullable<GameReputationFaction["ladder"]>;

/**
 * Pourquoi un barème n'est pas utilisable, ou `null`. Le wiki en a dont les
 * rangs n'ont pas de nom affichable (Wildstar Racing).
 */
function ladderProblem(ladder: Ladder): string | null {
  if (ladder.levels.length === 0) return "aucun rang";
  const names = ladder.levels.map((level) => level.name);
  if (names.some((name) => !name)) return "rangs sans nom";
  if (new Set(names.map(factionKey)).size !== names.length)
    return "rangs homonymes";
  if (!isSafeKey(ladder.name)) return "nom de carrière inutilisable";
  return null;
}

/**
 * Les rangs du plus bas au plus haut. Le rang par défaut est le plus haut que
 * la réputation de départ atteint ; les autres sont numérotés par rapport à
 * lui, comme les barèmes saisis à la main (Not Eligible à -1, Applicant à 0).
 */
export function toLevels(ladder: Ladder): FactionLevel[] {
  const sorted = [...ladder.levels].sort(
    (a, b) => a.minReputation - b.minReputation,
  );
  let defaultIndex = 0;
  sorted.forEach((level, index) => {
    if (level.minReputation <= ladder.initialReputation) defaultIndex = index;
  });
  return sorted.map((level, index) => ({
    level: index - defaultIndex,
    name: level.name,
    isDefault: index === defaultIndex,
    gameName: level.gameName,
    minReputation: level.minReputation,
  }));
}

/** Le rang du nouveau barème qui porte le même nom technique, sinon le même nom. */
function sameLevel(
  old: FactionLevel,
  levels: FactionLevel[],
): FactionLevel | undefined {
  return (
    (old.gameName
      ? levels.find((level) => level.gameName === old.gameName)
      : undefined) ??
    levels.find((level) => factionKey(level.name) === factionKey(old.name))
  );
}

/**
 * Le rang du nouveau barème qui remplace chaque ancien rang. Un rang que le
 * jeu n'a plus prend la place du rang retrouvé juste en dessous de lui (un
 * joueur ne monte pas d'un rang par un renommage) ; sans rang retrouvé en
 * dessous (une coquille corrigée tout en bas), la même position par rapport
 * au défaut, bornée aux extrémités du nouveau barème.
 */
function successors(
  previous: FactionLevel[],
  levels: FactionLevel[],
): Map<FactionLevel, FactionLevel> {
  const result = new Map<FactionLevel, FactionLevel>();
  let below: FactionLevel | undefined;
  for (const old of previous) {
    const same = sameLevel(old, levels);
    if (same) below = same;
    result.set(
      old,
      same ??
        below ??
        levels.find((level) => level.level === old.level) ??
        (old.level < 0 ? levels[0] : levels[levels.length - 1]),
    );
  }
  return result;
}

/**
 * Une carrière saisie à la main sous un autre nom est celle du wiki si au
 * moins la moitié de ses rangs s'y retrouvent par leur nom (CFP : Security
 * pour le barème `Standing`) ; sinon c'est une autre carrière, qui reste.
 */
function sameLadder(career: FactionCareer, levels: FactionLevel[]): boolean {
  const found = career.levels.filter((old) => sameLevel(old, levels)).length;
  return found >= 2 && found * 2 >= career.levels.length;
}

/** Ce que les réputations des joueurs doivent suivre. */
export type ReputationMoves = {
  /** Ancien nom → nouveau nom de faction. */
  factions: Map<string, string>;
  /** Par faction (nom final) : ancien nom → nouveau nom de carrière. */
  careers: Map<string, Map<string, string>>;
  /** Par faction puis carrière (noms finaux) : ancien nom de rang → rang. */
  levels: Map<string, Map<string, Map<string, FactionLevel>>>;
};

export type ReputationChanges = {
  factions: Faction[];
  changed: boolean;
  moves: ReputationMoves;
  report: Report;
};

function mergeCareer(
  faction: Faction,
  ladder: Ladder,
  moves: ReputationMoves,
  report: Report,
) {
  const levels = toLevels(ladder);
  const careers = faction.careers;
  const career =
    careers.find((c) => c.gameScope === ladder.scope) ??
    careers.find(
      (c) => !c.gameScope && factionKey(c.name) === factionKey(ladder.name),
    ) ??
    careers.find((c) => !c.gameScope && sameLadder(c, levels));

  if (!career) {
    if (careers.some((c) => factionKey(c.name) === factionKey(ladder.name))) {
      note(
        report,
        "carrières en conflit de nom, laissées telles quelles",
        `${faction.name} / ${ladder.name}`,
      );
      return;
    }
    careers.push({ name: ladder.name, gameScope: ladder.scope, levels });
    note(report, "carrières ajoutées", `${faction.name} / ${ladder.name}`);
    return;
  }

  const previous: FactionCareer = structuredClone(career);
  if (factionKey(career.name) !== factionKey(ladder.name)) {
    if (
      careers.some(
        (c) => c !== career && factionKey(c.name) === factionKey(ladder.name),
      )
    ) {
      note(
        report,
        "carrières en conflit de nom, laissées telles quelles",
        `${faction.name} / ${ladder.name}`,
      );
      return;
    }
    note(
      report,
      "carrières renommées",
      `${faction.name} : ${career.name} → ${ladder.name}`,
    );
    let renames = moves.careers.get(faction.name);
    if (!renames) moves.careers.set(faction.name, (renames = new Map()));
    renames.set(career.name, ladder.name);
    career.name = ladder.name;
  }
  career.gameScope = ladder.scope;
  career.levels = levels;

  const remap = new Map<string, FactionLevel>();
  for (const [old, next] of successors(previous.levels, levels)) {
    if (!sameValue(old, next)) remap.set(old.name, next);
    if (factionKey(next.name) !== factionKey(old.name))
      note(
        report,
        "rangs remplacés",
        `${faction.name} / ${career.name} : ${old.name} → ${next.name}`,
      );
  }
  if (remap.size > 0) {
    let byCareer = moves.levels.get(faction.name);
    if (!byCareer) moves.levels.set(faction.name, (byCareer = new Map()));
    byCareer.set(career.name, remap);
  }
  if (!sameValue(previous, career))
    note(report, "barèmes mis à jour", `${faction.name} / ${career.name}`);
}

/**
 * La nouvelle liste des factions, et ce que les réputations des joueurs
 * doivent suivre.
 */
export function planReputations(
  existing: Faction[],
  source: GameReputationFaction[],
  version: string,
): ReputationChanges {
  const report = newReport();
  const factions = structuredClone(existing);
  const moves: ReputationMoves = {
    factions: new Map(),
    careers: new Map(),
    levels: new Map(),
  };

  const byGameId = new Map<string, Faction>();
  for (const faction of factions)
    if (faction.gameId) byGameId.set(faction.gameId, faction);
  const claimed = new Set<Faction>();
  // Les GUID d'abord : un nom ne prend pas la faction qu'un GUID désigne.
  for (const record of source) {
    const faction = byGameId.get(record.gameId);
    if (faction) claimed.add(faction);
  }

  const sorted = [...source].sort((a, b) => a.name.localeCompare(b.name));
  for (const record of sorted) {
    if (isPlaceholder(record.name)) {
      note(report, "ignorées (nom provisoire du jeu)", record.name);
      continue;
    }
    if (!isSafeKey(record.name)) {
      note(report, "ignorées (nom inutilisable comme clé)", record.name);
      continue;
    }
    const problem = record.ladder
      ? ladderProblem(record.ladder)
      : "aucun barème";
    const ladder = problem ? null : record.ladder;

    let created = false;
    let faction = byGameId.get(record.gameId);
    if (!faction) {
      faction = factions.find(
        (candidate) =>
          !claimed.has(candidate) &&
          !candidate.gameId &&
          nameKey(candidate.name) === nameKey(record.name),
      );
      if (faction) {
        claimed.add(faction);
        note(report, "rattachées à leur GUID par leur nom", faction.name);
      }
    }

    if (!faction) {
      if (!ladder) {
        note(report, `ignorées (${problem})`, record.name);
        continue;
      }
      const fresh: Faction = {
        name: record.name,
        standings: [...DEFAULT_STANDINGS],
        defaultStanding:
          record.defaultReaction &&
          DEFAULT_STANDINGS.includes(record.defaultReaction)
            ? record.defaultReaction
            : "Neutral",
        careers: [],
      };
      factions.push(fresh);
      claimed.add(fresh);
      faction = fresh;
      created = true;
      note(report, "créées", record.name);
    } else if (problem) {
      note(
        report,
        `barème inutilisable, carrières gardées (${problem})`,
        record.name,
      );
    }

    const before = structuredClone(faction);
    // Une différence de casse ou d'espaces garde l'orthographe en place :
    // seul un vrai renommage déplace les réputations des joueurs.
    if (factionKey(faction.name) !== factionKey(record.name)) {
      if (
        factions.some(
          (other) =>
            other !== faction &&
            factionKey(other.name) === factionKey(record.name),
        )
      ) {
        note(
          report,
          "renommages impossibles (nom déjà pris)",
          `${faction.name} → ${record.name}`,
        );
      } else {
        note(report, "renommées", `${faction.name} → ${record.name}`);
        moves.factions.set(faction.name, record.name);
        faction.name = record.name;
      }
    }
    faction.gameId = record.gameId;
    for (const key of [
      "description",
      "lawful",
      "focus",
      "headquarters",
    ] as const) {
      if (record[key] === undefined) delete faction[key];
      else (faction as Record<string, unknown>)[key] = record[key];
    }
    delete faction.removedInVersion;
    if (ladder) mergeCareer(faction, ladder, moves, report);
    if (!created && !sameValue(before, faction)) note(report, "mises à jour");
  }

  for (const faction of factions) {
    if (claimed.has(faction)) continue;
    if (faction.gameId) {
      if (!faction.removedInVersion) {
        faction.removedInVersion = version;
        note(report, "disparues du wiki (marquées, gardées)", faction.name);
      }
    } else {
      note(
        report,
        "saisies à la main, inconnues du wiki (gardées)",
        faction.name,
      );
    }
  }

  factions.sort((a, b) => a.name.localeCompare(b.name));
  return {
    factions,
    changed: !sameValue(existing, factions),
    moves,
    report,
  };
}

/**
 * Les réputations d'un joueur une fois les renommages suivis, ou `null` si
 * rien ne change. Une faction ou une carrière renommée vers un nom que le
 * joueur a déjà rempli garde ce qu'il y a saisi depuis.
 */
export function movePlayerReputations(
  reputations: PlayerReputations,
  moves: ReputationMoves,
): PlayerReputations | null {
  const next: PlayerReputations = structuredClone(reputations);

  for (const [from, to] of moves.factions) {
    if (!(from in next)) continue;
    if (!(to in next)) next[to] = next[from];
    delete next[from];
  }

  for (const [factionName, renames] of moves.careers) {
    const careers = next[factionName]?.careers;
    if (!careers) continue;
    for (const [from, to] of renames) {
      if (!(from in careers)) continue;
      if (!(to in careers)) careers[to] = careers[from];
      delete careers[from];
    }
  }

  // D'après l'ancien nom de chaque rang, en un seul passage : un rang
  // renommé vers le nom d'un autre ne se décale pas deux fois.
  for (const [factionName, byCareer] of moves.levels) {
    const careers = next[factionName]?.careers;
    if (!careers) continue;
    for (const [careerName, remap] of byCareer) {
      const entry = careers[careerName];
      const level = entry?.level && remap.get(entry.level.name);
      if (level) entry.level = level;
    }
  }

  return sameValue(reputations, next) ? null : next;
}
