import "server-only";
import type { ObjectId } from "mongodb";
import db from "@/lib/db";

/**
 * Une organisation telle qu'en base, avec ce que l'ouverture à tous y ajoute :
 * qui l'a créée, et où en est sa validation. Une organisation sans
 * `validation` a été créée avant, par la Nexus Corporation : elle est validée.
 */
export interface DbOrganization {
  _id: string;
  name: string;
  tag?: string;
  description?: string;
  image?: string;
  public?: boolean;
  reportHidden?: boolean;
  members: { userId: ObjectId; rank?: string; editor?: boolean }[];
  joinCode?: string;
  createdBy?: ObjectId;
  createdAt?: Date;
  validation?: {
    status: "pending" | "validated" | "rejected";
    at?: Date;
    message?: string;
  };
}

export const organizations = () =>
  db.db().collection<DbOrganization>("organizations");

/** Une organisation peut passer publique : validée, ou d'avant l'ouverture. */
export function isOrgValidated(
  org: Pick<DbOrganization, "validation">,
): boolean {
  return !org.validation || org.validation.status === "validated";
}

/** Le logo d'une organisation qui n'en a pas encore. */
export const DEFAULT_ORG_IMAGE = "/avatar_empty.png";
