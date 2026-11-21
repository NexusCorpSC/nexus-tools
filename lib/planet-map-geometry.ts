/**
 * La géométrie des cartes de surface : passer d'un point du repère d'un corps
 * à sa latitude et sa longitude, et retour, et lire l'altitude du sol.
 *
 * **Copie de `nexus-app/src/lib/planet-map-geometry.ts`**, gardée identique :
 * le site et l'app doivent poser un marqueur au même endroit. Un changement
 * de l'un va à l'autre.
 *
 * Le repère est celui du NPS (`lib/nps-geometry.ts`) : `z` est l'axe du corps,
 * la longitude vaut `atan2(y, x)`. Les cartes extraites des fichiers du jeu
 * sont dans ce même repère (vérifié sur les lieux importés de starmap.space, à
 * un mètre près) : rien à convertir entre les deux.
 *
 * Les cartes sont équirectangulaires, longitude −180° à gauche, latitude +90°
 * en haut : le `CRS.EPSG4326` de Leaflet, sans projection à faire.
 */

import type { PlanetMapManifest } from "@/types/planet-maps";

export type Vector = { x: number; y: number; z: number };

export type LatLon = {
  /** Degrés, nord positif. */
  lat: number;
  /** Degrés, est positif, dans (−180, 180]. */
  lon: number;
};

const DEG = Math.PI / 180;

/** La latitude, la longitude et l'altitude au-dessus du rayon du sol. */
export function geoOfPoint(
  point: Vector,
  radius: number,
): LatLon & { alt: number } {
  const r = Math.hypot(point.x, point.y, point.z);
  return {
    lat: r > 0 ? Math.asin(point.z / r) / DEG : 0,
    lon: Math.atan2(point.y, point.x) / DEG,
    alt: r - radius,
  };
}

/** Le point du repère du corps à cette latitude, longitude et altitude. */
export function pointOfGeo(
  { lat, lon }: LatLon,
  alt: number,
  radius: number,
): Vector {
  const r = radius + alt;
  const cosLat = Math.cos(lat * DEG);
  return {
    x: r * cosLat * Math.cos(lon * DEG),
    y: r * cosLat * Math.sin(lon * DEG),
    z: r * Math.sin(lat * DEG),
  };
}

/** Ramène une longitude dans (−180, 180]. */
export function wrapLon(lon: number): number {
  const turned = (((lon + 180) % 360) + 360) % 360;
  return turned === 0 ? 180 : turned - 180;
}

/** La distance au sol, sur le grand cercle, au rayon du sol. */
export function groundDistance(a: LatLon, b: LatLon, radius: number): number {
  const phi1 = a.lat * DEG;
  const phi2 = b.lat * DEG;
  const dPhi = phi2 - phi1;
  const dLambda = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Le cap à suivre de `a` vers `b`, en degrés : nord 0°, est 90°. */
export function headingTo(a: LatLon, b: LatLon): number {
  const phi1 = a.lat * DEG;
  const phi2 = b.lat * DEG;
  const dLambda = (b.lon - a.lon) * DEG;
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (((Math.atan2(y, x) / DEG) % 360) + 360) % 360;
}

/**
 * La carte d'altitude d'un corps, décodée : 16 bits par pixel, rangés dans
 * le rouge (octet fort) et le vert (octet faible) d'un PNG, qu'un canvas lit
 * sans rien arrondir.
 */
export type AltitudeGrid = {
  width: number;
  height: number;
  min: number;
  max: number;
  values: Uint16Array;
};

export function decodeAltitude(
  rgba: Uint8ClampedArray | Uint8Array,
  manifest: PlanetMapManifest,
): AltitudeGrid {
  const { width, height, min, max } = manifest.altitude;
  const values = new Uint16Array(width * height);
  for (let i = 0; i < values.length; i++) {
    values[i] = (rgba[i * 4] << 8) | rgba[i * 4 + 1];
  }
  return { width, height, min, max, values };
}

/**
 * Charge et décode la carte d'altitude. Le PNG passe par `createImageBitmap`
 * sans conversion de couleur ni alpha prémultiplié : un `<img>` dessiné dans
 * un canvas peut subir la gestion des couleurs du navigateur, qui changerait
 * les octets et donc les altitudes.
 */
export async function loadAltitude(
  url: string,
  manifest: PlanetMapManifest,
): Promise<AltitudeGrid> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`altitude: HTTP ${response.status}`);
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: "none",
    premultiplyAlpha: "none",
  });
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("altitude: pas de contexte 2D");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return decodeAltitude(data, manifest);
}

/** L'altitude du sol, en mètres, au plus proche pixel. */
export function altitudeAt(grid: AltitudeGrid, { lat, lon }: LatLon): number {
  const x = Math.floor(((wrapLon(lon) + 180) / 360) * grid.width) % grid.width;
  const y = Math.min(
    grid.height - 1,
    Math.max(0, Math.floor(((90 - lat) / 180) * grid.height)),
  );
  const raw = grid.values[y * grid.width + x];
  return grid.min + (raw / 65535) * (grid.max - grid.min);
}

/** `12,48° N · 31,07° E`, pour un humain. */
export function formatLatLon({ lat, lon }: LatLon, locale = "fr-FR"): string {
  // L'ouest est « O » en français et en espagnol, « W » ailleurs.
  const west = /^(fr|es)/i.test(locale) ? "O" : "W";
  const number = (value: number) =>
    Math.abs(value).toLocaleString(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  return `${number(lat)}° ${lat >= 0 ? "N" : "S"} · ${number(lon)}° ${lon >= 0 ? "E" : west}`;
}

/** `184 km`, `620 m`. */
export function formatDistance(metres: number, locale = "fr-FR"): string {
  if (metres >= 10_000) {
    return `${Math.round(metres / 1000).toLocaleString(locale)} km`;
  }
  if (metres >= 1000) {
    return `${(metres / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
  }
  return `${Math.round(metres).toLocaleString(locale)} m`;
}

/** L'URL d'un fichier de la carte : le manifeste le donne relatif à sa base. */
export function planetMapUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path}`;
}
