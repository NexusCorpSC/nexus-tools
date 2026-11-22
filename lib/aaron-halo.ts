/**
 * Naviguer vers une bande de l'Aaron Halo, la ceinture d'astéroïdes de
 * Stanton, entre Crusader et ArcCorp.
 *
 * Le halo n'a pas de balise : on y entre en coupant un saut quantique entre
 * deux points qui le traversent. Pendant le saut, le HUD affiche la distance
 * qui reste jusqu'à l'arrivée ; il suffit de couper quand elle vaut la
 * distance entre l'arrivée et la bande visée. Les orbites sont figées en jeu,
 * les stations des points de Lagrange et les planètes ne bougent pas : cette
 * distance se calcule une fois pour toutes, en ligne droite.
 *
 * Le halo est un anneau centré sur l'origine du repère du système, dans le
 * plan des orbites : on mesure la distance au centre dans ce plan (x, y).
 * Une bande est une couronne entre deux rayons ; la portion du trajet qui la
 * traverse est la fenêtre où couper. On vise son milieu, pour garder autant
 * de marge avant qu'après.
 *
 * Ce fichier est partagé avec l'app de bureau (`src/lib/aaron-halo.ts` de
 * nexus-app), qui en garde une copie : le même trajet doit donner la même
 * distance des deux côtés.
 */

export type HaloVector = { x: number; y: number; z: number };

export interface HaloBand {
  /** Son numéro, de 1 (le bord intérieur) à 10 (le bord extérieur). */
  id: number;
  /** Ses bords, en mètres depuis le centre du système. */
  inner: number;
  outer: number;
  /** La densité de rochers relevée, de 0 à 1 (1 : la plus dense). */
  density: number;
}

export type HaloPointKind = "lagrange" | "planet";

/** Une cible de saut quantique dans Stanton. */
export interface HaloPoint extends HaloVector {
  /** `arc-l1`, `hurston`… : ce que l'adresse de la page retient. */
  id: string;
  /** Ce que le HUD et la carte du jeu affichent : `ARC-L1`, `Hurston`. */
  label: string;
  /** La station qui s'y trouve, pour un point de Lagrange. */
  station?: string;
  kind: HaloPointKind;
  /** La planète à laquelle il se rattache. */
  body: string;
}

/**
 * Les bandes relevées par la communauté (relevés de densité repris par les
 * planificateurs de trajets, patch 4.x), en mètres. Les bandes 5 à 10 se
 * touchent ; entre 1 et 2 et entre 3 et 4, il n'y a presque rien.
 */
export const DEFAULT_HALO_BANDS: HaloBand[] = [
  { id: 1, inner: 19_673e6, outer: 19_715e6, density: 0.01 },
  { id: 2, inner: 19_815e6, outer: 19_914e6, density: 0.24 },
  { id: 3, inner: 19_914e6, outer: 19_995e6, density: 0.35 },
  { id: 4, inner: 20_071e6, outer: 20_179e6, density: 0.23 },
  { id: 5, inner: 20_230e6, outer: 20_407e6, density: 1 },
  { id: 6, inner: 20_407e6, outer: 20_540e6, density: 0.33 },
  { id: 7, inner: 20_540e6, outer: 20_881e6, density: 0.36 },
  { id: 8, inner: 20_881e6, outer: 21_046e6, density: 0.26 },
  { id: 9, inner: 21_046e6, outer: 21_132e6, density: 0.25 },
  { id: 10, inner: 21_132e6, outer: 21_298e6, density: 0.33 },
];

/**
 * Les cibles de saut de Stanton, en mètres dans le repère du système : les
 * points de Lagrange qui ont une station et les quatre planètes (leur
 * centre : à l'échelle des bandes, leur rayon ne compte pas). Positions de
 * starmap.space (`api/v3/oc`), comme l'import des corps célestes.
 */
