import "server-only";

import { copy, del } from "@vercel/blob";
import {
  ContributionError,
  submitCatalogContribution,
} from "@/lib/contributions";
import { contributions, type Contributor } from "@/lib/contribution-store";
import {
  PrivatePlaceError,
  adoptPublishedPlace,
  getOwnedPrivatePlace,
  recordProposal,
} from "@/lib/private-places";
import type { SubmitContributionResult } from "@/types/contributions";
import type { PrivatePlaceProposalOptions } from "@/types/private-places";
import { ObjectId } from "mongodb";

const OPEN = new Set(["pending", "changesRequested"]);

/**
 * Propose un lieu privé au public : une contribution « nouveau lieu » comme
 * une autre, relue, et qui rapporte ses points à la publication. Le lieu reste
 * privé pendant la relecture ; publiée, la contribution le remplace
 * (`adoptPublishedPlace`).
 *
 * L'image est copiée dans la galerie du parent, là où une proposition range la
 * sienne : refusée, la proposition supprime sa copie, et le lieu privé garde
 * la sienne. La description ne part que si le créateur le demande : elle tient
 * souvent des consignes d'organisation.
 */
export async function proposePrivatePlace(
  author: Contributor,
  slug: string,
  options: PrivatePlaceProposalOptions,
): Promise<SubmitContributionResult> {
  const doc = await getOwnedPrivatePlace(String(author.id), slug);

  let image: { url: string; width: number; height: number } | undefined;
  const { imageWidth, imageHeight, proposalId } = doc.privacy;
  if (
    options.withImage !== false &&
    doc.imageUrl &&
    imageWidth &&
    imageHeight
  ) {
    const name = doc.imageUrl.split("/").pop() ?? "image.webp";
    const copied = await copy(
      doc.imageUrl,
      `lieux/${doc.parentSlug}/media/${name}`,
      { access: "public", addRandomSuffix: true },
    );
    image = {
      url: copied.url,
      width: imageWidth,
      height: imageHeight,
    };
  }

  // Une proposition encore ouverte se reprend plutôt que de se doubler.
  let contributionId: string | undefined;
  if (proposalId && ObjectId.isValid(proposalId)) {
    const open = await contributions().findOne(
      { _id: new ObjectId(proposalId) },
      { projection: { status: 1 } },
    );
    if (open && OPEN.has(open.status)) {
      contributionId = String(open._id);
    }
  }

  let result: SubmitContributionResult;
  try {
    result = await submitCatalogContribution(
      author,
      {
        kind: "placeCreate",
        parentSlug: doc.parentSlug ?? "",
        input: {
          name: doc.name,
          type: doc.type,
          parentSlug: doc.parentSlug,
          description:
            options.withDescription === true ? doc.description : undefined,
          position: options.withPosition !== false ? doc.position : undefined,
          image,
        },
      },
      { contributionId },
    );
  } catch (error) {
    // Refusée à l'envoi : sa copie de l'image n'a nulle part où aller.
    if (image) await del(image.url).catch(() => {});
    throw error;
  }

  const sent = new ObjectId(result.contribution.id);
  await recordProposal(slug, sent);
  // Publiée d'emblée (niveau 3) : la publication est passée avant qu'on sache
  // quel lieu privé elle remplaçait.
  if (result.contribution.status === "published") {
    await adoptPublishedPlace(sent, result.contribution.target.slug);
  }
  return result;
}

export { ContributionError, PrivatePlaceError };
