import type { PlacePosition } from "@/types/places";

/**
 * Les marqueurs : un point relevé en jeu et gardé pour y revenir (des rochers
 * à miner, une épave, une grotte). Ce n'est pas un lieu : ni parent, ni type,
 * ni image, ni inventaire, ni relecture. Un marqueur est à son créateur ; il
 * se range dans une collection, que son créateur peut partager avec une de
 * ses organisations, avec la même règle que les lieux privés (voir
 * `lib/markers.ts`).
 */

/** Ce qu'un joueur peut avoir de marqueurs et de collections. */
export const MAX_MARKERS = 1000;
export const MAX_MARKER_COLLECTIONS = 50;

export const MAX_MARKER_NAME_LENGTH = 80;
export const MAX_MARKER_NOTE_LENGTH = 1000;
export const MAX_MARKER_COLLECTION_NAME_LENGTH = 60;

export const MARKER_KINDS = [
  "ore",
  "wreck",
  "cave",
  "poi",
  "danger",
  "other",
] as const;

export type MarkerKind = (typeof MARKER_KINDS)[number];

export function isMarkerKind(value: unknown): value is MarkerKind {
  return (MARKER_KINDS as readonly unknown[]).includes(value);
}

/**
 * Les couleurs qu'une collection peut prendre ; la première est celle des
 * marqueurs sans collection.
 */
export const MARKER_COLORS = [
  "#7ff0d0",
  "#ffb86b",
  "#ff9ec7",
  "#8fd3ff",
  "#c6f27a",
  "#f7d68f",
  "#ff8f7a",
  "#b9a3ff",
] as const;

export type MarkerColor = (typeof MARKER_COLORS)[number];

export const DEFAULT_MARKER_COLOR: MarkerColor = MARKER_COLORS[0];

export function isMarkerColor(value: unknown): value is MarkerColor {
  return (MARKER_COLORS as readonly unknown[]).includes(value);
}

/** D'où vient la position : le NPS de l'app, ou une ligne collée. */
export const MARKER_SOURCES = ["showlocation", "screen", "paste"] as const;

export type MarkerSource = (typeof MARKER_SOURCES)[number];

/** L'organisation qui voit une collection. */
export type MarkerOrg = {
  id: string;
  name: string;
  tag?: string;
};

/** Une collection telle que la liste la montre. */
export type MarkerCollection = {
  id: string;
  name: string;
  color: MarkerColor;
  /** Partagée avec cette organisation ; absente, seul son créateur la voit. */
  org?: MarkerOrg;
  isOwner: boolean;
  ownerName?: string;
  /** Son créateur l'a invité dessus (hors organisation). */
  sharedWithMe?: true;
  /** Pour son créateur : les joueurs invités dessus. */
  guestCount?: number;
  /** Les marqueurs qu'elle contient et que celui qui lit voit. */
  count: number;
  createdAt: string;
  updatedAt: string;
};

export type Marker = {
  id: string;
  name: string;
  note?: string;
  kind: MarkerKind;
  /** Absent : « Sans collection ». */
  collectionId?: string;
  collectionName?: string;
  /** Celle de sa collection, sinon `DEFAULT_MARKER_COLOR`. */
  color: MarkerColor;
  systemSlug: string;
  systemName?: string;
  /** Sur une planète ou une lune : `position` est dans son repère. */
  bodySlug?: string;
  bodyName?: string;
  /** En mètres ; `position.body` vaut `bodySlug` quand il y en a un. */
  position: PlacePosition;
  source: MarkerSource;
  /** Partagé par sa collection avec cette organisation. */
  org?: MarkerOrg;
  isOwner: boolean;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * `POST /api/marqueurs` et `PATCH /api/marqueurs/{id}`. À la création,
 * `position` est obligatoire, et `systemSlug` aussi quand elle n'est pas sur
 * un corps (`position.body`). Un champ absent du PATCH ne change pas ;
 * `collectionId: null` ou `note: ""` le retire.
 */
export type MarkerInput = {
  name?: string;
  note?: string | null;
  kind?: MarkerKind;
  collectionId?: string | null;
  position?: { body?: string; x: number; y: number; z: number };
  systemSlug?: string;
  source?: MarkerSource;
};

/** `POST /api/marqueurs/collections` et son PATCH. */
export type MarkerCollectionInput = {
  name?: string;
  color?: MarkerColor;
  /** `null` : « moi seul ». */
  orgId?: string | null;
};

/** `GET /api/marqueurs`. */
export type MarkerListResponse = {
  markers: Marker[];
  collections: MarkerCollection[];
  /** Ses organisations, pour partager une collection. */
  orgs: MarkerOrg[];
  /** Ceux qu'il a créés, au regard de `MAX_MARKERS`. */
  owned: number;
};
