"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { placeDirectOrderAction } from "@/app/shopping/order-actions";
import { cn } from "@/lib/utils";

const RADIO =
  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors";

/** Quantité, lieu de remise et total : l'achat direct d'une annonce. */
export function BuyBox({
  listingId,
  unitPrice,
  available,
  pickupName,
}: {
  listingId: string;
  unitPrice: number;
  available: number;
  /** Le lieu de l'annonce, s'il y en a un. */
  pickupName?: string;
}) {
  const t = useTranslations("ShoppingItem");
  const format = useFormatter();
  const [quantity, setQuantity] = useState(1);
  const [proposeOther, setProposeOther] = useState(!pickupName);
  const [proposed, setProposed] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const clamp = (value: number) =>
    Math.min(available, Math.max(1, Math.round(value) || 1));
  const canSubmit = !proposeOther || proposed.trim().length > 0;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await placeDirectOrderAction({
            listingId,
            quantity,
            proposedPickup: proposeOther ? proposed : undefined,
            note,
          });
          // Sans erreur, l'action redirige vers la commande.
          if (result?.error) setError(t(`orderErrors.${result.error}`));
        });
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="buy-quantity" className="text-sm font-medium">
          {t("quantity")}
        </label>
        <div className="flex items-center overflow-hidden rounded-md border border-[#9ED0FF]/30">
          <button
            type="button"
            className="px-2 py-1.5 hover:bg-[#9ED0FF]/10 disabled:opacity-40"
            onClick={() => setQuantity((value) => clamp(value - 1))}
            disabled={quantity <= 1 || isPending}
          >
            <span className="sr-only">{t("quantityLess")}</span>
            <MinusIcon aria-hidden="true" className="size-4" />
          </button>
          <input
            id="buy-quantity"
            type="number"
            min={1}
            max={available}
            value={quantity}
            onChange={(event) => setQuantity(clamp(Number(event.target.value)))}
            className="w-14 border-x border-[#9ED0FF]/30 bg-transparent py-1.5 text-center font-mono"
            disabled={isPending}
          />
          <button
            type="button"
            className="px-2 py-1.5 hover:bg-[#9ED0FF]/10 disabled:opacity-40"
            onClick={() => setQuantity((value) => clamp(value + 1))}
            disabled={quantity >= available || isPending}
          >
            <span className="sr-only">{t("quantityMore")}</span>
            <PlusIcon aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t("pickup")}</legend>
        {pickupName && (
          <label
            className={cn(
              RADIO,
              !proposeOther
                ? "border-[#CCE7FF] bg-[#CCE7FF]/6"
                : "border-[#9ED0FF]/20",
            )}
          >
            <input
              type="radio"
              name="pickup"
              className="mt-1"
              checked={!proposeOther}
              onChange={() => setProposeOther(false)}
            />
            <span>
              <span className="block">{pickupName}</span>
              <span className="text-xs text-[#9ED0FF]/70">
                {t("pickupListing")}
              </span>
            </span>
          </label>
        )}
        <label
          className={cn(
            RADIO,
            proposeOther
              ? "border-[#CCE7FF] bg-[#CCE7FF]/6"
              : "border-[#9ED0FF]/20",
          )}
        >
          <input
            type="radio"
            name="pickup"
            className="mt-1"
            checked={proposeOther}
            onChange={() => setProposeOther(true)}
          />
          <span className="flex-1 space-y-2">
            <span className="block">{t("pickupOther")}</span>
            <span className="block text-xs text-[#9ED0FF]/70">
              {t("pickupOtherHelp")}
            </span>
            {proposeOther && (
              <Input
                value={proposed}
                onChange={(event) => setProposed(event.target.value)}
                placeholder={t("pickupOtherPlaceholder")}
                maxLength={200}
                aria-label={t("pickupOther")}
              />
            )}
          </span>
        </label>
      </fieldset>

      <div className="space-y-1">
        <label htmlFor="buy-note" className="text-sm font-medium">
          {t("orderNote")}
        </label>
        <Textarea
          id="buy-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("orderNotePlaceholder")}
          maxLength={2000}
        />
      </div>

      <div className="flex items-baseline justify-between border-t border-[#9ED0FF]/15 pt-3">
        <span>{t("total")}</span>
        <span className="font-mono text-xl font-bold text-[#CFE8FF]">
          {format.number(unitPrice * quantity)} aUEC
        </span>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <Button
        type="submit"
        className="w-full"
        disabled={isPending || !canSubmit}
      >
        {isPending ? t("ordering") : t("order")}
      </Button>
      <p className="text-xs text-[#9ED0FF]/70">{t("orderHelp")}</p>
    </form>
  );
}

/** À la place de l'encart quand l'achat direct n'est pas possible. */
export function LoginToBuy({ href }: { href: string }) {
  const t = useTranslations("ShoppingItem");
  return (
    <Button asChild className="w-full">
      <Link href={href}>{t("loginToOrder")}</Link>
    </Button>
  );
}
