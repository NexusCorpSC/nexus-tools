"use client";

import { FormEvent, MouseEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  BuildingStorefrontIcon,
  CheckCircleIcon,
  MapPinIcon,
  TagIcon,
} from "@heroicons/react/24/outline";
import type {
  InventoryItemWithLocation,
  LotSale,
  SellerShop,
} from "@/types/inventory";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * Mettre un lot en vente depuis l'inventaire : une annonce de la
 * marketplace qui suit le lot (`lib/lot-sales.ts`). L'app a le même bouton
 * et le même dialogue.
 */

const ICON_BUTTON =
  "size-7 rounded-md text-[#7E9FB7] hover:bg-[#0B3A5A] hover:text-[#CCE7FF]";

const FIELD =
  "h-9 w-full rounded-md border border-[#9ED0FF]/20 bg-[#0A2A42] px-3 text-sm text-[#CCE7FF]";

/** Ce que le lot peut vendre : des unités entières, hors colis en attente. */
export function sellableOf(lot: InventoryItemWithLocation): number {
  return Math.max(0, Math.floor(lot.quantity - (lot.reserved ?? 0)));
}

function visibleSales(lot: InventoryItemWithLocation): LotSale[] {
  return (lot.sales ?? []).filter((sale) => sale.onSale);
}

