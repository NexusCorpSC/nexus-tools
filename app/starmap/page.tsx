import type { Metadata } from "next";
import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getMyPositionSharing, visiblePlayers } from "@/lib/player-positions";
import {
  getStarMapInventory,
  getStarMapMarkers,
  getStarMapPlaces,
  getStarMapPrivatePlaces,
} from "@/lib/star-map";
import { StarMap } from "./star-map";

export const metadata: Metadata = {
  title: "Star Map",
  description:
    "La carte 3D de Stanton, Pyro et Nyx : planètes, lunes, stations et avant-postes, les objets de votre inventaire à chaque endroit, et vos amis en jeu.",
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
  const userId = session ? new ObjectId(session.user.id) : null;
  const [places, privatePlaces, markers, inventory, players, sharing] =
    await Promise.all([
      getStarMapPlaces(),
      session ? getStarMapPrivatePlaces(session.user.id) : Promise.resolve([]),
      session ? getStarMapMarkers(session.user.id) : Promise.resolve([]),
      session ? getStarMapInventory(session.user.id) : Promise.resolve(null),
      userId ? visiblePlayers(userId) : Promise.resolve(null),
      userId ? getMyPositionSharing(userId) : Promise.resolve(null),
    ]);

  return (
    <StarMap
      places={[...places, ...privatePlaces, ...markers]}
      inventory={inventory}
      initialPlace={place}
      players={players}
      sharing={sharing}
    />
  );
}
