/**
 * L'organisation qu'un joueur affiche avec son pseudo — dans la liste d'amis
 * des autres, par exemple.
 *
 * Il la choisit parmi les siennes. Sans choix, ou s'il a quitté celle qu'il
 * avait choisie, chacun voit la première organisation qu'il partage avec lui.
 */

/** Une organisation dont le joueur est membre, telle que le choix la montre. */
export interface DisplayOrgOption {
  id: string;
  name: string;
  tag: string | null;
  image: string | null;
}

/**
 * GET et PUT `/api/me/display-org`. `orgId` est `null` sans choix — ou quand
 * l'organisation choisie a été quittée : le comportement par défaut reprend.
 */
export interface MyDisplayOrg {
  orgId: string | null;
  /** Mes organisations, par nom. */
  organizations: DisplayOrgOption[];
}

/** Pourquoi un choix est refusé, avec le statut HTTP. */
export type DisplayOrgErrorCode = "invalid_org" | "not_member";
