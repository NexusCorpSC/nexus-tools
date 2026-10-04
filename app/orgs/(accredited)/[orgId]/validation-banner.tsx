import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getOrgValidationRequest } from "@/lib/org-contributions";
import type { Organization } from "@/app/orgs/page";

/**
 * Où en est la validation d'une organisation créée par un joueur, pour ses
 * éditeurs : en attente, à corriger, refusée, ou validée mais encore privée.
 */
export async function OrgValidationBanner({
  org,
}: {
  org: Pick<Organization, "_id" | "public" | "validation">;
}) {
  if (!org.validation) return null;
  const t = await getTranslations("Organizations.Validation");
  const request = await getOrgValidationRequest(org._id);
  const status =
    request?.status === "changesRequested"
      ? "changesRequested"
      : org.validation.status;
  if (status === "validated" && org.public) return null;

  const message =
    status === "changesRequested"
      ? request?.review?.message
      : status === "rejected"
        ? org.validation.message
        : undefined;
  const tone =
    status === "rejected" || status === "changesRequested"
      ? "border-amber-300/45 bg-amber-300/10"
      : "border-[#9ED0FF]/25 bg-[#9ED0FF]/8";

  return (
    <div className={`space-y-1.5 rounded-xl border p-4 text-sm ${tone}`}>
      <p className="font-semibold">{t(`${status}.title`)}</p>
      <p className="text-[#CCE7FF]/80">{t(`${status}.body`)}</p>
      {message && (
        <blockquote className="rounded-lg bg-black/15 px-3 py-2 italic">
          « {message} »
        </blockquote>
      )}
      {status !== "pending" && (
        <Link
          href={`/orgs/${org._id}/edit`}
          className="inline-block font-medium text-primary hover:underline"
        >
          {t(`${status}.cta`)}
        </Link>
      )}
    </div>
  );
}
