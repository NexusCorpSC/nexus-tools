import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { quantityLabel, type PlayerRequest } from "@/types/requests";
import {
  AudiencePill,
  audienceOf,
  Fact,
  ProgressBar,
  StatusPill,
  MUTED,
} from "@/app/demandes/ui";
import { OfferButton } from "@/app/demandes/offer-dialog";

/** Une carte du tableau : quoi, combien, quelle qualité, pour qui, et « J'en ai ». */
export async function RequestCard({ request }: { request: PlayerRequest }) {
  const t = await getTranslations("Requests");
  const format = await getFormatter();
  const now = new Date();
  const audience = audienceOf(request);
  // Sur le tableau, la raison la plus proche du lecteur : orga, ami, public.
  const pill =
    audience.find((entry) => entry.key === "org") ??
    audience.find((entry) => entry.key === "friends") ??
    audience[0];
  const expires = new Date(request.expiresAt);
  const soon = expires.getTime() - now.getTime() < 2 * 24 * 60 * 60 * 1000;

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-xl border bg-[#163F5E] p-3.5",
        request.supply
          ? "border-[#7FF0D0] shadow-[inset_0_0_0_1px_rgba(127,240,208,0.25)]"
          : "border-[#9ED0FF]/15",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h3 className="text-base leading-tight font-semibold text-[#E3F1FF]">
            <Link
              href={`/demandes/${request.id}`}
              className="hover:underline focus:outline-hidden focus-visible:underline"
            >
              {request.name}
            </Link>
          </h3>
          <span className="text-[11.5px] text-[#7E9FB7]">
            {t(`kinds.${request.kind}`)}
          </span>
        </div>
        <span className="ml-auto flex shrink-0 flex-wrap justify-end gap-1">
          {request.status !== "OPEN" && (
            <StatusPill kind="request" status={request.status}>
              {t(`requestStatus.${request.status}`)}
            </StatusPill>
          )}
          {pill && (
            <AudiencePill tone={pill.tone}>
              {pill.key === "org" ? pill.org : t(`audience.${pill.key}`)}
            </AudiencePill>
          )}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Fact label={t("fields.quantity")}>
          {quantityLabel(request.quantity, request.unit)}
        </Fact>
        <Fact label={t("fields.quality")} accent={request.minQuality !== undefined}>
          {request.minQuality !== undefined ? `≥ ${request.minQuality}` : "—"}
        </Fact>
        <Fact label={request.unit ? t("fields.pricePer", { unit: request.unit }) : t("fields.pricePerUnit")}>
          {request.unitPrice !== undefined
            ? format.number(request.unitPrice)
            : t("negotiable")}
        </Fact>
      </div>

      <ProgressBar
        request={request}
        label={t("progress", {
          received: quantityLabel(request.received, request.unit),
          quantity: quantityLabel(request.quantity, request.unit),
        })}
      />

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#A9CDEE]">
        <span>
          {t.rich("remaining", {
            quantity: quantityLabel(request.remaining, request.unit),
            b: (chunks) => <b className="font-mono text-[#E3F1FF]">{chunks}</b>,
          })}
        </span>
        {request.location && <span>{t("pickupAt", { place: request.location.name })}</span>}
        {request.status === "OPEN" && (
          <span className={soon ? "text-[#F7D68F]" : undefined}>
            {t("expires", { when: format.relativeTime(expires, now) })}
          </span>
        )}
      </div>

      {request.supply && (
        <p className="rounded-lg border border-dashed border-[#7FF0D0]/35 bg-[#7FF0D0]/8 px-2 py-1.5 text-xs text-[#7FF0D0]">
          {t.rich(request.supply.locationName ? "youHaveAt" : "youHave", {
            quantity: quantityLabel(request.supply.quantity, request.unit),
            quality:
              request.supply.quality !== undefined
                ? ` · Q ${request.supply.quality}`
                : "",
            place: request.supply.locationName ?? "",
            b: (chunks) => <b className="font-mono">{chunks}</b>,
          })}
        </p>
      )}

      {request.note && (
        <p className={cn("line-clamp-2 text-[12.5px] italic", MUTED)}>
          « {request.note} »
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-[#A9CDEE]">
          <Image
            src={request.userAvatar ?? "/avatar_empty.png"}
            alt=""
            width={22}
            height={22}
            className="size-5.5 shrink-0 rounded-full"
          />
          <b className="truncate font-semibold text-[#E3F1FF]">{request.userName}</b>
          <span className="shrink-0">
            · {format.relativeTime(new Date(request.createdAt), now)}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {request.activeOffers > 0 && (
            <span className="rounded-full border border-[#9ED0FF]/28 px-2 text-[11px] text-[#A9CDEE]">
              {t("offerCount", { count: request.activeOffers })}
            </span>
          )}
          {request.mine ? (
            <Link
              href={`/demandes/${request.id}`}
              className="text-xs font-medium text-[#CCE7FF] hover:underline"
            >
              {t("openMine")}
            </Link>
          ) : request.myOffer &&
            (request.myOffer.status === "NEW" || request.myOffer.status === "KEPT") ? (
            <Link
              href={`/demandes/${request.id}#offre-${request.myOffer.id}`}
              className="text-xs font-medium text-[#CCE7FF] hover:underline"
            >
              {t("openMyOffer")}
            </Link>
          ) : request.status === "OPEN" ? (
            <OfferButton requestId={request.id} small />
          ) : null}
        </span>
      </div>
    </article>
  );
}