export const HALO_POINTS: HaloPoint[] = [
  {
    id: "hurston",
    label: "Hurston",
    kind: "planet",
    body: "Hurston",
    x: 12_850_457_093,
    y: 0,
    z: 0,
  },
  {
    id: "hur-l1",
    label: "HUR-L1",
    station: "Green Glade Station",
    kind: "lagrange",
    body: "Hurston",
    x: 11_565_411_328,
    y: 0,
    z: 0,
  },
  {
    id: "hur-l2",
    label: "HUR-L2",
    station: "Faithful Dream Station",
    kind: "lagrange",
    body: "Hurston",
    x: 14_135_502_848,
    y: 0,
    z: 0,
  },
  {
    id: "hur-l3",
    label: "HUR-L3",
    station: "Thundering Express Station",
    kind: "lagrange",
    body: "Hurston",
    x: -12_850_457_600,
    y: -1_123,
    z: 0,
  },
  {
    id: "hur-l4",
    label: "HUR-L4",
    station: "Melodic Fields Station",
    kind: "lagrange",
    body: "Hurston",
    x: 6_425_228_288,
    y: 11_128_823_808,
    z: 0,
  },
  {
    id: "hur-l5",
    label: "HUR-L5",
    station: "High Course Station",
    kind: "lagrange",
    body: "Hurston",
    x: 6_425_227_776,
    y: -11_128_823_808,
    z: 0,
  },
  {
    id: "crusader",
    label: "Crusader",
    kind: "planet",
    body: "Crusader",
    x: -18_962_176_000,
    y: -2_664_960_000,
    z: 0,
  },
  {
    id: "cru-l1",
    label: "CRU-L1",
    station: "Ambitious Dream Station",
    kind: "lagrange",
    body: "Crusader",
    x: -17_065_957_376,
    y: -2_398_464_000,
    z: 0,
  },
  {
    id: "cru-l4",
    label: "CRU-L4",
    station: "Shallow Fields Station",
    kind: "lagrange",
    body: "Crusader",
    x: -7_173_168_640,
    y: -17_754_204_160,
    z: 0,
  },
  {
    id: "cru-l5",
    label: "CRU-L5",
    station: "Beautiful Glen Station",
    kind: "lagrange",
    body: "Crusader",
    x: -11_789_008_988,
    y: 15_089_246_107,
    z: 0,
  },
  {
    id: "arccorp",
    label: "ArcCorp",
    kind: "planet",
    body: "ArcCorp",
    x: 18_587_664_740,
    y: -22_151_916_920,
    z: 0,
  },
  {
    id: "arc-l1",
    label: "ARC-L1",
    station: "Wide Forest Station",
    kind: "lagrange",
    body: "ArcCorp",
    x: 16_729_134_637,
    y: -19_937_006_925,
    z: 8_077,
  },
  {
    id: "arc-l2",
    label: "ARC-L2",
    station: "Lively Pathway Station",
    kind: "lagrange",
    body: "ArcCorp",
    x: 20_446_718_503,
    y: -24_367_450_991,
    z: 8_077,
  },
  {
    id: "arc-l3",
    label: "ARC-L3",
    station: "Modern Express Station",
    kind: "lagrange",
    body: "ArcCorp",
    x: -25_043_446_884,
    y: 14_458_841_788,
    z: 8_077,
  },
  {
    id: "arc-l4",
    label: "ARC-L4",
    station: "Faint Glen Station",
    kind: "lagrange",
    body: "ArcCorp",
    x: 28_478_354_916,
    y: 5_021_502_483,
    z: 8_077,
  },
  {
    id: "arc-l5",
    label: "ARC-L5",
    station: "Yellow Core Station",
    kind: "lagrange",
    body: "ArcCorp",
    x: -9_890_422_516,
    y: -27_173_732_225,
    z: 8_077,
  },
  {
    id: "microtech",
    label: "microTech",
    kind: "planet",
    body: "microTech",
    x: 22_462_085_252,
    y: 37_185_744_964,
    z: 0,
  },
  {
    id: "mic-l1",
    label: "MIC-L1",
    station: "Shallow Frontier Station",
    kind: "lagrange",
    body: "microTech",
    x: 20_215_824_238,
    y: 33_467_065_007,
    z: 0,
  },
  {
    id: "mic-l2",
    label: "MIC-L2",
    station: "Long Forest Station",
    kind: "lagrange",
    body: "microTech",
    x: 24_708_827_153,
    y: 40_905_202_459,
    z: 0,
  },
  {
    id: "mic-l3",
    label: "MIC-L3",
    station: "Endless Odyssey Station",
    kind: "lagrange",
    body: "microTech",
    x: -22_457_170_265,
    y: -37_187_612_395,
    z: 0,
  },
  {
    id: "mic-l4",
    label: "MIC-L4",
    station: "Red Crossroads Station",
    kind: "lagrange",
    body: "microTech",
    x: -20_971_933_230,
    y: 38_045_504_032,
    z: 0,
  },
  {
    id: "mic-l5",
    label: "MIC-L5",
    station: "Modern Icarus Station",
    kind: "lagrange",
    body: "microTech",
    x: 43_435_204_288,
    y: -851_406_956,
    z: 0,
  },
];

