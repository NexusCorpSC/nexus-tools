/**
 * L'allure des planètes et des lunes de la Star Map, corps par corps, d'après
 * leurs vues en orbite dans le jeu (Star Citizen 4.x, captures du Star Citizen
 * Wiki). Pas d'images : le shader de `app/starmap/scene.ts` peint chaque corps
 * à partir de ces réglages, ce qui ne pèse rien et n'emprunte aucune texture
 * du jeu.
 *
 * Pur et sans Three.js : se relit et s'ajuste sans navigateur.
 */

/** Ce que le shader sait peindre d'un corps. */
export type BodyLook = {
  /**
   * `rock` : un sol, des taches d'une seconde matière (mers, laves, plaques),
   * des nuages. `gas` : des bandes étirées le long des parallèles.
   */
  kind: "rock" | "gas";
  /** La rampe du sol (ou des bandes), du plus sombre au plus clair. */
  ramp: [string, string, string];
  /** Une seconde matière en taches : mers, lacs, coulées, plaques de glace. */
  patches?: { color: string; cover: number };
  /** La taille des motifs : plus grand, plus fin. 2,5 par défaut. */
  scale?: number;
  /** Combien les motifs tourbillonnent, de 0 à 1. */
  swirl?: number;
  /** Un sol rayé en bandes, de 0 à 1 (toujours franc pour un gaz). */
  bands?: number;
  /** La part du globe sous les nuages, de 0 à 1, et leur teinte. */
  clouds?: { cover: number; color?: string };
  /** Les calottes polaires, de 0 à 1 (la latitude où elles commencent). */
  ice?: number;
  /** Les villes qui s'allument côté nuit, de 0 à 1. */
  lights?: number;
  /** Les taches luisent (lave), de 0 à 1. */
  glow?: number;
  /** Le liseré d'atmosphère ; absent : un corps sans air. */
  atmosphere?: { color: string; strength?: number };
  /** Un anneau, en rayons du corps. */
  ring?: { inner: number; outer: number; color: string; opacity?: number };
  /** L'inclinaison de l'axe, en degrés. */
  tilt?: number;
};

