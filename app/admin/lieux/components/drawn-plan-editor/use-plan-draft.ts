"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { nanoid } from "nanoid";
import {
  MAX_LEVEL_DOORS,
  MAX_LEVEL_LABELS,
  MAX_LEVEL_ROOMS,
  MAX_PLAN_LEVELS,
  type DrawnPlacePlan,
  type PlanDoor,
  type PlanLabel,
  type PlanLevel,
  type PlanRoom,
} from "@/types/places";

/**
 * L'état d'un relevé en cours de dessin.
 *
 * Tout passe par `apply` : une seule porte d'entrée pour modifier le plan, et
 * c'est elle qui empile l'annulation. Une mutation qui passerait à côté serait
 * invisible à Ctrl+Z, ce qui se remarque exactement une fois — au moment où on
 * en a besoin.
 *
 * L'historique garde des copies entières du plan plutôt que des diffs. Un
 * relevé pèse quelques dizaines de kilo-octets : à quarante pas en arrière, on
 * tient dans ce qu'une seule image de plan coûtait.
 */

/** Ce que le rail propose. `pan` n'en est pas un : c'est le comportement par défaut. */
export const PLAN_TOOLS = [
  "select",
  "room",
  "wall",
  "door",
  "stair",
  "marker",
  "label",
] as const;

export type PlanTool = (typeof PLAN_TOOLS)[number];

export type Selection =
  | { kind: "room"; id: string }
  | { kind: "door"; id: string }
  | { kind: "wall"; id: string }
  | { kind: "label"; id: string }
  | { kind: "marker"; id: string }
  | null;

/** Le pas du magnétisme, en centimètres. Vingt-cinq : le quart de mètre. */
export const SNAP_CM = 25;

/** Le pas de la rotation, en degrés. */
export const SNAP_DEG = 15;

/** Au-delà, l'historique coûte plus qu'il ne sert. */
const MAX_HISTORY = 40;

export function snapTo(value: number, step: number, enabled: boolean): number {
  return enabled ? Math.round(value / step) * step : Math.round(value);
}

/** Replie un angle dans `[-180, 180[`, comme le fait la normalisation serveur. */
export function wrapDegrees(value: number): number {
  return ((((Math.round(value) + 180) % 360) + 360) % 360) - 180;
}

export function emptyLevel(name: string, order: number): PlanLevel {
  return {
    id: nanoid(),
    name,
    order,
    rooms: [],
    walls: [],
    doors: [],
    labels: [],
  };
}

/** Un relevé neuf : un seul niveau, une emprise d'un bâtiment ordinaire. */
export function emptyDrawnPlan(name: string): DrawnPlacePlan {
  return {
    id: nanoid(),
    kind: "drawn",
    name,
    markers: [],
    widthCm: 4000,
    heightCm: 3000,
    levels: [emptyLevel("Rez-de-chaussée", 0)],
  };
}

/**
 * Piloté, pas autonome : le plan vit chez l'appelant, qui tient déjà la liste
 * des plans du lieu et l'enregistrement. Deux sources de vérité auraient fini
 * par diverger le jour où le parent remplace la liste sous les pieds du
 * dessin — en détachant un emprunt, par exemple.
 */
