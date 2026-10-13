import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getStarMapInventory,
  getStarMapPlaces,
  getStarMapPrivatePlaces,
} from "@/lib/star-map";
import { StarMap } from "./star-map";

export const metadata: Metadata = {
  title: "Star Map",
  description:
    "La carte 3D de Stanton, Pyro et Nyx : planètes, lunes, stations et avant-postes, et les objets de votre inventaire à chaque endroit.",
  openGraph: {
    title: "Star Map — Nexus Tools",
    description: "Stanton, Pyro et Nyx en 3D, avec votre inventaire.",
    url: "https://tools.services.nexus/starmap",
  },
};

export default async function StarMapPage({
  searchParams,
}: {
  searchParams: Promise<{ place?: string }>;
}) {
  const [{ place }, session] = await Promise.all([
    searchParams,
    auth.api.getSession({ headers: await headers() }),
  ]);
  const [places, privatePlaces, inventory] = await Promise.all([
    getStarMapPlaces(),
    session ? getStarMapPrivatePlaces(session.user.id) : Promise.resolve([]),
    session ? getStarMapInventory(session.user.id) : Promise.resolve(null),
  ]);

  return (
    <StarMap
      places={[...places, ...privatePlaces]}
      inventory={inventory}
      initialPlace={place}
    />
  );
}