export const BODY_LOOKS: Record<string, BodyLook> = {
  // ── Stanton ──
  hurston: {
    kind: "rock",
    ramp: ["#857560", "#c4b8a2", "#e8e2d4"],
    patches: { color: "#9a6c4c", cover: 0.25 },
    swirl: 0.5,
    clouds: { cover: 0.12 },
    lights: 0.25,
    atmosphere: { color: "#e2d3b4", strength: 0.8 },
    tilt: 6,
  },
  arial: {
    kind: "rock",
    ramp: ["#a4521a", "#e29226", "#ffc94a"],
    patches: { color: "#ff7a18", cover: 0.15 },
    scale: 4.5,
    swirl: 0.6,
    glow: 0.5,
  },
  aberdeen: {
    kind: "rock",
    ramp: ["#8a7646", "#c7ad6c", "#e3d29a"],
    scale: 4.5,
    swirl: 0.2,
    atmosphere: { color: "#e0c86a", strength: 0.6 },
  },
  magda: {
    kind: "rock",
    ramp: ["#9a5a4c", "#cc8472", "#e8b39c"],
    patches: { color: "#5ea8d0", cover: 0.2 },
    swirl: 0.7,
    atmosphere: { color: "#f0b8a0", strength: 0.5 },
  },
  ita: {
    kind: "rock",
    ramp: ["#5e6c5c", "#8e9c88", "#c3cabb"],
    patches: { color: "#b4644e", cover: 0.1 },
    swirl: 0.5,
    bands: 0.3,
    atmosphere: { color: "#c8d8c0", strength: 0.5 },
  },
  crusader: {
    kind: "gas",
    ramp: ["#c27892", "#ecdde2", "#f7f8fa"],
    swirl: 0.8,
    atmosphere: { color: "#d8e8ff", strength: 1.1 },
    tilt: 3,
  },
  cellin: {
    kind: "rock",
    ramp: ["#8e9ea9", "#c8d3db", "#eef2f5"],
    patches: { color: "#6e7e8a", cover: 0.18 },
    swirl: 0.6,
    atmosphere: { color: "#d8e6f0", strength: 0.4 },
  },
  daymar: {
    kind: "rock",
    ramp: ["#9c6450", "#cd917a", "#e9c4ae"],
    swirl: 0.6,
    atmosphere: { color: "#f0c0a8", strength: 0.5 },
  },
  yela: {
    kind: "rock",
    ramp: ["#7e98b4", "#c0d0e0", "#f2f7fb"],
    swirl: 0.5,
    ice: 0.6,
    atmosphere: { color: "#cfe0f4", strength: 0.4 },
    ring: { inner: 1.45, outer: 2.6, color: "#b8cce4", opacity: 0.75 },
    tilt: 12,
  },
  arccorp: {
    kind: "rock",
    ramp: ["#4e605a", "#7f978d", "#c4d2ca"],
    patches: { color: "#a9b8ae", cover: 0.35 },
    scale: 3.2,
    lights: 1,
    atmosphere: { color: "#a6d6d2", strength: 0.9 },
  },
  lyria: {
    kind: "rock",
    ramp: ["#3e74b0", "#6aa0d4", "#b8d4ee"],
    patches: { color: "#eef4fb", cover: 0.4 },
    scale: 3.5,
    swirl: 0.7,
    atmosphere: { color: "#bcd8f6", strength: 0.5 },
  },
  wala: {
    kind: "rock",
    ramp: ["#323c48", "#69788a", "#a4b0bd"],
    patches: { color: "#e6ebf0", cover: 0.45 },
    scale: 3.5,
    swirl: 0.4,
    atmosphere: { color: "#c0ccd8", strength: 0.4 },
  },
  microtech: {
    kind: "rock",
    ramp: ["#c9d5df", "#e8eef3", "#fbfcfd"],
    patches: { color: "#7090aa", cover: 0.38 },
    swirl: 0.5,
    ice: 0.65,
    clouds: { cover: 0.15 },
    lights: 0.25,
    atmosphere: { color: "#b0d8ff", strength: 1 },
  },
  calliope: {
    kind: "rock",
    ramp: ["#a6c0d8", "#d4e3f0", "#f4f8fc"],
    swirl: 0.6,
    atmosphere: { color: "#d6e8f8", strength: 0.4 },
  },
  clio: {
    kind: "rock",
    ramp: ["#b6c0b4", "#dcdfd8", "#f4f3ef"],
    patches: { color: "#a8b8a8", cover: 0.2 },
    swirl: 0.3,
    atmosphere: { color: "#e8ece4", strength: 0.4 },
  },
  euterpe: {
    kind: "rock",
    ramp: ["#b4c6da", "#dce6f0", "#f6f9fc"],
    swirl: 0.4,
    atmosphere: { color: "#dce8f6", strength: 0.4 },
  },

  // ── Pyro ──
  "pyro-i": {
    kind: "rock",
    ramp: ["#1e6fd8", "#3a96f6", "#86c8ff"],
    patches: { color: "#d4ecff", cover: 0.12 },
    scale: 3.5,
    swirl: 0.4,
    atmosphere: { color: "#4aa8ff", strength: 1.4 },
  },
  monox: {
    kind: "rock",
    ramp: ["#3e2a28", "#6e4a42", "#9a6a5c"],
    patches: { color: "#c0806c", cover: 0.08 },
    scale: 4,
    atmosphere: { color: "#d8907a", strength: 1.2 },
  },
  bloom: {
    kind: "rock",
    ramp: ["#a8946e", "#d4c4a4", "#f0ece2"],
    patches: { color: "#1660c0", cover: 0.6 },
    swirl: 0.5,
    clouds: { cover: 0.3 },
    atmosphere: { color: "#5eaeff", strength: 1.1 },
  },
  "pyro-iv": {
    kind: "rock",
    ramp: ["#2a7c84", "#3fa2a6", "#86d0cc"],
    patches: { color: "#d48a68", cover: 0.36 },
    bands: 0.3,
    swirl: 0.7,
    atmosphere: { color: "#8ad6d4", strength: 0.6 },
    ring: { inner: 1.5, outer: 2.2, color: "#a09a94", opacity: 0.45 },
    tilt: 8,
  },
  "pyro-v": {
    kind: "rock",
    ramp: ["#a4bc5c", "#d6e07c", "#f2f0a8"],
    patches: { color: "#8cb46a", cover: 0.2 },
    bands: 0.4,
    swirl: 0.8,
    atmosphere: { color: "#eef0a0", strength: 1 },
  },
  ignis: {
    kind: "rock",
    ramp: ["#a8602e", "#d48a52", "#ebb684"],
    patches: { color: "#2e2a30", cover: 0.42 },
    swirl: 0.6,
    atmosphere: { color: "#f0a870", strength: 0.6 },
  },
  vatra: {
    kind: "rock",
    ramp: ["#748a72", "#aebea4", "#d6e0cc"],
    swirl: 0.5,
    atmosphere: { color: "#d8dcc4", strength: 0.4 },
  },
  adir: {
    kind: "rock",
    ramp: ["#b47c5c", "#dca888", "#f0cfb4"],
    patches: { color: "#2e3e52", cover: 0.45 },
    swirl: 0.6,
    clouds: { cover: 0.1 },
    atmosphere: { color: "#a8c8f0", strength: 0.9 },
  },
  fairo: {
    kind: "rock",
    ramp: ["#5e1e2a", "#a83a3c", "#e07a70"],
    patches: { color: "#ff5a3a", cover: 0.18 },
    bands: 0.7,
    swirl: 0.6,
    glow: 0.4,
    atmosphere: { color: "#ff9070", strength: 0.5 },
  },
  fuego: {
    kind: "rock",
    ramp: ["#5c5a58", "#8c8a86", "#b4b0aa"],
    patches: { color: "#e0a040", cover: 0.32 },
    scale: 5,
    swirl: 0.3,
  },
  vuur: {
    kind: "rock",
    ramp: ["#a8bcae", "#d0dece", "#eaf0e6"],
    swirl: 0.3,
    atmosphere: { color: "#e6ecdf", strength: 0.6 },
  },
  terminus: {
    kind: "rock",
    ramp: ["#6e5e4e", "#a8988a", "#d6ccbe"],
    patches: { color: "#4e4036", cover: 0.25 },
    bands: 0.3,
    swirl: 0.5,
    atmosphere: { color: "#d0c4b0", strength: 0.5 },
    ring: { inner: 1.4, outer: 2.4, color: "#b0a698", opacity: 0.55 },
    tilt: 14,
  },

  // ── Nyx ──
  "nyx-i": {
    kind: "rock",
    ramp: ["#7a4428", "#a8683e", "#d09a66"],
    swirl: 0.6,
    clouds: { cover: 0.45, color: "#f2e4cc" },
    atmosphere: { color: "#a8c8f0", strength: 1 },
  },
  "nyx-ii": {
    kind: "rock",
    ramp: ["#9c7c2c", "#c8a848", "#e6d07a"],
    patches: { color: "#f4f0e0", cover: 0.08 },
    swirl: 0.3,
    atmosphere: { color: "#f0dc90", strength: 1.2 },
  },
  "nyx-iii": {
    kind: "rock",
    ramp: ["#3e6a92", "#6a9ac2", "#a8cae4"],
    patches: { color: "#e8f0f6", cover: 0.2 },
    swirl: 0.6,
    atmosphere: { color: "#8ec4ff", strength: 1.1 },
  },
  delamar: {
    kind: "rock",
    ramp: ["#1e252e", "#3a4656", "#5e6e80"],
    scale: 5,
    swirl: 0.2,
  },
};

