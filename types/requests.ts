/**
 * Le tableau des demandes : un joueur publie « j'ai besoin de… » (un matériau,
 * un objet, un vaisseau), ses amis, ses orgas ou tout le monde le voient, et
 * ceux qui en ont répondent par une offre. Chaque offre a son fil privé, où
 * les deux négocient ; l'échange lui-même se fait en jeu.
 *
 * Rien ici ne touche la base : le site, l'app (par l'API) et le serveur MCP
 * partagent ces formes et ces limites. L'accès aux données est dans
 * `lib/player-requests.ts`.
 */

/** Ce que demande une demande : le type de la fiche du catalogue, ou « autre ». */
export const REQUEST_KINDS = [
  "resource",
  "item",
  "weapon",
  "vehicle",
  "other",
] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export function isRequestKind(value: unknown): value is RequestKind {
  return (REQUEST_KINDS as readonly unknown[]).includes(value);
}

/** Les filtres du tableau regroupent les types : armes et objets ensemble. */
export const REQUEST_KIND_FILTERS = ["resource", "item", "vehicle"] as const;
export type RequestKindFilter = (typeof REQUEST_KIND_FILTERS)[number];

export function kindsOfFilter(filter: RequestKindFilter): RequestKind[] {
  if (filter === "item") return ["item", "weapon", "other"];
  return [filter];
}

/**
 * Les unités d'une quantité, comme les lots de l'inventaire : SCU ou cSCU
 * pour un matériau, aucune (des unités) pour le reste.
 */
export const REQUEST_UNITS = ["SCU", "cSCU"] as const;
export type RequestUnit = (typeof REQUEST_UNITS)[number];

export function isRequestUnit(value: unknown): value is RequestUnit {
  return (REQUEST_UNITS as readonly unknown[]).includes(value);
}

/** Une demande ouverte, pourvue (tout reçu), expirée ou close par son auteur. */
export type RequestStatus = "OPEN" | "FILLED" | "EXPIRED" | "CLOSED";

/**
 * Une offre : nouvelle, retenue par le demandeur, reçue (la quantité compte
 * dans la demande), déclinée par le demandeur ou retirée par le fournisseur.
 */
export type OfferStatus =
  | "NEW"
  | "KEPT"
  | "RECEIVED"
  | "DECLINED"
  | "WITHDRAWN";

/** Les offres encore en cours, qui attendent l'un ou l'autre. */
export const ACTIVE_OFFER_STATUSES: OfferStatus[] = ["NEW", "KEPT"];

/** Les durées proposées à la publication, en jours. */
export const REQUEST_EXPIRY_DAYS = [1, 3, 7, 14, 30] as const;
export const DEFAULT_REQUEST_EXPIRY_DAYS = 7;

/** Demandes ouvertes qu'un joueur peut avoir à la fois. */
export const MAX_OPEN_REQUESTS = 20;
/** Offres qu'un joueur peut envoyer en 24 heures. */
export const MAX_OFFERS_PER_DAY = 30;

export const MAX_REQUEST_NAME = 120;
export const MAX_REQUEST_NOTE = 1000;
export const MAX_OFFER_MESSAGE = 2000;
/** Orgas qu'une même demande peut viser. */
export const MAX_REQUEST_ORGS = 10;
export const MAX_REQUEST_QUANTITY = 1_000_000;
export const MAX_UNIT_PRICE = 1_000_000_000;

/** Qui voit une demande : ses amis, des orgas dont il est membre, tout le monde. */
export type RequestAudience = {
  friends: boolean;
  orgIds: string[];
  public: boolean;
};

export type RequestLocation = {
  id: string;
  name: string;
  system?: string;
};

/** Ce que mon inventaire peut fournir à une demande, pour « Vous en avez ». */
export type RequestSupply = {
  /** Dans l'unité de la demande. */
  quantity: number;
  /** La meilleure qualité des lots qui comptent. */
  quality?: number;
  /** Le lieu du plus gros lot. */
  locationName?: string;
};

/** Une demande telle que le tableau, la fiche, l'app et le MCP la lisent. */
export type PlayerRequest = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  name: string;
  itemSlug?: string;
  kind: RequestKind;
  quantity: number;
  unit?: RequestUnit;
  /** Sur 1000. */
  minQuality?: number;
  location?: RequestLocation;
  /** En aUEC par unité de la demande ; absent : « à négocier ». */
  unitPrice?: number;
  note?: string;
  audience: {
    friends: boolean;
    orgs: { id: string; name: string }[];
    public: boolean;
  };
  status: RequestStatus;
  /** Reçu des offres marquées reçues. */
  received: number;
  /** `quantity - received`, jamais sous zéro. */
  remaining: number;
  /** Offres en cours (nouvelles ou retenues). */
  activeOffers: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  /** Le lecteur en est l'auteur. */
  mine: boolean;
  /** L'offre en cours du lecteur sur cette demande. */
  myOffer?: { id: string; status: OfferStatus };
  supply?: RequestSupply;
};

export type OfferRole = "requester" | "supplier";

/** Un message, un prix proposé ou un changement d'état, dans le fil d'une offre. */
export type OfferEntry = {
  id: string;
  at: string;
  role: OfferRole;
  authorName: string;
  kind: "message" | "price" | "status";
  body?: string;
  unitPrice?: number;
  status?: OfferStatus;
  /** La quantité marquée reçue. */
  quantity?: number;
};

