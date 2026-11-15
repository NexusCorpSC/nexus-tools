"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAX_OFFER_MESSAGE,
  quantityLabel,
  type RequestDetail,
  type SupplyLot,
} from "@/types/requests";
import { FIELD, GHOST_BUTTON, REQ_BUTTON, REQ_BUTTON_SM } from "@/app/demandes/ui";

/** « J'en ai » : ouvre le dialogue d'offre sur une demande. */
export function OfferButton({
  requestId,
  small,
}: {
  requestId: string;
  small?: boolean;
}) {
  const t = useTranslations("Requests");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={small ? REQ_BUTTON_SM : REQ_BUTTON}
        onClick={() => setOpen(true)}
      >
        {t("iHaveIt")}
      </button>
      {open && <OfferDialog requestId={requestId} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Les champs d'une offre, à partir d'un lot ou saisis à la main. */
function fromLot(lot: SupplyLot | null, remaining: number) {
  // Sans lot, on propose par défaut ce qui reste à trouver, comme l'app.
  if (!lot) return { quantity: remaining > 0 ? String(remaining) : "", quality: "" };
  const quantity = remaining > 0 ? Math.min(lot.inRequestUnit, remaining) : lot.inRequestUnit;
  return {
    quantity: String(Math.round(quantity * 100) / 100),
    quality: lot.quality !== undefined ? String(lot.quality) : "",
  };
}

function OfferDialog({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const t = useTranslations("Requests");
  const format = useFormatter();
  const router = useRouter();
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [lotId, setLotId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [quality, setQuality] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // Une lecture à l'ouverture : la demande et mes lots qui portent ce nom.
  useEffect(() => {
    let gone = false;
    void fetch(`/api/requests/${encodeURIComponent(requestId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as RequestDetail;
        if (gone) return;
        setDetail(body);
        const first = body.lots.find((lot) => !lot.belowMinimum) ?? null;
        setLotId(first?.id ?? null);
        const fields = fromLot(first, body.request.remaining);
        setQuantity(fields.quantity);
        setQuality(fields.quality);
        setPrice(body.request.unitPrice !== undefined ? String(body.request.unitPrice) : "");
      })
      .catch(() => !gone && setLoadFailed(true));
    return () => {
      gone = true;
    };
  }, [requestId]);

  const request = detail?.request;
  const material = request ? request.kind === "resource" || request.kind === "other" : false;

  function pickLot(lot: SupplyLot | null) {
    setLotId(lot?.id ?? null);
    if (!request) return;
    const fields = fromLot(lot, request.remaining);
    if (lot) {
      setQuantity(fields.quantity);
      setQuality(fields.quality);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!request) return;
    setError(null);
    const quantityValue = Number(quantity.replace(",", "."));
    if (!quantity.trim() || !Number.isFinite(quantityValue) || quantityValue <= 0) {
      return setError(t("errors.quantity"));
    }
    setSending(true);
    try {
      const response = await fetch(
        `/api/requests/${encodeURIComponent(request.id)}/offers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quantity: quantityValue,
            quality: quality.trim() === "" ? null : Number(quality),
            unitPrice: price.trim() === "" ? null : Number(price.replace(/\s/g, "")),
            inventoryItemId: lotId,
            message: message.trim() || null,
          }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          t.has(`errors.${body.error}`) ? t(`errors.${body.error}`) : t("errors.generic"),
        );
        return;
      }
      onClose();
      router.push(`/demandes/${request.id}#offre-${body.id}`);
      router.refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {request
              ? t("offer.title", { name: request.userName, item: request.name })
              : t("iHaveIt")}
          </DialogTitle>
          {request && (
            <DialogDescription>
              {[
                quantityLabel(request.quantity, request.unit),
                request.minQuality !== undefined ? `Q ≥ ${request.minQuality}` : null,
                request.unitPrice !== undefined
                  ? t("offer.priceEach", {
                      price: format.number(request.unitPrice),
                      unit: request.unit ?? t("unitShort"),
                    })
                  : t("negotiable"),
                request.location ? t("pickupAt", { place: request.location.name }) : null,
                t("remainingPlain", {
                  quantity: quantityLabel(request.remaining, request.unit),
                }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </DialogDescription>
          )}
        </DialogHeader>

        {loadFailed ? (
          <p className="text-sm text-red-300">{t("errors.load")}</p>
        ) : !request ? (
          <p className="text-sm text-[#A9CDEE]">{t("loading")}</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-xs font-medium text-[#A9CDEE]">
                {t("offer.fromInventory")}
              </legend>
              {detail.lots.map((lot) => (
                <LotChoice
                  key={lot.id}
                  checked={lotId === lot.id}
                  onChange={() => pickLot(lot)}
                  title={`${lot.name}${lot.quality !== undefined ? ` · Q ${lot.quality}` : ""}`}
                  detail={[
                    lot.belowMinimum ? t("offer.belowMinimum") : null,
                    lot.locationName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  amount={quantityLabel(lot.inRequestUnit, request.unit)}
                />
              ))}
              <LotChoice
                checked={lotId === null}
                onChange={() => pickLot(null)}
                title={t("offer.noLot")}
                detail={t("offer.noLotHint")}
              />
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5 text-xs font-medium text-[#A9CDEE]">
                {t("offer.quantity")}
                <span className="relative block">
                  <input
                    id="offer-quantity"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className={cn(FIELD, "font-mono", request.unit && "pr-12")}
                    required
                  />
                  {request.unit && (
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#7E9FB7]">
                      {request.unit}
                    </span>
                  )}
                </span>
              </label>
              {material && (
                <label className="space-y-1.5 text-xs font-medium text-[#A9CDEE]">
                  {t("offer.quality")}
                  <input
                    id="offer-quality"
                    inputMode="numeric"
                    value={quality}
                    onChange={(event) => setQuality(event.target.value.replace(/\D/g, ""))}
                    className={cn(FIELD, "font-mono")}
                    placeholder="0-1000"
                  />
                </label>
              )}
              <label className="space-y-1.5 text-xs font-medium text-[#A9CDEE]">
                {request.unit
                  ? t("fields.pricePer", { unit: request.unit })
                  : t("fields.pricePerUnit")}
                <span className="relative block">
                  <input
                    id="offer-price"
                    inputMode="numeric"
                    value={price}
                    onChange={(event) => setPrice(event.target.value.replace(/[^\d\s]/g, ""))}
                    className={cn(FIELD, "pr-14 font-mono")}
                    placeholder={t("negotiable")}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#7E9FB7]">
                    aUEC
                  </span>
                </span>
              </label>
            </div>

            <label className="block space-y-1.5 text-xs font-medium text-[#A9CDEE]">
              {t("offer.message")}
              <Textarea
                id="offer-message"
                value={message}
                maxLength={MAX_OFFER_MESSAGE}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={t("offer.messagePlaceholder")}
                className="min-h-20"
              />
            </label>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#9ED0FF]/15 pt-4">
              <button type="button" className={GHOST_BUTTON} onClick={onClose}>
                {t("cancel")}
              </button>
              <button type="submit" className={REQ_BUTTON} disabled={sending}>
                {sending ? t("sending") : t("offer.send")}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LotChoice({
  checked,
  onChange,
  title,
  detail,
  amount,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  detail?: string;
  amount?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border bg-[#0E2C45] px-3 py-2",
        checked ? "border-[#7FF0D0]" : "border-[#9ED0FF]/28 hover:border-[#9ED0FF]/50",
      )}
    >
      <input
        type="radio"
        name="offer-lot"
        checked={checked}
        onChange={onChange}
        className="size-4 accent-[#7FF0D0]"
      />
      <span className="min-w-0">
        <b className="block text-[13px] font-semibold text-[#E3F1FF]">{title}</b>
        {detail && <small className="block text-xs text-[#A9CDEE]">{detail}</small>}
      </span>
      {amount && (
        <span className="ml-auto shrink-0 font-mono text-[12.5px] text-[#E3F1FF]">
          {amount}
        </span>
      )}
    </label>
  );
}
