/**
 * Les échanges de Wikelo, le marchand banu de l'Emporium : en jeu, chacun est
 * un contrat (« Wikelo - Vehicles »…) qui demande d'apporter des objets ou
 * des ressources et donne un objet, parfois son blueprint, en retour.
 * Importés de l'API du Star Citizen Wiki (`npm run import:game-data -- wikelo`)
 * dans la collection `wikeloTrades`.
 */

/** Un objet (ou une ressource) demandé ou donné par un échange. */
export type WikeloTradeEntry = {
  /** L'uuid de l'objet dans le jeu, celui que porte `source.id` d'un objet importé du wiki. */
  wikiId?: string;
  name: string;
  /** Un nombre d'unités, pour un objet. */
  quantity?: number;
  /** Un volume en SCU, pour une ressource livrée en vrac. */
  scu?: number;
};

/** Un blueprint donné en plus de l'objet. */
export type WikeloTradeBlueprint = {
  /** Le GUID du blueprint, celui que porte `gameId` d'un blueprint importé. */
  gameId: string;
  name: string;
  /** Chance de l'obtenir, entre 0 et 1 ; absente quand elle est certaine. */
  chance?: number;
};

/** Un échange tel qu'il est en base (collection `wikeloTrades`). */
export type WikeloTrade = {
  /** L'uuid du contrat dans le jeu : la clé de l'import. */
  wikiId: string;
  title: string;
  description: string;
  /** Ce qu'il faut apporter. */
  requirements: WikeloTradeEntry[];
  /**
   * Ce que l'échange donne. Un seul lot en général ; quand il y en a
   * plusieurs, le jeu en tire un au hasard.
   */
  rewardChoices: WikeloTradeEntry[][];
  blueprints: WikeloTradeBlueprint[];
  /** Réputation gagnée auprès de Wikelo. */
  reputation?: number;
  /** L'échange ne se fait qu'une fois. */
  onceOnly: boolean;
  /** Version du jeu lue chez la source. */
  version: string;
  /** Clés de recherche, tenues par l'import : uuid et nom en minuscules. */
  rewardIds: string[];
  rewardNames: string[];
  requirementIds: string[];
  requirementNames: string[];
  blueprintGameIds: string[];
  importedAt: string;
  /** L'échange a disparu de la source : il reste en base, marqué. */
  removedAt?: string;
};

/** Un objet d'un échange, avec sa fiche du catalogue quand on la connaît. */
export type WikeloTradeEntryView = {
  name: string;
  quantity?: number;
  scu?: number;
  /** Slug de la fiche objet, quand le catalogue l'a. */
  itemSlug?: string;
};

/** Un échange tel qu'une fiche, l'API et le MCP le montrent. */
export type WikeloTradeView = {
  id: string;
  title: string;
  description: string;
  requirements: WikeloTradeEntryView[];
  rewardChoices: WikeloTradeEntryView[][];
  blueprints: (WikeloTradeBlueprint & { slug?: string })[];
  reputation?: number;
  onceOnly: boolean;
  version: string;
  /** Identifiant de la fiche mission (`/missions/<id>`), quand elle existe. */
  missionId?: string;
};

/** Ce qu'une fiche objet montre de Wikelo. */
export type ItemWikeloTrades = {
  /** Les échanges qui donnent cet objet. */
  rewards: WikeloTradeView[];
  /** Les échanges qui le demandent. */
  wanted: WikeloTradeView[];
};

/** La clé sur laquelle deux noms sont comparés. */
export function wikeloNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}