/** Le badge « En vente » dans la ligne d'un lot. */
export function LotSaleBadge({ lot }: { lot: InventoryItemWithLocation }) {
  const t = useTranslations("Inventory.sell");
  const count = visibleSales(lot).length;
  if (count === 0) return null;
  const label = t("badge", { count });
  return (
    <span
      className="flex items-center gap-1 text-xs text-emerald-300"
      title={label}
    >
      <TagIcon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

/** Le bouton du pied de carte, ses annonces en cours et le dialogue. */
export function SellLotButton({
  lot,
  onSold,
}: {
  lot: InventoryItemWithLocation;
  onSold: () => void;
}) {
  const t = useTranslations("Inventory.sell");
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [shops, setShops] = useState<SellerShop[] | null>(null);
  const [loading, setLoading] = useState(false);

  const sales = lot.sales ?? [];
  const onSale = visibleSales(lot).length > 0;
  const sellable = sellableOf(lot);
  const soldIn = new Set(sales.map((sale) => sale.shopId));
  const freeShops = shops?.filter((shop) => !soldIn.has(shop.id)) ?? [];

  const loadShops = async (): Promise<SellerShop[]> => {
    if (shops) return shops;
    setLoading(true);
    try {
      const res = await fetch("/api/me/shops");
      const list: SellerShop[] = res.ok ? (await res.json()).shops : [];
      setShops(list);
      return list;
    } catch {
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Le bouton décide seul : panneau des annonces, invitation à ouvrir un
  // magasin, ou directement le dialogue.
  const handleClick = async (event: MouseEvent) => {
    event.preventDefault();
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    if (sales.length > 0) {
      setPanelOpen(true);
      void loadShops();
      return;
    }
    const list = await loadShops();
    if (list.length === 0) setPanelOpen(true);
    else setDialogOpen(true);
  };

  const disabled = sales.length === 0 && sellable < 1;
  const title = disabled
    ? t("nothingToSell")
    : onSale
      ? t("onSaleTitle")
      : t("action");

  return (
    <>
      <Popover
        open={panelOpen}
        onOpenChange={(open) => {
          if (!open) setPanelOpen(false);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              ICON_BUTTON,
              "relative",
              onSale && "text-emerald-300 hover:text-emerald-200",
            )}
            title={title}
            aria-label={title}
            disabled={disabled || loading}
            onClick={handleClick}
          >
            <TagIcon className="size-3.5" />
            {onSale && (
              <span
                aria-hidden
                className="absolute top-1 right-1 size-1.5 rounded-full bg-emerald-300 ring-2 ring-[#0A2A42]"
              />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3 p-3" align="end">
          {sales.length > 0 ? (
            <SalesPanel
              sales={sales}
              canSellElsewhere={sellable >= 1 && freeShops.length > 0}
              allShopsUsed={shops !== null && freeShops.length === 0}
              onSellElsewhere={() => {
                setPanelOpen(false);
                setDialogOpen(true);
              }}
            />
          ) : (
            <NoShopPanel />
          )}
        </PopoverContent>
      </Popover>

      {dialogOpen && shops && (
        <SellLotDialog
          lot={lot}
          shops={shops}
          soldIn={soldIn}
          onClose={() => setDialogOpen(false)}
          onSold={onSold}
        />
      )}
    </>
  );
}

function SalesPanel({
  sales,
  canSellElsewhere,
  allShopsUsed,
  onSellElsewhere,
}: {
  sales: LotSale[];
  canSellElsewhere: boolean;
  allShopsUsed: boolean;
  onSellElsewhere: () => void;
}) {
  const t = useTranslations("Inventory.sell");
  const locale = useLocale();
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  return (
    <>
      <p className="text-xs font-semibold tracking-wide text-[#7E9FB7] uppercase">
        {t("panelTitle")}
      </p>
      <ul className="space-y-2">
        {sales.map((sale) => (
          <li
            key={sale.listingId}
            className="space-y-1 rounded-md border border-[#9ED0FF]/15 p-2 text-sm"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[#CCE7FF]">
                {sale.shopName}
              </span>
              <span className="shrink-0 font-mono text-[#CCE7FF] tabular-nums">
                {t("price", { price: number.format(sale.price) })}
              </span>
            </div>
            <p className="text-xs text-[#7E9FB7]">
              {t("saleStock", { stock: sale.stock, reserved: sale.reserved })}
              {sale.lotLimit !== undefined &&
                ` · ${t("saleLimit", { limit: sale.lotLimit })}`}
              {!sale.onSale && ` · ${t("saleHidden")}`}
            </p>
            <Link
              href={`/shops/${sale.shopId}/bo/listings/${sale.listingId}`}
              className="text-xs text-[#9ED0FF] hover:underline"
            >
              {t("manage")}
            </Link>
          </li>
        ))}
      </ul>
      {canSellElsewhere && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onSellElsewhere}
        >
          <TagIcon className="mr-1.5 size-4" />
          {t("sellElsewhere")}
        </Button>
      )}
      {allShopsUsed && (
        <p className="text-xs text-[#7E9FB7]">{t("allShopsUsed")}</p>
      )}
    </>
  );
}

function NoShopPanel() {
  const t = useTranslations("Inventory.sell");
  return (
    <>
      <p className="text-sm font-medium text-[#CCE7FF]">{t("noShopTitle")}</p>
      <p className="text-xs text-[#7E9FB7]">{t("noShopText")}</p>
      <Button asChild size="sm">
        <Link href="/shops/new">
          <BuildingStorefrontIcon className="mr-1.5 size-4" />
          {t("noShopOpen")}
        </Link>
      </Button>
    </>
  );
}

function SellLotDialog({
  lot,
  shops,
  soldIn,
  onClose,
  onSold,
}: {
  lot: InventoryItemWithLocation;
  shops: SellerShop[];
  soldIn: Set<string>;
  onClose: () => void;
  onSold: () => void;
}) {
  const t = useTranslations("Inventory.sell");
  const locale = useLocale();
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const sellable = sellableOf(lot);
  const unit = lot.unit?.trim();
  // Collé derrière la quantité dans les messages : « 32 SCU », « 6 ».
  const unitLabel = unit ? ` ${unit}` : "";

  const firstFree = shops.find((shop) => !soldIn.has(shop.id));
  const [shopId, setShopId] = useState(firstFree?.id ?? "");
  const [name, setName] = useState(
    lot.quality != null ? `${lot.name} Q ${lot.quality}` : lot.name,
  );
  const [price, setPrice] = useState("");
  const [capped, setCapped] = useState(false);
  const [limit, setLimit] = useState(String(Math.min(sellable, 1)));
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [listingId, setListingId] = useState<string | null>(null);

  const priceValue = Number(price);
  const limitValue = Number(limit);
  const quantity = capped
    ? Math.min(sellable, Number.isInteger(limitValue) ? limitValue : 0)
    : sellable;
  const shop = shops.find((s) => s.id === shopId);

  // L'inventaire se recharge à la fermeture : le recharger avant démonterait
  // la carte, et la confirmation avec elle.
  const close = () => {
    onClose();
    if (listingId) onSold();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) return setError(t("errors.NAME_REQUIRED"));
    if (price.trim() === "" || !Number.isInteger(priceValue) || priceValue < 0) {
      return setError(t("errors.INVALID_PRICE"));
    }
    if (capped && (!Number.isInteger(limitValue) || limitValue < 1)) {
      return setError(t("errors.INVALID_LIMIT"));
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotId: lot.id,
          shopId,
          name: name.trim(),
          price: priceValue,
          limit: capped ? limitValue : null,
          publish,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          t.has(`errors.${data.error}`)
            ? t(`errors.${data.error}`)
            : t("errors.GENERIC"),
        );
        return;
      }
      setListingId(data.listingId);
    } catch {
      setError(t("errors.GENERIC"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        {listingId ? (
          <div className="space-y-4">
            <p className="flex items-start gap-2 text-emerald-300">
              <CheckCircleIcon className="mt-0.5 size-5 shrink-0" />
              <span>
                <span className="block font-medium">
                  {publish
                    ? t("doneTitle", { shop: shop?.name ?? "" })
                    : t("doneHiddenTitle", { shop: shop?.name ?? "" })}
                </span>
                <span className="text-sm text-[#A9BFD0]">
                  {t("doneText", {
                    quantity,
                    price: number.format(priceValue),
                  })}
                </span>
              </span>
            </p>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button asChild variant="outline">
                <Link href={`/shopping/i/${listingId}`}>{t("viewListing")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/shops/${shopId}/bo/listings/${listingId}`}>
                  {t("manageListing")}
                </Link>
              </Button>
              <Button type="button" onClick={close}>
                {t("close")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-lg border border-[#9ED0FF]/15 bg-[#061B2B]/60 px-3 py-2">
              <p className="text-sm font-semibold text-[#CCE7FF]">
                {lot.name}
                {lot.quality != null && (
                  <span className="ml-2 font-mono text-xs text-[#9ED0FF]">
                    Q {lot.quality}
                  </span>
                )}
              </p>
              <p className="text-xs text-[#7E9FB7]">
                {t("source", { quantity: sellable, unit: unitLabel })}
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sell-shop" className="text-sm font-medium">
                {t("shop")}
              </label>
              {shops.length === 1 ? (
                <p id="sell-shop" className="text-sm text-[#CCE7FF]">
                  {shops[0].name}
                </p>
              ) : (
                <select
                  id="sell-shop"
                  className={FIELD}
                  value={shopId}
                  onChange={(e) => setShopId(e.target.value)}
                >
                  {shops.map((s) => (
                    <option key={s.id} value={s.id} disabled={soldIn.has(s.id)}>
                      {soldIn.has(s.id)
                        ? t("shopAlreadyUsed", { name: s.name })
                        : s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="sell-name" className="text-sm font-medium">
                {t("name")}
              </label>
              <Input
                id="sell-name"
                value={name}
                maxLength={500}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <p className="text-xs text-[#7E9FB7]">{t("nameHelp")}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="sell-price" className="text-sm font-medium">
                  {t("unitPrice")}
                </label>
                <div className="relative">
                  <Input
                    id="sell-price"
                    type="number"
                    min={0}
                    step={1}
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="pr-14 font-mono"
                    required
                    autoFocus
                  />
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs text-[#7E9FB7]">
                    aUEC
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t("pickup")}</p>
                <p className="flex min-h-9 items-center gap-1.5 text-sm text-[#A9BFD0]">
                  <MapPinIcon className="size-4 shrink-0 text-[#7E9FB7]" />
                  {lot.location
                    ? t("pickupFromLot", { location: lot.location.name })
                    : t("pickupUnknown")}
                </p>
              </div>
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">
                {t("quantity")}
              </legend>
              <label
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-2.5",
                  !capped
                    ? "border-[#9ED0FF]/60 bg-[#9ED0FF]/5"
                    : "border-[#9ED0FF]/15",
                )}
              >
                <input
                  type="radio"
                  name="sell-quantity"
                  checked={!capped}
                  onChange={() => setCapped(false)}
                  className="mt-1 accent-[#9ED0FF]"
                />
                <span>
                  <span className="block text-sm font-medium text-[#CCE7FF]">
                    {t("quantityAll")}
                  </span>
                  <span className="text-xs text-[#7E9FB7]">
                    {t("quantityAllHelp", { quantity: sellable, unit: unitLabel })}
                  </span>
                </span>
              </label>
              <label
                className={cn(
                  "flex cursor-pointer gap-2.5 rounded-lg border p-2.5",
                  capped
                    ? "border-[#9ED0FF]/60 bg-[#9ED0FF]/5"
                    : "border-[#9ED0FF]/15",
                )}
              >
                <input
                  type="radio"
                  name="sell-quantity"
                  checked={capped}
                  onChange={() => setCapped(true)}
                  className="mt-1 accent-[#9ED0FF]"
                />
                <span className="space-y-1.5">
                  <span className="block text-sm font-medium text-[#CCE7FF]">
                    {t("quantitySome")}
                  </span>
                  <span className="block text-xs text-[#7E9FB7]">
                    {t("quantitySomeHelp")}
                  </span>
                  <span className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={sellable}
                      step={1}
                      value={limit}
                      aria-label={t("quantityLimit")}
                      onChange={(e) => {
                        setCapped(true);
                        setLimit(e.target.value);
                      }}
                      className="h-8 w-24 font-mono"
                    />
                    <span className="text-xs text-[#7E9FB7]">
                      {t("quantityOf", { quantity: sellable, unit: unitLabel })}
                    </span>
                  </span>
                </span>
              </label>
            </fieldset>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={publish}
                onChange={(e) => setPublish(e.target.checked)}
                className="size-3.5 accent-[#9ED0FF]"
              />
              {t("publish")}
            </label>

            {error && <p className="text-sm text-red-300">{error}</p>}

            <DialogFooter className="items-center gap-2">
              {Number.isInteger(priceValue) && price.trim() !== "" && (
                <p className="mr-auto text-sm text-[#A9BFD0]">
                  {t.rich("total", {
                    quantity,
                    price: number.format(priceValue),
                    total: number.format(quantity * priceValue),
                    b: (chunks) => (
                      <b className="font-mono text-[#CCE7FF]">{chunks}</b>
                    ),
                  })}
                </p>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={submitting || !shopId}>
                <TagIcon className="mr-1.5 size-4" />
                {submitting ? t("submitting") : t("submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
