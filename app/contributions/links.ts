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
    case "missionEdit":
      return `/missions/${target.slug}/contribuer?c=${id}`;
    // Une organisation se corrige sur sa propre page d'édition.
    case "orgCreate":
      return `/orgs/${target.slug}/edit`;
    case "media":
    case "confirm":
      return targetHref(contribution);
  }
}

/** La fiche que vise une contribution — son parent, pour un lieu pas encore publié. */
export function targetHref(contribution: Contribution): string {
  const { target } = contribution;
  switch (target.type) {
    case "item":
      return contribution.kind === "itemCreate" &&
        contribution.status !== "published"
        ? "/items"
        : `/items/${target.slug}`;
    case "mission":
      return `/missions/${target.slug}`;
    case "org":
      return `/orgs/${target.slug}`;
    case "blueprint":
      return `/crafting/blueprints/${target.slug}`;
    case "place":
      if (
        contribution.kind === "placeCreate" &&
        contribution.status !== "published" &&
        target.parent
      ) {
        return `/lieux/${target.parent.slug}`;
      }
      return `/lieux/${target.slug}`;
  }
}
