import "server-only";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { put } from "@vercel/blob";
import {
  ContributionError,
  cleanText,
  contributions,
  toContribution,
  type Contributor,
  type DbContribution,
} from "@/lib/contribution-store";
import { getStanding, refreshProgress } from "@/lib/contributions";
import {
  DEFAULT_ORG_IMAGE,
  organizations,
  type DbOrganization,
} from "@/lib/orgs";
import {
  MAX_ORG_DESCRIPTION_LENGTH,
  MAX_ORG_LOGO_BYTES,
  MAX_ORG_NAME_LENGTH,
  MAX_ORG_TAG_LENGTH,
  MAX_ORGS_PER_ACCOUNT,
  MIN_ORG_NAME_LENGTH,
  POINTS,
  type Contribution,
  type ContributionChange,
} from "@/types/contributions";

/**
 * Les organisations ouvertes à tous. Une organisation créée existe tout de
 * suite pour ses membres, privée ; sa création est une contribution
 * `orgCreate`, que la modération valide dans la file comme les autres. La
 * validation lui permet de passer publique et rapporte ses points à son
 * créateur ; l'annuler la renvoie dans l'ombre (`lib/contribution-catalog.ts`).
 */

export type OrgInput = { name: string; tag: string; description?: string };

const LOGO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lève `invalidInput` avec un message pour le formulaire. */
export function normalizeOrgInput(input: unknown): OrgInput {
  const raw = (input ?? {}) as Record<string, unknown>;
  const name = cleanText(raw.name, MAX_ORG_NAME_LENGTH) ?? "";
  if (name.length < MIN_ORG_NAME_LENGTH) {
    throw new ContributionError(
      "invalidInput",
      400,
      `Le nom compte au moins ${MIN_ORG_NAME_LENGTH} caractères.`,
    );
  }
  const tag = (typeof raw.tag === "string" ? raw.tag : "").trim().toUpperCase();
  if (!new RegExp(`^[A-Z0-9]{2,${MAX_ORG_TAG_LENGTH}}$`).test(tag)) {
    throw new ContributionError(
      "invalidInput",
      400,
      `Le tag compte de 2 à ${MAX_ORG_TAG_LENGTH} lettres ou chiffres.`,
    );
  }
  return {
    name,
    tag,
    description: cleanText(raw.description, MAX_ORG_DESCRIPTION_LENGTH),
  };
}