export type RequestOffer = {
  id: string;
  requestId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  quantity: number;
  quality?: number;
  /** Le dernier prix proposé, par l'un ou l'autre, en aUEC par unité. */
  unitPrice?: number;
  /** Le lot de l'inventaire du fournisseur dont vient l'offre. */
  inventoryItemId?: string;
  locationName?: string;
  status: OfferStatus;
  /** Ce que le demandeur a marqué reçu. */
  receivedQuantity?: number;
  timeline: OfferEntry[];
  createdAt: string;
  updatedAt: string;
};

/** Un lot de mon inventaire proposé dans « J'en ai ». */
export type SupplyLot = {
  id: string;
  name: string;
  quality?: number;
  /** Dans l'unité du lot. */
  quantity: number;
  unit?: string;
  /** Dans l'unité de la demande. */
  inRequestUnit: number;
  locationName?: string;
  /** Sous la qualité minimale demandée. */
  belowMinimum: boolean;
};

/** La fiche d'une demande : ce que le lecteur a le droit d'en voir. */
export type RequestDetail = {
  request: PlayerRequest;
  /** Toutes pour l'auteur, la sienne seulement pour un fournisseur. */
  offers: RequestOffer[];
  /** Les lots du lecteur qui portent ce nom, pour « J'en ai ». */
  lots: SupplyLot[];
};

/** Ce que fait le demandeur ou le fournisseur sur une offre. */
export const OFFER_ACTIONS = [
  "keep",
  "decline",
  "receive",
  "withdraw",
  "price",
] as const;
export type OfferAction = (typeof OFFER_ACTIONS)[number];

export function isOfferAction(value: unknown): value is OfferAction {
  return (OFFER_ACTIONS as readonly unknown[]).includes(value);
}

/** Qui peut faire quoi, et depuis quels états. */
export const OFFER_RULES: Record<
  OfferAction,
  { role: OfferRole; from: OfferStatus[]; to?: OfferStatus }
> = {
  keep: { role: "requester", from: ["NEW"], to: "KEPT" },
  decline: { role: "requester", from: ["NEW", "KEPT"], to: "DECLINED" },
  receive: { role: "requester", from: ["NEW", "KEPT"], to: "RECEIVED" },
  withdraw: { role: "supplier", from: ["NEW", "KEPT"], to: "WITHDRAWN" },
  // Un prix proposé ne change pas l'état ; l'un ou l'autre le peut.
  price: { role: "requester", from: ["NEW", "KEPT"] },
};

/** Les actions offertes à un rôle sur une offre dans cet état. */
export function offerActionsFor(
  status: OfferStatus,
  role: OfferRole,
): OfferAction[] {
  return OFFER_ACTIONS.filter((action) => {
    const rule = OFFER_RULES[action];
    if (!rule.from.includes(status)) return false;
    return action === "price" || rule.role === role;
  });
}

/** Les erreurs qu'un formulaire ou l'app traduisent. */
export const REQUEST_ERRORS = [
  "invalid",
  "notFound",
  "notAllowed",
  "tooManyOpen",
  "tooManyOffers",
  "alreadyOffered",
  "ownRequest",
  "closed",
  "notMember",
] as const;
export type RequestErrorCode = (typeof REQUEST_ERRORS)[number];

/** Une activité qui mérite d'être signalée : la cloche du site et l'app. */
export type RequestNoticeType =
  | "request"
  | "offer"
  | "message"
  | "price"
  | "status";

export type RequestNotice = {
  id: string;
  type: RequestNoticeType;
  requestId: string;
  offerId?: string;
  /** Qui a agi. */
  actorName: string;
  /** « 120 SCU de Riccite », pour le titre. */
  summary: string;
  /** L'état atteint, pour `status`. */
  status?: OfferStatus;
  unitPrice?: number;
  /** Le début d'un message, pour `message` et `offer`. */
  excerpt?: string;
  /** Le demandeur qui publie, pour `request` : l'orga qui la voit, s'il y en a une. */
  orgName?: string;
  at: string;
  seen: boolean;
  /** La fiche de la demande sur le site. */
  path: string;
};

/** Ce que l'app lit pour sa page Demandes et ses notifications. */
export type AppRequestsSummary = {
  /** Mes demandes ouvertes et celles closes depuis peu. */
  requests: PlayerRequest[];
  /** Mes offres, avec la demande qu'elles visent. */
  offers: (RequestOffer & { request: PlayerRequest })[];
  /** Vide sans `since` : la première lecture ne fait que poser le repère. */
  events: RequestNotice[];
  unseen: number;
  now: string;
};

/** Le chemin d'une demande sur le site. */
export function requestPath(id: string, offerId?: string): string {
  return `/demandes/${id}${offerId ? `#offre-${offerId}` : ""}`;
}

/** « 120 SCU », « 4 » : une quantité dans l'unité de la demande. */
export function quantityLabel(quantity: number, unit?: string): string {
  const shown = Number.isInteger(quantity)
    ? String(quantity)
    : String(Math.round(quantity * 100) / 100);
  return unit ? `${shown} ${unit}` : shown;
}
