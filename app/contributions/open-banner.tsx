import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ObjectId } from "mongodb";
import { ClockIcon } from "@heroicons/react/24/outline";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { listMyOpenContributions } from "@/lib/contributions";
import { resumeHref } from "./links";

/**
 * Ce que le joueur a encore d'ouvert sur cette fiche : en attente, ou renvoyé
 * à corriger. Rien pour un visiteur, rien quand tout est traité.
 */
export async function OpenContributionsBanner({
  type,
  slug,
  className,
}: {
  type: "place" | "item";
  slug: string;
  className?: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;

  const open = await listMyOpenContributions(new ObjectId(session.user.id), {
    type,
    slug,
  });
  if (open.length === 0) return null;

  const t = await getTranslations("Contributions.Mine");

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-xl border border-amber-300/30 bg-amber-300/[0.07] px-4 py-3 text-sm",
        className,
      )}
    >
      {open.map((contribution) => (
        <p
          key={contribution.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-1"
        >
          <ClockIcon className="size-4 shrink-0 text-amber-200" />
          <span className="text-amber-50/90">
            {t(`kinds.${contribution.kind}`)}
            {" · "}
            {t(`statuses.${contribution.status}`)}
          </span>
          <Link
            href={resumeHref(contribution)}
            className="font-medium text-amber-200 underline-offset-2 hover:underline"
          >
            {contribution.status === "changesRequested"
              ? t("fix")
              : t("resume")}
          </Link>
        </p>
      ))}
    </div>
  );
}
