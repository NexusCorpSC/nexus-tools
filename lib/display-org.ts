import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/db";
import type {
  DisplayOrgErrorCode,
  DisplayOrgOption,
  MyDisplayOrg,
} from "@/types/display-org";

/**
 * L'organisation affichée avec le pseudo : `users.displayOrgId`, l'identifiant
 * d'une organisation du joueur. Elle n'est jamais effacée quand il la quitte :
 * l'appartenance est vérifiée à chaque lecture, si bien qu'une organisation
 * quittée — ou d'où il a été expulsé — cesse simplement d'être affichée.
 */

interface DbUser {
  _id: ObjectId;
  displayOrgId?: string;
}

interface DbOrganization {
  _id: string;
  name: string;
  tag?: string;
  image?: string;
  members?: { userId: ObjectId }[];
}

export class DisplayOrgError extends Error {
  constructor(
    readonly code: DisplayOrgErrorCode,
    readonly status: number,
  ) {
    super(code);
  }

  toJSON() {
    return { error: this.code };
  }
}

const users = () => db.db().collection<DbUser>("users");
const organizations = () => db.db().collection<DbOrganization>("organizations");

export async function getMyDisplayOrg(userId: ObjectId): Promise<MyDisplayOrg> {
  const [user, orgs] = await Promise.all([
    users().findOne({ _id: userId }, { projection: { displayOrgId: 1 } }),
    organizations()
      .find(
        { "members.userId": userId },
        { projection: { name: 1, tag: 1, image: 1 } },
      )
      .sort({ name: 1 })
      .toArray(),
  ]);

  const options: DisplayOrgOption[] = orgs.map((org) => ({
    id: String(org._id),
    name: org.name,
    tag: org.tag || null,
    image: org.image || null,
  }));
  const chosen = user?.displayOrgId;

  return {
    orgId: chosen && options.some((org) => org.id === chosen) ? chosen : null,
    organizations: options,
  };
}

/**
 * Choisit l'organisation affichée — `null` revient au comportement par
 * défaut. Refusée si le joueur n'en est pas membre.
 */
export async function setMyDisplayOrg(
  userId: ObjectId,
  orgId: unknown,
): Promise<MyDisplayOrg> {
  if (orgId === null) {
    await users().updateOne({ _id: userId }, { $unset: { displayOrgId: "" } });
    return getMyDisplayOrg(userId);
  }
  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new DisplayOrgError("invalid_org", 400);
  }

  const member = await organizations().findOne(
    { _id: orgId, "members.userId": userId },
    { projection: { _id: 1 } },
  );
  if (!member) throw new DisplayOrgError("not_member", 403);

  await users().updateOne({ _id: userId }, { $set: { displayOrgId: orgId } });
  return getMyDisplayOrg(userId);
}

/**
 * Le nom de l'organisation que chacun de `userIds` a choisi d'afficher, pour
 * ceux qui en sont toujours membres. Les autres sont absents de la carte.
 */
export async function displayOrgsOf(
  userIds: ObjectId[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (userIds.length === 0) return found;

  const chosen = await users()
    .find(
      { _id: { $in: userIds }, displayOrgId: { $type: "string" } },
      { projection: { displayOrgId: 1 } },
    )
    .toArray();
  if (chosen.length === 0) return found;

  const orgs = await organizations()
    .find(
      { _id: { $in: [...new Set(chosen.map((user) => user.displayOrgId!))] } },
      { projection: { name: 1, "members.userId": 1 } },
    )
    .toArray();
  const orgsById = new Map(orgs.map((org) => [String(org._id), org]));

  for (const user of chosen) {
    const org = orgsById.get(user.displayOrgId!);
    if (org?.members?.some((member) => member.userId.equals(user._id))) {
      found.set(user._id.toString(), org.name);
    }
  }
  return found;
}
