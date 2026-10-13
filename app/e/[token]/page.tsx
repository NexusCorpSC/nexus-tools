import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { openEventLink } from "@/lib/org-events";
import { EventDetail } from "@/app/orgs/[orgId]/events/detail";
import { readerIdFromSession } from "@/app/orgs/[orgId]/events/shell";

type Params = { params: Promise<{ token: string }> };

/**
 * Le lien de partage d'un évènement. Connecté, on garde l'évènement et on
 * va sur sa fiche ; sans compte, la fiche se lit ici, sans le nom des inscrits.
 * Un lien désactivé le dit.
 */

export const metadata: Metadata = {
  // Une adresse qui circule sur Discord n'a rien à faire dans un index.
  robots: { index: false, follow: false },
};

const frame =
  "m-2 mx-auto max-w-5xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm";

export default async function SharedEventPage({ params }: Params) {
  const { token } = await params;
  const readerId = await readerIdFromSession();
  const outcome = await openEventLink(token, readerId);

  if ("redirect" in outcome) redirect(outcome.redirect);

  if ("refusal" in outcome) {
    const t = await getTranslations("OrgEvents");
    return (
      <div className={frame}>
        <div className="space-y-3 py-6">
          <h1 className="text-2xl font-semibold">
            {outcome.refusal === "revoked"
              ? t("linkRevokedTitle")
              : t("linkUnknownTitle")}
          </h1>
          <p className="max-w-prose text-white/75">{t("linkDeadHint")}</p>
          <Button variant="outline" asChild>
            <Link href="/events">{t("communityEvents")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={frame}>
      <EventDetail
        initial={outcome.view}
        signedIn={false}
        orgName={outcome.orgName}
        sharedByName={outcome.sharedByName}
        signInHref={`/login?callbackUrl=${encodeURIComponent(`/e/${token}`)}`}
      />
    </div>
  );
}
