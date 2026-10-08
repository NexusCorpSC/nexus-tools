import type { Metadata } from "next";
import Link from "next/link";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { getFormatter, getTranslations } from "next-intl/server";
import {
  BO_LISTING_STATES,
  type BoListingState,
  countBoListings,
  getBoListings,
} from "@/lib/shop-items";
import { getLastMovementOfShop, syncLinkedListings } from "@/lib/shop-stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MUTED, Tag } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { QuickStock } from "./quick-stock";

export const metadata: Metadata = {
  title: "Annonces et stocks — Back-office",
  robots: { index: false, follow: false },
};

const CHIP =
  "inline-flex h-8 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors";
const TH = cn(
  "px-2.5 py-2 text-left text-[11px] font-semibold tracking-wider uppercase",
  MUTED,
);
const NUM = "text-right font-mono tabular-nums";

/**
 * Toutes les annonces du magasin dans un tableau : la source du stock, ce
 * qui est réservé et ce qui reste. Le stock saisi à la main se corrige ici ;
 * celui d'une annonce reliée suit son lot.
 */
export default async function BoListingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ etat?: string; q?: string }>;
}) {
  const { shopId } = await params;
  const { etat, q } = await searchParams;
  const state: BoListingState =
    BO_LISTING_STATES.find((entry) => entry === etat) ?? "active";
  const t = await getTranslations("ShopBo.listings");
  const format = await getFormatter();
  const base = `/shops/${shopId}/bo/listings`;

  await syncLinkedListings({ shopId });
  const [listings, counts, lastMovement] = await Promise.all([
    getBoListings(shopId, state, q),
    countBoListings(shopId, q),
    getLastMovementOfShop(shopId),
  ]);

  const href = (next: BoListingState) => {
    const params = new URLSearchParams();
    if (next !== "active") params.set("etat", next);
    if (q) params.set("q", q);
    const search = params.toString();
    return search ? `${base}?${search}` : base;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {BO_LISTING_STATES.map((entry) => (
            <Link
              key={entry}
              href={href(entry)}
              aria-current={entry === state ? "page" : undefined}
              className={cn(
                CHIP,
                entry === state
                  ? "border-[#CCE7FF] bg-[#CCE7FF] font-semibold text-[#062338]"
                  : "border-[#9ED0FF]/20 text-[#C9E4FF] hover:border-[#9ED0FF]/50",
              )}
            >
              {t(`states.${entry}`, { count: counts[entry] })}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action={base} className="relative min-w-[220px]">
            {state !== "active" && (
              <input type="hidden" name="etat" value={state} />
            )}
            <MagnifyingGlassIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[#9ED0FF]/60"
            />
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder={t("search")}
              aria-label={t("search")}
              className="pl-8"
            />
          </form>
          <Button asChild>
            <Link href={`/shopping/sell?shop=${shopId}`}>{t("new")}</Link>
          </Button>
        </div>
      </div>

      {listings.length === 0 ? (
        <p className={MUTED}>{t(`empty.${state}`)}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[#9ED0FF]/30">
                <th className={TH}>{t("columns.listing")}</th>
                <th className={TH}>{t("columns.source")}</th>
                <th className={TH}>{t("columns.location")}</th>
                <th className={cn(TH, "text-right")}>{t("columns.price")}</th>
                <th className={cn(TH, "text-right")}>{t("columns.stock")}</th>
                <th className={cn(TH, "text-right")}>
                  {t("columns.reserved")}
                </th>
                <th className={cn(TH, "text-right")}>
                  {t("columns.available")}
                </th>
                <th className={TH}>
                  <span className="sr-only">{t("columns.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const service = listing.type === "SERVICE";
                const reserved = listing.reserved ?? 0;
                const available = Math.max(0, listing.stock - reserved);
                const ratio =
                  listing.stock > 0 ? (available / listing.stock) * 100 : 0;
                const details = service
                  ? t("service")
                  : [listing.category, listing.size && `S${listing.size}`]
                      .filter(Boolean)
                      .join(" · ");
                return (
                  <tr
                    key={listing.id}
                    className="border-b border-[#9ED0FF]/10 align-middle"
                  >
                    <td className="px-2.5 py-2">
                      <Link
                        href={`${base}/${listing.id}`}
                        className="font-semibold text-[#CCE7FF] hover:underline"
                      >
                        {listing.name}
                      </Link>
                      {details && (
                        <div className={cn("text-xs", MUTED)}>{details}</div>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      {service ? (
                        <Tag tone="dim">{t("sources.none")}</Tag>
                      ) : listing.inventoryItemId ? (
                        <Tag tone={listing.lotMissing ? "warn" : "info"}>
                          {listing.lotMissing
                            ? t("sources.lotMissing")
                            : t("sources.lot")}
                        </Tag>
                      ) : (
                        <Tag tone="dim">{t("sources.manual")}</Tag>
                      )}
                    </td>
                    <td className="px-2.5 py-2">
                      {listing.location?.name ?? (
                        <span className={MUTED}>–</span>
                      )}
                    </td>
                    <td className={cn("px-2.5 py-2", NUM)}>
                      {service
                        ? t("priceFrom", {
                            price: format.number(Number(listing.price) || 0),
                          })
                        : format.number(Number(listing.price) || 0)}
                    </td>
                    <td className={cn("px-2.5 py-2", NUM)}>
                      {service ? (
                        "–"
                      ) : listing.inventoryItemId ? (
                        listing.stock
                      ) : (
                        <QuickStock
                          itemId={listing.id}
                          stock={listing.stock}
                          reserved={reserved}
                        />
                      )}
                    </td>
                    <td className={cn("px-2.5 py-2", NUM)}>{reserved}</td>
                    <td className={cn("px-2.5 py-2", NUM)}>
                      {service ? (
                        "–"
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          {available}
                          <span className="inline-block h-1.5 w-16 overflow-hidden rounded bg-[#9ED0FF]/15">
                            <span
                              className={cn(
                                "block h-full",
                                available <= 1 ? "bg-amber-300" : "bg-emerald-300",
                              )}
                              style={{ width: `${ratio}%` }}
                            />
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-right whitespace-nowrap">
                      {listing.reportHidden ? (
                        <Tag tone="bad">{t("tags.moderated")}</Tag>
                      ) : listing.hidden ? (
                        <Tag tone="dim">{t("tags.hidden")}</Tag>
                      ) : (
                        !service &&
                        available <= 0 && (
                          <Tag tone="bad">{t("tags.soldOut")}</Tag>
                        )
                      )}{" "}
                      <Link
                        href={`${base}/${listing.id}`}
                        className="text-[#9ED0FF] hover:text-[#CCE7FF] hover:underline"
                      >
                        {t("edit")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {lastMovement && (
        <p className={cn("text-xs", MUTED)}>
          {t("lastMovement", {
            name: lastMovement.listingName,
            delta: `${lastMovement.delta > 0 ? "+" : ""}${lastMovement.delta}`,
            source: t(`movementSources.${lastMovement.source}`),
            when: format.relativeTime(new Date(lastMovement.at)),
          })}
          {lastMovement.byName &&
            ` · ${t("movementBy", { name: lastMovement.byName })}`}
          {lastMovement.note &&
            ` ${t("movementNote", { note: lastMovement.note })}`}
        </p>
      )}
    </>
  );
}
