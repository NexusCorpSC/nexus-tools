import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getFormatter, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getRequestDetail } from "@/lib/player-requests";
import { cn } from "@/lib/utils";
import { ListLink } from "@/components/list-link";
import { ReportMenu } from "@/components/report-menu";
import { quantityLabel } from "@/types/requests";
import { OfferButton } from "@/app/demandes/offer-dialog";
import { OfferThread } from "@/app/demandes/offer-thread";
import { OwnerActions } from "@/app/demandes/owner-actions";
import {
  AudiencePill,
  audienceOf,
  Fact,
  MUTED,
  PAGE_PANEL,
  ProgressBar,
  StatusPill,
} from "@/app/demandes/ui";

export const metadata: Metadata = {
  title: "Demande",
  robots: { index: false, follow: false },
};

/**
 * Une demande et ses offres. L'auteur voit toutes les offres, chacune avec
 * son fil ; un fournisseur voit la sienne ; un autre joueur voit la demande
 * et peut répondre « J'en ai ».
 */
export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");
  const { id } = await params;
  const detail = await getRequestDetail(id, new ObjectId(session.user.id));
  if (!detail) notFound();
  const { request, offers } = detail;

  const t = await getTranslations("Requests");
  const format = await getFormatter();
  const now = new Date();
  const role = request.mine ? "requester" : "supplier";
  const active = offers.filter((offer) => offer.status === "NEW" || offer.status === "KEPT");
  const canOffer =
    !request.mine && request.status === "OPEN" && active.length === 0;
  // La première offre en cours s'ouvre ; les autres se déplient au clic.
  const firstActive = active[0]?.id ?? offers[offers.length - 1]?.id;

  return (
    <div className={PAGE_PANEL}>
      <ListLink href="/demandes" className="text-sm text-[#CCE7FF] hover:underline">
        ← {t("backToBoard")}
      </ListLink>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-[#E3F1FF]">{request.name}</h1>
            <StatusPill kind="request" status={request.status}>
              {t(`requestStatus.${request.status}`)}
            </StatusPill>
            {!request.mine && (
              <span className="ml-auto">
                <ReportMenu type="request" id={request.id} name={request.name} />
              </span>
            )}
          </div>
          <p className={cn("text-sm", MUTED)}>
            {request.itemSlug ? (
              <Link href={`/items/${request.itemSlug}`} className="text-[#CCE7FF] hover:underline">
                {t(`kinds.${request.kind}`)}
              </Link>
            ) : (
              t(`kinds.${request.kind}`)
            )}
          </p>

          <div className="grid grid-cols-3 gap-2">
            <Fact label={t("fields.requested")}>
              {quantityLabel(request.quantity, request.unit)}
            </Fact>
            <Fact label={t("fields.quality")} accent={request.minQuality !== undefined}>
              {request.minQuality !== undefined ? `≥ ${request.minQuality}` : "—"}
            </Fact>
            <Fact
              label={request.unit ? t("fields.pricePer", { unit: request.unit }) : t("fields.pricePerUnit")}
            >
              {request.unitPrice !== undefined ? format.number(request.unitPrice) : t("negotiable")}
            </Fact>
          </div>
          <ProgressBar
            request={request}
            label={t("progress", {
              received: quantityLabel(request.received, request.unit),
              quantity: quantityLabel(request.quantity, request.unit),
            })}
          />
          <p className="text-xs text-[#A9CDEE]">
            {t("receivedRemaining", {
              received: quantityLabel(request.received, request.unit),
              remaining: quantityLabel(request.remaining, request.unit),
              offers: request.activeOffers,
            })}
          </p>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#A9CDEE]">
            {audienceOf(request).map((pill, index) => (
              <AudiencePill key={index} tone={pill.tone}>
                {pill.key === "org" ? pill.org : t(`audience.${pill.key}`)}
              </AudiencePill>
            ))}
            {request.location && (
              <span>
                {t("pickupAt", { place: request.location.name })}
                {request.location.system && ` · ${request.location.system}`}
              </span>
            )}
            {request.status === "OPEN" && (
              <span className="text-[#F7D68F]">
                {t("expires", { when: format.relativeTime(new Date(request.expiresAt), now) })}
              </span>
            )}
          </div>
          {request.note && (
            <p className="rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 p-3 text-sm whitespace-pre-wrap">
              {request.note}
            </p>
          )}
          <p className="flex items-center gap-2 text-[12.5px] text-[#A9CDEE]">
            <Image
              src={request.userAvatar ?? "/avatar_empty.png"}
              alt=""
              width={22}
              height={22}
              className="size-5.5 rounded-full"
            />
            <b className="font-semibold text-[#E3F1FF]">{request.userName}</b>·{" "}
            {format.dateTime(new Date(request.createdAt), { dateStyle: "medium", timeStyle: "short" })}
          </p>
          {request.mine && <OwnerActions request={request} />}
          {request.supply && !request.mine && (
            <p className="rounded-lg border border-dashed border-[#7FF0D0]/35 bg-[#7FF0D0]/8 px-2 py-1.5 text-xs text-[#7FF0D0]">
              {t.rich(request.supply.locationName ? "youHaveAt" : "youHave", {
                quantity: quantityLabel(request.supply.quantity, request.unit),
                quality: request.supply.quality !== undefined ? ` · Q ${request.supply.quality}` : "",
                place: request.supply.locationName ?? "",
                b: (chunks) => <b className="font-mono">{chunks}</b>,
              })}
            </p>
          )}
          {canOffer && <OfferButton requestId={request.id} />}
          <p className={cn("text-xs", MUTED)}>{t("tradeInGame")}</p>
        </section>

        <section className="space-y-3" aria-label={t("offers.label")}>
          <h2 className="text-sm font-semibold tracking-wide text-[#7E9FB7] uppercase">
            {request.mine ? t("offers.title", { count: offers.length }) : t("offers.mine")}
          </h2>
          {offers.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-4 py-6 text-center text-sm text-[#A9CDEE]">
              {request.mine ? t("offers.emptyMine") : t("offers.emptyOther")}
            </p>
          ) : (
            offers.map((offer) => (
              <OfferThread
                key={offer.id}
                offer={offer}
                request={request}
                role={role}
                defaultOpen={offer.id === firstActive}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
