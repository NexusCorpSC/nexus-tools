import type { Contribution } from "@/types/contributions";

/** La page qui reprend une contribution encore ouverte, là où elle a été faite. */
export function resumeHref(contribution: Contribution): string {
  const { target, id } = contribution;
  switch (contribution.kind) {
    case "placeEdit":
      return `/lieux/${target.slug}/contribuer?c=${id}`;
    case "placeCreate":
      return `/lieux/${target.parent?.slug ?? target.slug}/contribuer/lieu?c=${id}`;
    case "plan":
      return `/lieux/${target.slug}/contribuer/plan?plan=${target.planId ?? ""}`;
    case "itemEdit":
      return `/items/${target.slug}/contribuer?c=${id}`;
    case "itemCreate":
      return `/items/proposer?c=${id}`;
    case "media":
      return `/lieux/${target.slug}`;
  }
}

/** La fiche que vise une contribution — son parent, pour un lieu pas encore publié. */
export function targetHref(contribution: Contribution): string {
  const { target } = contribution;
  if (target.type === "item") {
    return contribution.kind === "itemCreate" &&
      contribution.status !== "published"
      ? "/items"
      : `/items/${target.slug}`;
  }
  if (
    contribution.kind === "placeCreate" &&
    contribution.status !== "published" &&
    target.parent
  ) {
    return `/lieux/${target.parent.slug}`;
  }
  return `/lieux/${target.slug}`;
}
