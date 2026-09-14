import {
  ArchiveBoxIcon,
  BeakerIcon,
  BoltIcon,
  BuildingLibraryIcon,
  BuildingOffice2Icon,
  BuildingOfficeIcon,
  BuildingStorefrontIcon,
  ClipboardDocumentListIcon,
  GlobeAltIcon,
  HeartIcon,
  HomeIcon,
  HomeModernIcon,
  KeyIcon,
  MapIcon,
  MoonIcon,
  PaperAirplaneIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  Squares2X2Icon,
  SunIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { PlaceService, PlaceType } from "@/types/places";

type Icon = typeof SunIcon;

/**
 * Sorti de la fiche pour qu'un composant client puisse le lire sans embarquer
 * du code `server-only` — la même raison qui a fait sortir `item-accents`.
 */
export const PLACE_TYPE_ICON: Record<PlaceType, Icon> = {
  star: SunIcon,
  planet: GlobeAltIcon,
  moon: MoonIcon,
  city: BuildingOffice2Icon,
  station: RocketLaunchIcon,
  outpost: HomeModernIcon,
  spaceport: PaperAirplaneIcon,
  district: BuildingOfficeIcon,
  building: BuildingLibraryIcon,
  shop: BuildingStorefrontIcon,
};

export const PLACE_SERVICE_ICON: Record<PlaceService, Icon> = {
  asop: RocketLaunchIcon,
  restock: BoltIcon,
  medical: HeartIcon,
  armory: ShieldCheckIcon,
  cargo: ArchiveBoxIcon,
  refinery: BeakerIcon,
  rental: KeyIcon,
  habitation: HomeIcon,
  crafting: WrenchScrewdriverIcon,
  missions: ClipboardDocumentListIcon,
  transit: MapIcon,
  hangar: Squares2X2Icon,
};

/**
 * « Stanton › Hurston › Lorville » — la chaîne telle qu'une carte l'affiche.
 * Les doublons sautent : une station en orbite d'une planète a le même nom en
 * corps et en parent, et l'écrire deux fois n'apprendrait rien.
 */
export function placeTrail(place: {
  systemName?: string;
  bodyName?: string;
  parentName?: string;
}): string {
  const seen = new Set<string>();
  return [place.systemName, place.bodyName, place.parentName]
    .filter((name): name is string => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      return true;
    })
    .join(" › ");
}