/** La bande la plus dense : celle qu'on propose d'abord. */
export const DEFAULT_HALO_BAND = 5;

/**
 * Sous cette fenêtre, couper à temps devient affaire de réflexes : à
 * 0,1 Gm/s, 100 Mm laissent une seconde.
 */
export const NARROW_HALO_WINDOW = 150e6;

/** Au-delà, la fenêtre laisse plusieurs secondes de marge. */
export const WIDE_HALO_WINDOW = 300e6;

export type HaloWindowSize = "narrow" | "normal" | "wide";

export function haloWindowSize(width: number): HaloWindowSize {
  if (width < NARROW_HALO_WINDOW) return "narrow";
  if (width >= WIDE_HALO_WINDOW) return "wide";
  return "normal";
}

/** La distance au centre du système, dans le plan du halo. */
export function haloDistance(point: HaloVector): number {
  return Math.hypot(point.x, point.y);
}

/** Où l'on se trouve par rapport aux bandes. */
export type HaloPlacement =
  | { inside: true; band: HaloBand; distance: number }
  | {
      inside: false;
      distance: number;
      /** La bande la plus proche, et à quelle distance de son bord. */
      nearest: HaloBand;
      gap: number;
      /** Vers l'extérieur (`out`) ou l'intérieur (`in`) du système. */
      towards: "in" | "out";
    };

export function haloPlacement(
  point: HaloVector,
  bands: HaloBand[] = DEFAULT_HALO_BANDS,
): HaloPlacement | null {
  if (bands.length === 0) return null;
  const distance = haloDistance(point);
  // À la frontière entre deux bandes qui se touchent, on est dans la
  // suivante : c'est celle où l'on entre en s'éloignant du centre.
  const inside = bands.find(
    (band) => distance >= band.inner && distance < band.outer,
  );
  if (inside) return { inside: true, band: inside, distance };

  let nearest = bands[0];
  let gap = Infinity;
  for (const band of bands) {
    const edge =
      distance < band.inner ? band.inner - distance : distance - band.outer;
    if (edge < gap) {
      gap = edge;
      nearest = band;
    }
  }
  return {
    inside: false,
    distance,
    nearest,
    gap,
    towards: distance < nearest.inner ? "out" : "in",
  };
}

/** Une traversée d'une bande pendant le saut. */
export interface HaloPass {
  band: HaloBand;
  /**
   * La distance qui reste jusqu'à l'arrivée, telle que le HUD l'affiche :
   * à l'entrée dans la bande, en son milieu (où couper), à sa sortie.
   */
  enterRemaining: number;
  targetRemaining: number;
  exitRemaining: number;
  /** La distance parcourue depuis le départ jusqu'au milieu. */
  targetTravelled: number;
  /** La longueur du trajet dans la bande : la marge pour couper. */
  width: number;
  /** Le milieu de la traversée, dans le repère du système. */
  target: HaloVector;
}

/** Un trajet de `from` à `to`, et chaque bande qu'il traverse. */
export interface HaloRoute {
  from: HaloPoint;
  to: HaloPoint;
  length: number;
  /** Dans l'ordre du trajet ; une bande peut être traversée deux fois. */
  passes: HaloPass[];
}

type Interval = [number, number];

/**
 * Les valeurs de `t` dans [0, 1] où le point `from + t (to - from)` est à
 * moins de `radius` du centre, dans le plan du halo : la distance au carré
 * est un polynôme du second degré en `t`, donc un seul intervalle.
 */
function withinRadius(
  from: HaloVector,
  delta: HaloVector,
  radius: number,
): Interval | null {
  const a = delta.x ** 2 + delta.y ** 2;
  const b = 2 * (from.x * delta.x + from.y * delta.y);
  const c = from.x ** 2 + from.y ** 2 - radius ** 2;
  if (a === 0) return c <= 0 ? [0, 1] : null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const low = Math.max(0, (-b - root) / (2 * a));
  const high = Math.min(1, (-b + root) / (2 * a));
  return low < high ? [low, high] : null;
}

