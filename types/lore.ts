/**
 * Le lore du 'Verse, importé de l'API du Star Citizen Wiki
 * (`npm run import:game-data -- lore`) : les articles de la Galactapedia et
 * la starmap de RSI (systèmes et objets célestes).
 *
 * La source n'a le texte qu'en anglais : ses traductions sont des copies de
 * l'anglais, parfois celles d'un autre article. Seul l'anglais est gardé.
 */

/** Un article de la Galactapedia (collection `loreArticles`). */
export type LoreArticle = {
  /** L'identifiant de l'article chez RSI (`RL64awp5oL`) : la clé de l'import. */
  wikiId: string;
  slug: string;
  title: string;
  /** Le modèle de fiche : `Company`, `StarSystem`, `People`… */
  template?: string;
  /** Le type affiché par RSI : « Civilization », « Planet »… */
  type?: string;
  categories: string[];
  tags: string[];
  thumbnailUrl?: string;
  /** Le texte, en Markdown, avec des liens vers d'autres articles RSI. */
  body: string;
  /** La page de l'article sur le site de RSI. */
  rsiUrl: string;
  /** Les articles que celui-ci cite, par `wikiId`, dans l'ordre du texte. */
  linkedIds: string[];
  createdAt?: string;
  importedAt: string;
  /** L'article a disparu de la source : il reste en base, marqué. */
  removedAt?: string;
};

export const STARMAP_KINDS = ["system", "body"] as const;

export type StarmapKind = (typeof STARMAP_KINDS)[number];

/** Population, économie et danger, de 0 à 10 selon la starmap. */
export type StarmapSensor = {
  population: number;
  economy: number;
  danger: number;
};

export type StarmapJumpPoint = {
  /** Le code du système d'arrivée. */
  to: string;
  toName?: string;
  /** Taille du point de saut : S, M ou L. */
  size?: string;
};

/**
 * Un système ou un objet céleste de la starmap (collection `starmap`).
 *
 * Ce n'est pas la géométrie du jeu : le NPS prend la sienne chez
 * starmap.space (`import:celestial-bodies`). C'est la carte de lore de RSI.
 */
export type StarmapEntry = {
  /** `STANTON`, `STANTON.PLANETS.STANTONIICRUSADER` : la clé de l'import. */
  code: string;
  kind: StarmapKind;
  systemCode: string;
  name: string;
  /** « Stanton II » pour Crusader ; absente pour un système. */
  designation?: string;
  /** `SINGLE_STAR`, `PLANET`, `SATELLITE`, `MANMADE`, `STAR`… */
  type: string;
  /** « Gas Giant », « Space Station »… */
  subType?: string;
  /** Statut d'un système : `P` publié, `M` mentionné, `N` inexploré. */
  status?: string;
  description?: string;
  affiliations: string[];
  sensor?: StarmapSensor;
  habitable?: boolean;
  /** Le code de l'objet autour duquel il tourne. */
  parentCode?: string;
  /** Les points de saut d'un système. */
  jumpPoints?: StarmapJumpPoint[];
  /** Le lieu du catalogue qui lui correspond, quand il y en a un. */
  placeSlug?: string;
  /** L'article de la Galactapedia qui lui correspond. */
  articleId?: string;
  importedAt: string;
  removedAt?: string;
};

export const LORE_SEARCH_LIMIT = { default: 8, max: 25 } as const;

/** Les articles d'une page de la Galactapedia, sur le site et dans l'app. */
export const LORE_PAGE_SIZE = 24;
