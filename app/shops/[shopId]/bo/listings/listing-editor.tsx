"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PickupField } from "@/app/shopping/sell/listing-fields";
import { incrementShopItemStock } from "@/app/shopping/actions";
import type { ListingLocation } from "@/lib/shop-items";
import type { LotSummary } from "@/lib/shop-stock";
import { MUTED } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import {
  deleteListingAction,
  linkLotAction,
  searchLotsAction,
  setListingHiddenAction,
  unlinkLotAction,
  updateListingAction,
} from "./actions";

const BOX = "space-y-4 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4";

/** Le nom, la description, le prix et le lieu de remise. */
export function ListingInfoForm({
  itemId,
  name,
  description,
  price,
  location,
  linked,
}: {
  itemId: string;
  name: string;
  description: string;
  price: number;
  location?: ListingLocation;
  linked: boolean;
}) {
  const t = useTranslations("ShopBo.editor");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className={BOX}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await updateListingAction(itemId, {
            name: String(data.get("name") ?? ""),
            description: String(data.get("description") ?? ""),
            price: Number(data.get("price")),
            locationId: linked
              ? undefined
              : String(data.get("locationId") ?? ""),
          });
          if (result.error) setError(t(`errors.${result.error}`));
          else {
            setSaved(true);
            router.refresh();
          }
        });
      }}
    >
      <h2 className="font-semibold">{t("info")}</h2>
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium">
          {t("name")}
        </label>
        <Input
          id="name"
          name="name"
          defaultValue={name}
          required
          maxLength={500}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium">
          {t("description")}
        </label>
        <Textarea
          id="description"
          name="description"
          defaultValue={description}
          rows={4}
          maxLength={5000}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="price" className="block text-sm font-medium">
          {t("price")}
        </label>
        <Input
          id="price"
          name="price"
          type="number"
          min={0}
          step={1}
          defaultValue={price}
          required
          className="max-w-48"
        />
      </div>
      {linked ? (
        <p className={cn("text-sm", MUTED)}>{t("pickupFromLot")}</p>
      ) : (
        <PickupField initial={location} />
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
      {saved && <p className="text-sm text-emerald-300">{t("saved")}</p>}
      <Button type="submit" disabled={isPending}>
        {isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

/** Corriger le stock saisi à la main, avec un motif qui ira dans l'historique. */
export function ManualStockForm({ itemId }: { itemId: string }) {
  const t = useTranslations("ShopBo.editor");
  const router = useRouter();
  // Texte brut : un champ vide ou « - » en cours de saisie reste possible.
  const [value, setValue] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const change = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(change) && change !== 0;
  const step = (delta: number) =>
    setValue(String((Number.isInteger(change) ? change : 0) + delta));

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          setError(t("errors.INVALID_CHANGE"));
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await incrementShopItemStock(itemId, change, note);
          if (result.error) setError(t(`errors.${result.error}`));
          else {
            setValue("0");
            setNote("");
            router.refresh();
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex overflow-hidden rounded-md border border-[#9ED0FF]/30">
          <button
            type="button"
            aria-label={t("stockLess")}
            className="px-2 hover:bg-[#9ED0FF]/10"
            onClick={() => step(-1)}
            disabled={isPending}
          >
            <MinusIcon aria-hidden="true" className="size-4" />
          </button>
          <input
            type="number"
            step={1}
            aria-label={t("stockChange")}
            className="w-20 border-x border-[#9ED0FF]/30 bg-transparent px-2 py-2 text-center font-mono"
            value={value}
            onChange={(event) => {
              setError(null);
              setValue(event.target.value);
            }}
            disabled={isPending}
          />
          <button
            type="button"
            aria-label={t("stockMore")}
            className="px-2 hover:bg-[#9ED0FF]/10"
            onClick={() => step(1)}
            disabled={isPending}
          >
            <PlusIcon aria-hidden="true" className="size-4" />
          </button>
        </span>
        <Input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("stockNote")}
          aria-label={t("stockNote")}
          maxLength={200}
          className="min-w-48 flex-1"
          disabled={isPending}
        />
        <Button type="submit" variant="outline" disabled={isPending || !valid}>
          {change < 0 ? t("stockRemove") : t("stockAdd")}
        </Button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}

/** Le lot suivi par l'annonce, ou le choix d'un lot de mon inventaire. */
export function LotPanel({
  itemId,
  lot,
  linked,
}: {
  itemId: string;
  /** Le lot suivi, absent s'il a disparu de l'inventaire. */
  lot: LotSummary | null;
  linked: boolean;
}) {
  const t = useTranslations("ShopBo.editor");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lots, setLots] = useState<LotSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Les lots se cherchent après une courte pause dans la frappe.
  useEffect(() => {
    if (linked) return;
    const timer = setTimeout(() => {
      searchLotsAction(itemId, query).then(setLots, () => setLots([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [itemId, query, linked]);

  if (linked) {
    return (
      <div className="space-y-3">
        {lot ? (
          <p className="text-sm">
            {t("lotFollowed", { name: lot.name, quantity: lot.quantity })}
            {lot.location && (
              <span className={MUTED}> · {lot.location.name}</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-amber-200">{t("lotMissing")}</p>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await unlinkLotAction(itemId);
              router.refresh();
            })
          }
        >
          {t("unlink")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("lotSearch")}
        aria-label={t("lotSearch")}
      />
      {lots && lots.length === 0 && (
        <p className={cn("text-sm", MUTED)}>{t("lotNone")}</p>
      )}
      {lots && lots.length > 0 && (
        <ul className="max-h-64 divide-y divide-[#9ED0FF]/10 overflow-y-auto rounded-md border border-[#9ED0FF]/20">
          {lots.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="block truncate text-[#CCE7FF]">
                  {entry.name}
                </span>
                <span className={cn("text-xs", MUTED)}>
                  {t("lotLine", {
                    quantity: entry.quantity,
                    location: entry.location?.name ?? "–",
                  })}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await linkLotAction(itemId, entry.id);
                    if (result.error) setError(t(`errors.${result.error}`));
                    else router.refresh();
                  });
                }}
              >
                {t("link")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

/** Retirer de la vente, remettre en vente, ou supprimer l'annonce. */
export function VisibilityControls({
  itemId,
  hidden,
}: {
  itemId: string;
  hidden: boolean;
}) {
  const t = useTranslations("ShopBo.editor");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setListingHiddenAction(itemId, !hidden);
              router.refresh();
            })
          }
        >
          {hidden ? t("show") : t("hide")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            setError(null);
            startTransition(async () => {
              // Sans erreur, l'action renvoie au tableau des annonces.
              const result = await deleteListingAction(itemId);
              if (result?.error) {
                setError(t(`errors.${result.error}`));
                setConfirming(false);
              }
            });
          }}
        >
          {confirming ? t("deleteConfirm") : t("delete")}
        </Button>
      </div>
      <p className={cn("text-xs", MUTED)}>{t("visibilityHelp")}</p>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
