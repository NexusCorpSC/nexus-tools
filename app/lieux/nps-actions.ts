"use server";

import { getNpsData } from "@/lib/places";
import type { NpsBody } from "@/types/places";

/**
 * Les planètes et lunes que le NPS connaît, pour saisir les coordonnées d'un
 * lieu dans le repère de son corps. Publiques, comme `GET /api/lieux/nps`.
 */
export async function listNpsBodiesAction(): Promise<NpsBody[]> {
  const { bodies } = await getNpsData();
  return bodies;
}