/** `[low, high]` privé de `hole` : zéro, un ou deux intervalles. */
function minus(interval: Interval, hole: Interval | null): Interval[] {
  if (!hole) return [interval];
  const parts: Interval[] = [];
  if (hole[0] > interval[0])
    parts.push([interval[0], Math.min(hole[0], interval[1])]);
  if (hole[1] < interval[1])
    parts.push([Math.max(hole[1], interval[0]), interval[1]]);
  return parts.filter(([low, high]) => high > low);
}

export function haloRoute(
  from: HaloPoint,
  to: HaloPoint,
  bands: HaloBand[] = DEFAULT_HALO_BANDS,
): HaloRoute {
  const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const length = Math.hypot(delta.x, delta.y, delta.z);
  const passes: HaloPass[] = [];

  if (length > 0) {
    for (const band of bands) {
      const outer = withinRadius(from, delta, band.outer);
      if (!outer) continue;
      const hole = withinRadius(from, delta, band.inner);
      for (const [low, high] of minus(outer, hole)) {
        const middle = (low + high) / 2;
        passes.push({
          band,
          enterRemaining: (1 - low) * length,
          targetRemaining: (1 - middle) * length,
          exitRemaining: (1 - high) * length,
          targetTravelled: middle * length,
          width: (high - low) * length,
          target: {
            x: from.x + middle * delta.x,
            y: from.y + middle * delta.y,
            z: from.z + middle * delta.z,
          },
        });
      }
    }
  }

  passes.sort((a, b) => a.targetTravelled - b.targetTravelled);
  return { from, to, length, passes };
}

/** Un trajet qui traverse la bande voulue, et sa meilleure traversée. */
export interface HaloBandRoute {
  to: HaloPoint;
  pass: HaloPass;
}

/**
 * Depuis `from`, les arrivées dont le trajet traverse la bande `bandId`, la
 * plus large fenêtre d'abord : c'est la plus facile à attraper. Quand le
 * trajet la traverse deux fois, on garde la traversée la plus large.
 */
export function haloBandRoutes(
  from: HaloPoint,
  bandId: number,
  points: HaloPoint[] = HALO_POINTS,
  bands: HaloBand[] = DEFAULT_HALO_BANDS,
): HaloBandRoute[] {
  const band = bands.find((one) => one.id === bandId);
  if (!band) return [];
  return points
    .filter((point) => point.id !== from.id)
    .flatMap((to) => {
      const passes = haloRoute(from, to, [band]).passes;
      if (passes.length === 0) return [];
      const pass = passes.reduce((best, one) =>
        one.width > best.width ? one : best,
      );
      return [{ to, pass }];
    })
    .sort((a, b) => b.pass.width - a.pass.width);
}

export function findHaloPoint(
  id: string | null | undefined,
  points: HaloPoint[] = HALO_POINTS,
): HaloPoint | undefined {
  return id ? points.find((point) => point.id === id) : undefined;
}

/**
 * Une distance comme le HUD du saut l'affiche, en gigamètres, au centième :
 * 10 Mm près, quand une bande en fait 40 à 340.
 */
export function haloGigametres(meters: number): number {
  return Math.round(meters / 1e7) / 100;
}

/** Une largeur de fenêtre, en mégamètres entiers. */
export function haloMegametres(meters: number): number {
  return Math.round(meters / 1e6);
}

export function isHaloBand(value: unknown): value is HaloBand {
  if (!value || typeof value !== "object") return false;
  const band = value as Record<string, unknown>;
  return (
    typeof band.id === "number" &&
    Number.isInteger(band.id) &&
    typeof band.inner === "number" &&
    typeof band.outer === "number" &&
    Number.isFinite(band.inner) &&
    Number.isFinite(band.outer) &&
    band.inner >= 0 &&
    band.outer > band.inner &&
    typeof band.density === "number" &&
    band.density >= 0 &&
    band.density <= 1
  );
}

export function isHaloPoint(value: unknown): value is HaloPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.id === "string" &&
    point.id !== "" &&
    typeof point.label === "string" &&
    (point.station === undefined || typeof point.station === "string") &&
    (point.kind === "lagrange" || point.kind === "planet") &&
    typeof point.body === "string" &&
    [point.x, point.y, point.z].every(
      (axis) => typeof axis === "number" && Number.isFinite(axis),
    )
  );
}