/** Pour un corps qu'on ne connaît pas encore : une allure tirée de son slug. */
const MOON_FALLBACKS: BodyLook[] = [
  { kind: "rock", ramp: ["#7a6e62", "#a89a8a", "#cfc4b6"], swirl: 0.4 },
  { kind: "rock", ramp: ["#8a7a5a", "#c9b48a", "#e6d6b0"], swirl: 0.4 },
  { kind: "rock", ramp: ["#8aa0b0", "#c4d4e0", "#eef4f8"], swirl: 0.5 },
];
const PLANET_FALLBACKS: BodyLook[] = [
  {
    kind: "rock",
    ramp: ["#5a4c40", "#8b7a6a", "#b39b80"],
    swirl: 0.5,
    atmosphere: { color: "#c8b8a0" },
  },
  {
    kind: "rock",
    ramp: ["#8aa0c8", "#c8d8f0", "#eef4ff"],
    ice: 0.6,
    atmosphere: { color: "#b8d4ff" },
  },
  {
    kind: "gas",
    ramp: ["#8a6a4a", "#c8a882", "#ecdcc4"],
    swirl: 0.6,
    atmosphere: { color: "#f0dcc0" },
  },
];

export function hashOf(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return hash >>> 0;
}

/** L'allure d'un corps : la sienne, ou une tirée de son slug, stable d'une visite à l'autre. */
export function bodyLook(slug: string, type: string): BodyLook {
  const known = BODY_LOOKS[slug];
  if (known) return known;
  const pool = type === "moon" ? MOON_FALLBACKS : PLANET_FALLBACKS;
  return pool[hashOf(slug) % pool.length];
}