/** Un logo d'organisation : rangé sous son identifiant, jamais à une adresse devinable. */
export async function uploadOrgLogo(
  orgId: string,
  logo: File | null | undefined,
): Promise<string | undefined> {
  if (!logo || logo.size === 0) return undefined;
  const extension = LOGO_TYPES[logo.type];
  if (!extension) {
    throw new ContributionError(
      "invalidInput",
      400,
      "Le logo est une image JPEG, PNG ou WebP.",
    );
  }
  if (logo.size > MAX_ORG_LOGO_BYTES) {
    throw new ContributionError(
      "invalidInput",
      400,
      `Le logo pèse ${Math.round(MAX_ORG_LOGO_BYTES / 1_000_000)} Mo au plus.`,
    );
  }
  const blob = await put(`orgs/${orgId}/logo.${extension}`, logo, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob.url;
}

/** Ce que la relecture compare : il n'y a pas d'« avant » à une création. */
function orgChanges(org: OrgInput): ContributionChange[] {
  return [
    { field: "name", after: org.name },
    { field: "tag", after: org.tag },
    ...(org.description
      ? [{ field: "description", after: org.description }]
      : []),
  ];
}

function orgPreview(image: string | undefined) {
  // Le logo par défaut est servi par le site : il n'apprend rien au relecteur.
  return image && image !== DEFAULT_ORG_IMAGE
    ? { url: image, width: 256, height: 256 }
    : undefined;
}

/** Les organisations qu'un joueur a créées et qui comptent dans sa limite. */
export async function countMyOrgs(userId: ObjectId): Promise<number> {
  return organizations().countDocuments({
    createdBy: userId,
    "validation.status": { $ne: "rejected" },
  });
}

/**
 * Crée une organisation, privée, et la soumet à la validation. Son créateur
 * en est le premier membre, éditeur.
 */
export async function createOrganization(
  author: Contributor,
  input: unknown,
  logo?: File | null,
): Promise<{ orgId: string; contribution: Contribution }> {
  const standing = await getStanding(author.id);
  if (standing.suspendedUntil) throw new ContributionError("suspended", 403);
  const org = normalizeOrgInput(input);

  if ((await countMyOrgs(author.id)) >= MAX_ORGS_PER_ACCOUNT) {
    throw new ContributionError("tooManyOrgs", 429);
  }
  // Deux organisations du même nom ou du même tag se confondraient partout
  // où on les cite.
  const taken = await organizations().countDocuments({
    $or: [
      { name: { $regex: `^${escapeRegExp(org.name)}$`, $options: "i" } },
      { tag: org.tag },
    ],
  });
  if (taken > 0) throw new ContributionError("duplicate", 409);

  const orgId = randomUUID();
  const image = (await uploadOrgLogo(orgId, logo)) ?? DEFAULT_ORG_IMAGE;
  const now = new Date();

  const doc: DbOrganization = {
    _id: orgId,
    name: org.name,
    tag: org.tag,
    description: org.description ?? "",
    image,
    public: false,
    members: [{ userId: author.id, rank: "Fondateur", editor: true }],
    createdBy: author.id,
    createdAt: now,
    validation: { status: "pending" },
  };
  await organizations().insertOne(doc);

  const contribution: DbContribution = {
    _id: new ObjectId(),
    userId: author.id,
    userName: author.name,
    kind: "orgCreate",
    target: { type: "org", slug: orgId, name: org.name },
    status: "pending",
    mediaIds: [],
    points: POINTS.orgCreate,
    changes: orgChanges(org),
    preview: orgPreview(image),
    createdAt: now,
    updatedAt: now,
  };
  await contributions().insertOne(contribution);

  return { orgId, contribution: toContribution(contribution) };
}

/**
 * Après une modification du profil par ses éditeurs : la demande de
 * validation encore ouverte montre ce qui sera validé. Renvoyée à corriger,
 * elle repart en relecture.
 */
export async function syncOrgValidation(orgId: string): Promise<void> {
  const org = await organizations().findOne({ _id: orgId });
  if (!org) return;
  const open = await contributions().findOne({
    kind: "orgCreate",
    "target.slug": orgId,
    status: { $in: ["pending", "changesRequested"] },
  });
  if (!open) return;

  const values: OrgInput = {
    name: org.name,
    tag: org.tag ?? "",
    description: org.description || undefined,
  };
  await contributions().updateOne(
    { _id: open._id, status: { $in: ["pending", "changesRequested"] } },
    {
      $set: {
        status: "pending",
        "target.name": org.name,
        changes: orgChanges(values),
        updatedAt: new Date(),
        ...(orgPreview(org.image) ? { preview: orgPreview(org.image) } : {}),
      },
      ...(open.status === "changesRequested" ? { $unset: { review: "" } } : {}),
    },
  );
}

/** La demande de validation d'une organisation, pour sa page. */
export async function getOrgValidationRequest(
  orgId: string,
): Promise<Contribution | null> {
  const doc = await contributions().findOne(
    { kind: "orgCreate", "target.slug": orgId },
    { sort: { createdAt: -1 } },
  );
  return doc ? toContribution(doc) : null;
}

/**
 * Un membre de plus : le créateur approche peut-être du succès Fondateur.
 * Ne lève jamais, comme `refreshProgress`.
 */
export async function onOrgMembersChanged(orgId: string): Promise<void> {
  const org = await organizations().findOne(
    { _id: orgId },
    { projection: { createdBy: 1 } },
  );
  if (org?.createdBy) await refreshProgress(org.createdBy);
}
