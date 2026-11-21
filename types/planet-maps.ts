/**
 * Les cartes de surface des planètes et des lunes.
 *
 * Une carte est un dossier de fichiers statiques (tuiles, altitude, texture,
 * manifeste) produit hors ligne, à chaque patch, à partir des fichiers du jeu,
 * puis envoyé dans le blob storage par `npm run import:planet-maps`. Ce ne
 * sont que nos propres rendus : aucun fichier du jeu n'est publié.
 *
 * **Copie de `nexus-app/src/types/planet-maps.ts`**, gardée identique.
 */

/** `manifest.json`, tel que le produit l'export. Chemins relatifs à la base. */
export type PlanetMapManifest = {
  v: 1;
  /** Le slug du lieu du catalogue (`daymar`). */
  slug: string;
  /** Le nom du corps dans les fichiers du jeu (`stanton2b`). */
  body: string;
  system: string;
  /** La version du jeu dont viennent les données. */
  build: string;
  /** Le rayon du sol, en mètres : l'altitude 0. */
  radius: number;
  /** L'étendue du relief, en mètres au-dessus du rayon. */
  reliefMin: number;
  reliefMax: number;
  tiles: {
    /** Relief ombré, en couleurs. `{z}/{x}/{y}` à la Leaflet. */
    base: string;
    /** Courbes de niveau, en transparence. */
    contours: string;
    tileSize: number;
    minZoom: number;
    maxNativeZoom: number;
  };
  altitude: {
    url: string;
    /** Rouge = octet fort, vert = octet faible. */
    encoding: "rg16";
    width: number;
    height: number;
    min: number;
    max: number;
  };
  /** La texture de la sphère de la Star Map, longitude −180° à gauche. */
  texture: string;
  calibration: { correlation: number; pois: number };
  attribution: string;
};

/** Une carte publiée : son manifeste et l'adresse de son dossier. */
export type PlanetMap = {
  manifest: PlanetMapManifest;
  baseUrl: string;
};

/** Ce qu'on pose sur une carte de surface. */
export type PlanetMapPoint = {
  /** Unique sur la carte. */
  id: string;
  kind: "place" | "private" | "marker";
  name: string;
  lat: number;
  lon: number;
  /** Mètres au-dessus du rayon du sol. */
  alt: number;
  /** Le type du lieu, ou la sorte du marqueur. */
  type: string;
  /** La couleur du point ; celle de sa collection pour un marqueur. */
  color: string;
  /** La fiche à ouvrir. */
  href?: string;
  /** Pour un marqueur : sa collection, sa note. */
  collection?: string;
  note?: string;
  /** Un lieu privé d'organisation, un marqueur partagé : à qui. */
  org?: string;
};
