"use client";

import dynamic from "next/dynamic";

/**
 * La carte ne se rend que dans le navigateur : Leaflet lit `window` dès son
 * chargement, et ses tuiles n'ont rien à faire dans le HTML du serveur.
 */
export const PlanetMapLoader = dynamic(
  () => import("./planet-map").then((module) => module.PlanetMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-xl border border-[#9ED0FF]/15 bg-[#030912] md:h-[560px]" />
    ),
  },
);
