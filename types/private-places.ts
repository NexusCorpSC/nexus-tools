import type { ContributionStatus } from "@/types/contributions";
import type {
  PlaceAncestor,
  PlacePosition,
  PlaceType,
} from "@/types/places";

/**
 * Les lieux privés : un lieu que seul son créateur voit, ou qu'il partage avec
 * une de ses organisations. Ce n'est pas une contribution — ni relecture, ni
 * points. Il vit dans `gameLocations` avec le catalogue, marqué par `privacy`,
 * et les lectures publiques l'écartent (voir `lib/private-places.ts`). Son
 * créateur peut le proposer au public, ce qui ouvre une contribution
 * `placeCreate` ; publiée, elle le remplace.
 */

/** Ce qu'un joueur peut avoir de lieux privés, partagés ou non. */
export const MAX_PRIVATE_PLACES = 200;

export const MAX_PRIVATE_PLACE_DESCRIPTION_LENGTH = 2000;

/**
 * Les types qu'un lieu privé peut prendre : un joueur ne crée ni étoile, ni
 * planète, ni lune.
 */
export const PRIVATE_PLACE_TYPES = [
  "outpost",
  "station",
  "building",
  "district",
  "spaceport",
  "city",
  "shop",
] as const satisfies readonly PlaceType[];

export type PrivatePlaceType = (typeof PRIVATE_PLACE_TYPES)[number];

export function isPrivatePlaceType(value: unknown): value is PrivatePlaceType {
  return (PRIVATE_PLACE_TYPES as readonly unknown[]).includes(value);
}

/** L'organisation avec qui un lieu est partagé. */
export type PrivatePlaceOrg = {
  id: string;
  name: string;
  tag?: string;
  /** Ses membres, créateur compris. */
  memberCount: number;
};

/**
 * Sa proposition au public, tant qu'elle n'est pas publiée : publiée, le lieu
 * privé n'existe plus.
 */
export type PrivatePlaceProposal = {
  contributionId: string;
  status: ContributionStatus;
};

/** Un lieu privé tel qu'une liste ou une carte le montre. */
export type PrivatePlaceSummary = {
  /** `prive-` et dix caractères : sa fiche est `/lieux/{slug}`, comme les autres. */
  slug: string;
  name: string;
  type: PrivatePlaceType;
  imageUrl?: string;
  /** Le lieu public qui le contient. */
  parentSlug: string;
  parentName?: string;
  systemSlug?: string;
  systemName?: string;
  bodySlug?: string;
  bodyName?: string;
  position?: PlacePosition;
  /** Partagé avec cette organisation ; absent, seul son créateur le voit. */
  org?: PrivatePlaceOrg;
  /** Celui qui lit en est le créateur : lui seul le modifie. */
  isOwner: boolean;
  ownerName?: string;
  /** La ligne de l'inventaire où ranger des objets dans ce lieu. */
  locationId: string;
  proposal?: PrivatePlaceProposal;
  createdAt: string;
  updatedAt: string;
};

/** Un lieu privé et ce que sa fiche montre en plus. */
export type PrivatePlace = PrivatePlaceSummary & {
  description?: string;
  image?: { url: string; width: number; height: number };
  /** Du système au parent direct, pour le fil d'Ariane. */
  ancestors: PlaceAncestor[];
};

/** Ce que le formulaire envoie, à la création comme à la modification. */
export type PrivatePlaceInput = {
  name: string;
  type: string;
  parentSlug: string;
  description?: string | null;
  /** Téléversée sous `prives/` par `/api/lieux/upload`. */
  image?: { url: string; width: number; height: number } | null;
  position?: PlacePosition | null;
  /** L'organisation qui le voit aussi ; `null` : lui seul. */
  orgId?: string | null;
};

/** Ce qu'une proposition au public emporte du lieu privé. */
export type PrivatePlaceProposalOptions = {
  withDescription?: boolean;
  withImage?: boolean;
  withPosition?: boolean;
};

/** `GET /api/lieux/prives` */
export type PrivatePlaceListResponse = {
  places: PrivatePlaceSummary[];
  /** Les organisations du joueur, pour partager. */
  orgs: { id: string; name: string; tag?: string }[];
  /** Ceux qu'il a créés, au regard de `MAX_PRIVATE_PLACES`. */
  owned: number;
};