export function usePlanDraft(
  plan: DrawnPlacePlan,
  onChange: (next: DrawnPlacePlan) => void,
) {
  const [levelId, setLevelId] = useState<string>(plan.levels[0]?.id ?? "");
  const [tool, setTool] = useState<PlanTool>("select");
  const [selection, setSelection] = useState<Selection>(null);
  const [snap, setSnap] = useState(true);
  const [angleSnap, setAngleSnap] = useState(true);

  const past = useRef<DrawnPlacePlan[]>([]);
  const future = useRef<DrawnPlacePlan[]>([]);
  const [depth, setDepth] = useState({ past: 0, future: 0 });

  const level = useMemo(
    () => plan.levels.find((entry) => entry.id === levelId) ?? plan.levels[0],
    [plan.levels, levelId],
  );

  /**
   * La seule façon d'écrire dans le plan.
   *
   * `quiet` sert au glisser : empiler un pas d'historique par déplacement de
   * pointeur remplirait la pile de quarante états à un centimètre d'écart, et
   * Ctrl+Z ne remonterait plus nulle part. Le geste empile une fois, au début.
   */
  const apply = useCallback(
    (change: (current: DrawnPlacePlan) => DrawnPlacePlan, quiet = false) => {
      if (!quiet) {
        past.current = [...past.current, plan].slice(-MAX_HISTORY);
        future.current = [];
        setDepth({ past: past.current.length, future: 0 });
      }
      onChange(change(plan));
    },
    [onChange, plan],
  );

  const undo = useCallback(() => {
    const previous = past.current.at(-1);
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, plan].slice(-MAX_HISTORY);
    setDepth({ past: past.current.length, future: future.current.length });
    setSelection(null);
    onChange(previous);
  }, [onChange, plan]);

  const redo = useCallback(() => {
    const next = future.current.at(-1);
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, plan].slice(-MAX_HISTORY);
    setDepth({ past: past.current.length, future: future.current.length });
    setSelection(null);
    onChange(next);
  }, [onChange, plan]);

  /** Réécrit le niveau ouvert, et lui seul. */
  const mutateLevel = useCallback(
    (change: (current: PlanLevel) => PlanLevel, quiet = false) => {
      if (!level) return;
      apply(
        (current) => ({
          ...current,
          levels: current.levels.map((entry) =>
            entry.id === level.id ? change(entry) : entry,
          ),
        }),
        quiet,
      );
    },
    [apply, level],
  );

  /**
   * Les trois ajouts refusent au-delà de la limite du niveau, et c'est la même
   * limite que la normalisation serveur.
   *
   * Sans ce garde, `normalizePlans` tronque à l'enregistrement : le travail
   * disparaît sans un mot, et la sélection désigne un identifiant que plus
   * rien ne porte. Refuser tout de suite, et le dire, vaut mieux que perdre en
   * silence — d'où le `null`, qui est aussi ce qui empêche de sélectionner ce
   * qu'on n'a pas ajouté.
   */
  const addRoom = useCallback(
    (room: Omit<PlanRoom, "id">) => {
      if (!level || level.rooms.length >= MAX_LEVEL_ROOMS) return null;
      const id = nanoid();
      mutateLevel((current) => ({
        ...current,
        rooms: [...current.rooms, { ...room, id }],
      }));
      setSelection({ kind: "room", id });
      return id;
    },
    [level, mutateLevel],
  );

  const updateRoom = useCallback(
    (id: string, patch: Partial<PlanRoom>, quiet = false) => {
      mutateLevel(
        (current) => ({
          ...current,
          rooms: current.rooms.map((room) =>
            room.id === id ? { ...room, ...patch } : room,
          ),
        }),
        quiet,
      );
    },
    [mutateLevel],
  );

  const addDoor = useCallback(
    (door: Omit<PlanDoor, "id">) => {
      if (!level || level.doors.length >= MAX_LEVEL_DOORS) return null;
      const id = nanoid();
      mutateLevel((current) => ({
        ...current,
        doors: [...current.doors, { ...door, id }],
      }));
      setSelection({ kind: "door", id });
      return id;
    },
    [level, mutateLevel],
  );

  const updateDoor = useCallback(
    (id: string, patch: Partial<PlanDoor>, quiet = false) => {
      mutateLevel(
        (current) => ({
          ...current,
          doors: current.doors.map((door) =>
            door.id === id ? { ...door, ...patch } : door,
          ),
        }),
        quiet,
      );
    },
    [mutateLevel],
  );

  const addLabel = useCallback(
    (label: Omit<PlanLabel, "id">) => {
      if (!level || level.labels.length >= MAX_LEVEL_LABELS) return null;
      const id = nanoid();
      mutateLevel((current) => ({
        ...current,
        labels: [...current.labels, { ...label, id }],
      }));
      setSelection({ kind: "label", id });
      return id;
    },
    [level, mutateLevel],
  );

  const updateLabel = useCallback(
    (id: string, patch: Partial<PlanLabel>, quiet = false) => {
      mutateLevel(
        (current) => ({
          ...current,
          labels: current.labels.map((label) =>
            label.id === id ? { ...label, ...patch } : label,
          ),
        }),
        quiet,
      );
    },
    [mutateLevel],
  );

  /** Efface ce qui est choisi, quelle que soit sa nature. */
  const removeSelected = useCallback(() => {
    if (!selection) return;
    if (selection.kind === "marker") {
      apply((current) => ({
        ...current,
        markers: current.markers.filter((marker) => marker.id !== selection.id),
      }));
    } else {
      mutateLevel((current) => ({
        ...current,
        rooms: current.rooms.filter((room) => room.id !== selection.id),
        doors: current.doors.filter((door) => door.id !== selection.id),
        walls: current.walls.filter((wall) => wall.id !== selection.id),
        labels: current.labels.filter((label) => label.id !== selection.id),
      }));
    }
    setSelection(null);
  }, [apply, mutateLevel, selection]);

  const addLevel = useCallback(() => {
    if (plan.levels.length >= MAX_PLAN_LEVELS) return;
    const created = emptyLevel(
      `Niveau ${plan.levels.length}`,
      plan.levels.length,
    );
    apply((current) => ({ ...current, levels: [...current.levels, created] }));
    setLevelId(created.id);
    setSelection(null);
  }, [apply, plan.levels.length]);

  const renameLevel = useCallback(
    (id: string, name: string) => {
      apply((current) => ({
        ...current,
        levels: current.levels.map((entry) =>
          entry.id === id ? { ...entry, name } : entry,
        ),
      }));
    },
    [apply],
  );

  /**
   * Supprimer un niveau emporte ses repères : ils désignent des pièces qui
   * n'existent plus, et les laisser produirait des pastilles flottant sur un
   * étage qu'elles ne décrivent pas.
   */
  const removeLevel = useCallback(
    (id: string) => {
      if (plan.levels.length <= 1) return;
      apply((current) => ({
        ...current,
        levels: current.levels
          .filter((entry) => entry.id !== id)
          .map((entry, order) => ({ ...entry, order })),
        markers: current.markers.filter((marker) => marker.levelId !== id),
      }));
      setLevelId(plan.levels.find((entry) => entry.id !== id)?.id ?? "");
      setSelection(null);
    },
    [apply, plan.levels],
  );

  const moveLevel = useCallback(
    (id: string, delta: number) => {
      apply((current) => {
        const at = current.levels.findIndex((entry) => entry.id === id);
        const next = at + delta;
        if (at < 0 || next < 0 || next >= current.levels.length) return current;
        const levels = [...current.levels];
        [levels[at], levels[next]] = [levels[next], levels[at]];
        return {
          ...current,
          levels: levels.map((entry, order) => ({ ...entry, order })),
        };
      });
    },
    [apply],
  );

  return {
    plan,
    level,
    levelId: level?.id ?? "",
    setLevelId,
    tool,
    setTool,
    selection,
    setSelection,
    snap,
    setSnap,
    angleSnap,
    setAngleSnap,
    apply,
    mutateLevel,
    addRoom,
    updateRoom,
    addDoor,
    updateDoor,
    addLabel,
    updateLabel,
    removeSelected,
    addLevel,
    renameLevel,
    removeLevel,
    moveLevel,
    undo,
    redo,
    canUndo: depth.past > 0,
    canRedo: depth.future > 0,
  };
}
