import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getMyContribution, getStanding } from "@/lib/contributions";
import type {
  Contribution,
  ContributionKind,
  ContributorStanding,
} from "@/types/contributions";

/**
 * Le joueur connecté et son niveau, pour une page de contribution. Sans
 * session, on l'envoie se connecter et revenir ici.
 */
export async function requireContributor(returnTo: string): Promise<{
  userId: ObjectId;
  name?: string;
  standing: ContributorStanding;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(returnTo)}`);
  }
  const userId = new ObjectId(session.user.id);
  return {
    userId,
    name: session.user.name,
    standing: await getStanding(userId),
  };
}

/**
 * La contribution que le formulaire reprend (`?c=`), si elle est bien à ce
 * joueur, de cette nature, sur cette fiche, et encore modifiable. Un lieu
 * proposé se reprend depuis son parent, un objet proposé depuis nulle part.
 */
export async function resumableContribution(
  id: string | undefined,
  userId: ObjectId,
  kind: ContributionKind,
  slug?: string,
): Promise<Contribution | null> {
  if (!id) return null;
  const contribution = await getMyContribution(id, userId);
  const anchor =
    kind === "placeCreate"
      ? contribution?.target.parent?.slug
      : kind === "itemCreate"
        ? undefined
        : contribution?.target.slug;
  if (
    !contribution ||
    contribution.kind !== kind ||
    anchor !== slug ||
    (contribution.status !== "pending" &&
      contribution.status !== "changesRequested")
  ) {
    return null;
  }
  return contribution;
}
