"use client";

import { type FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LocationCombobox } from "@/app/inventory/components";
import { cn } from "@/lib/utils";
import type { Location } from "@/types/inventory";
import {
  MAX_OFFER_MESSAGE,
  offerActionsFor,
  quantityLabel,
  type OfferAction,
  type OfferRole,
  type PlayerRequest,
  type RequestOffer,
} from "@/types/requests";
import {
  FIELD,
  GHOST_BUTTON,
  GHOST_BUTTON_SM,
  REQ_BUTTON,
  REQ_BUTTON_SM,
  StatusPill,
} from "@/app/demandes/ui";

async function post(offerId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/requests/offers/${encodeURIComponent(offerId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, error: data.error as string | undefined };
}

/**
 * Une offre et son fil : messages, prix proposés, changements d'état, puis
 * ce que le lecteur peut y faire selon son côté. Le demandeur retient,
 * décline ou marque reçu ; le fournisseur retire ; l'un ou l'autre propose
 * un prix.
 */
export function OfferThread({
  offer,
  request,
  role,
  defaultOpen,
}: {
  offer: RequestOffer;
  request: PlayerRequest;
  role: OfferRole;
  defaultOpen: boolean;
}) {
  const t = useTranslations("Requests");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [message, setMessage] = useState("");
  const [priceOpen, setPriceOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const actions = offerActionsFor(offer.status, role);
  const active = offer.status === "NEW" || offer.status === "KEPT";

  function fail(code?: string) {
    setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.generic"));
  }

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const result = await post(offer.id, body);
      if (!result.ok) return fail(result.error);
      router.refresh();
      return true;
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    if (await run({ action: "message", body: message.trim() })) setMessage("");
  }

  async function proposePrice(event: FormEvent) {
    event.preventDefault();
    const value = Number(price.replace(/\s/g, ""));
    if (!price.trim() || !Number.isFinite(value) || value < 0) return fail("invalid");
    if (await run({ action: "price", unitPrice: value })) {
      setPrice("");
      setPriceOpen(false);
    }
  }

  const terms = [
    quantityLabel(offer.quantity, request.unit),
    offer.quality !== undefined ? `Q ${offer.quality}` : null,
    offer.unitPrice !== undefined ? `${format.number(offer.unitPrice)} aUEC` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      id={`offre-${offer.id}`}
      className={cn(
        "scroll-mt-20 overflow-hidden rounded-xl border bg-[#163F5E]",
        active ? "border-[#FFB98A]/45" : "border-[#9ED0FF]/15",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-left"
      >
        <span className="flex min-w-0 flex-[1_1_160px] items-center gap-2 text-[12.5px] text-[#A9CDEE]">
          <Image
            src={(role === "requester" ? offer.userAvatar : request.userAvatar) ?? "/avatar_empty.png"}
            alt=""
            width={22}
            height={22}
            className="size-5.5 shrink-0 rounded-full"
          />
          <b className="truncate font-semibold text-[#E3F1FF]">
            {role === "requester" ? offer.userName : t("thread.yourOffer")}
          </b>
        </span>
        <span className="font-mono text-[12.5px] text-[#E3F1FF]">{terms}</span>
        <StatusPill kind="offer" status={offer.status}>
          {offer.status === "RECEIVED" && offer.receivedQuantity !== undefined
            ? t("offerStatusReceived", {
                quantity: quantityLabel(offer.receivedQuantity, request.unit),
              })
            : t(`offerStatus.${offer.status}`)}
        </StatusPill>
      </button>

      {open && (
        <div className="space-y-3 border-t border-[#9ED0FF]/15 bg-[#0E2C45] p-3">
          {offer.locationName && (
            <p className="text-xs text-[#A9CDEE]">
              {t("thread.lotAt", { place: offer.locationName })}
            </p>
          )}
          <ol className="flex flex-col gap-2" aria-label={t("thread.label")}>
            {offer.timeline.map((entry) => {
              const mine = entry.role === role;
              const when = format.dateTime(new Date(entry.at), {
                dateStyle: "short",
                timeStyle: "short",
              });
              if (entry.kind === "status") {
                return (
                  <li key={entry.id} className="self-center font-mono text-[11.5px] text-[#7E9FB7]">
                    {t(`events.${entry.status}`, {
                      name: entry.authorName,
                      quantity:
                        entry.quantity !== undefined
                          ? quantityLabel(entry.quantity, request.unit)
                          : "",
                    })}
                    {" · "}
                    {when}
                  </li>
                );
              }
              if (entry.kind === "price") {
                return (
                  <li
                    key={entry.id}
                    className={cn(
                      "max-w-[85%] rounded-lg border border-[#FFB98A]/45 bg-[#FFB98A]/10 px-2.5 py-1.5 text-[12.5px]",
                      mine ? "self-end" : "self-start",
                    )}
                  >
                    <small className="block text-[11px] text-[#7E9FB7]">
                      {mine ? t("thread.you") : entry.authorName} · {when}
                    </small>
                    {t.rich("thread.priceProposal", {
                      price: format.number(entry.unitPrice ?? 0),
                      unit: request.unit ?? t("unitShort"),
                      b: (chunks) => <b className="font-mono text-[#FFB98A]">{chunks}</b>,
                    })}
                    {entry.body && <p className="mt-1 whitespace-pre-wrap">{entry.body}</p>}
                  </li>
                );
              }
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "max-w-[85%] rounded-lg px-2.5 py-1.5 text-[13px] text-[#C9E4FF]",
                    mine ? "self-end bg-[#CCE7FF]/14" : "self-start bg-[#163F5E]",
                  )}
                >
                  <small className="block text-[11px] text-[#7E9FB7]">
                    {mine ? t("thread.you") : entry.authorName} · {when}
                  </small>
                  <p className="whitespace-pre-wrap">{entry.body}</p>
                </li>
              );
            })}
          </ol>

          <form onSubmit={send} className="flex flex-wrap gap-2">
            <label htmlFor={`message-${offer.id}`} className="sr-only">
              {t("thread.write")}
            </label>
            <input
              id={`message-${offer.id}`}
              value={message}
              maxLength={MAX_OFFER_MESSAGE}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("thread.write")}
              className={cn(FIELD, "flex-[1_1_200px]")}
            />
            <button type="submit" className={GHOST_BUTTON} disabled={busy || !message.trim()}>
              {t("thread.send")}
            </button>
          </form>

          {actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {actions.includes("price") && (
                <button type="button" className={GHOST_BUTTON_SM} onClick={() => setPriceOpen(!priceOpen)}>
                  {t("actions.price")}
                </button>
              )}
              {actions.includes("keep") && (
                <button type="button" className={REQ_BUTTON_SM} disabled={busy} onClick={() => void run({ action: "keep" })}>
                  {t("actions.keep")}
                </button>
              )}
              {actions.includes("receive") && (
                <button type="button" className={offer.status === "KEPT" ? REQ_BUTTON_SM : GHOST_BUTTON_SM} disabled={busy} onClick={() => setReceiving(true)}>
                  {t("actions.receive")}
                </button>
              )}
              {(["decline", "withdraw"] as OfferAction[])
                .filter((action) => actions.includes(action))
                .map((action) => (
                  <button
                    key={action}
                    type="button"
                    className="text-xs font-medium text-[#A9CDEE] hover:text-red-200"
                    disabled={busy}
                    onClick={() => void run({ action })}
                  >
                    {t(`actions.${action}`)}
                  </button>
                ))}
            </div>
          )}

          {priceOpen && (
            <form onSubmit={proposePrice} className="flex flex-wrap items-center gap-2">
              <label htmlFor={`price-${offer.id}`} className="text-xs text-[#A9CDEE]">
                {request.unit ? t("fields.pricePer", { unit: request.unit }) : t("fields.pricePerUnit")}
              </label>
              <span className="relative">
                <input
                  id={`price-${offer.id}`}
                  inputMode="numeric"
                  value={price}
                  onChange={(event) => setPrice(event.target.value.replace(/[^\d\s]/g, ""))}
                  className={cn(FIELD, "w-40 pr-14 font-mono")}
                  autoFocus
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#7E9FB7]">
                  aUEC
                </span>
              </span>
              <button type="submit" className={REQ_BUTTON_SM} disabled={busy}>
                {t("actions.proposePrice")}
              </button>
            </form>
          )}

          {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
      )}

      {receiving && (
        <ReceiveDialog
          offer={offer}
          request={request}
          onClose={() => setReceiving(false)}
          onDone={() => {
            setReceiving(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** « Reçu » : combien, et le ranger dans mon inventaire (coché par défaut). */
function ReceiveDialog({
  offer,
  request,
  onClose,
  onDone,
}: {
  offer: RequestOffer;
  request: PlayerRequest;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("Requests");
  const [quantity, setQuantity] = useState(String(offer.quantity));
  const [store, setStore] = useState(true);
  const [location, setLocation] = useState<Location | null>(
    request.location ? { id: request.location.id, name: request.location.name } : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number(quantity.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return setError(t("errors.quantity"));
    if (store && !location) return setError(t("errors.location"));
    setBusy(true);
    setError(null);
    try {
      const result = await post(offer.id, {
        action: "receive",
        quantity: value,
        addToInventory: store && location ? { locationId: location.id } : null,
      });
      if (!result.ok) {
        setError(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      onDone();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("receive.title", { name: offer.userName })}</DialogTitle>
          <DialogDescription>{t("receive.subtitle")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium text-[#A9CDEE]">
            {t("receive.quantity")}
            <span className="relative block">
              <input
                id="receive-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className={cn(FIELD, "font-mono", request.unit && "pr-12")}
              />
              {request.unit && (
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#7E9FB7]">
                  {request.unit}
                </span>
              )}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-[#C9E4FF]">
            <input
              type="checkbox"
              checked={store}
              onChange={(event) => setStore(event.target.checked)}
              className="mt-0.5 size-4 accent-[#9ED0FF]"
            />
            {t("receive.store")}
          </label>
          {store && (
            <LocationCombobox
              value={location}
              onChange={setLocation}
              placeholder={t("form.pickupPlaceholder")}
              aria-label={t("receive.where")}
              inputClassName="h-9 bg-[#0E2C45]"
            />
          )}
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-[#9ED0FF]/15 pt-4">
            <button type="button" className={GHOST_BUTTON} onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="submit" className={REQ_BUTTON} disabled={busy}>
              {t("receive.confirm")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
