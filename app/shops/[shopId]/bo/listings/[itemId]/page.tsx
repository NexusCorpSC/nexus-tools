import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import db from "@/lib/db";
import type { ShopItemDbModel } from "@/lib/shop-items";
import { getLot, getMovements, syncLinkedListings } from "@/lib/shop-stock";
import { ListLink } from "@/components/list-link";
import { MUTED, Tag } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import {
  ListingInfoForm,
  LotPanel,
  ManualStockForm,
  VisibilityControls,
} from "../listing-editor";

export const metadata: Metadata = {
  title: "Modifier l'annonce — Back-office",
  robots: { index: false, follow: false },
};

const BOX = "space-y-4 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4";

/**
 * Une annonce vue par ses vendeurs : ses informations, la source de son
 * stock (saisi à la main ou relié à un lot), l'historique des mouvements,
 * et sa présence sur la marketplace.
 */
export default async function BoListingPage({
  params,
}: {
  params: Promise<{ shopId: string; itemId: string }>;
}) {
  const { shopId, itemId } = await params;
  await syncLinkedListings({ id: itemId });
  const listing = await db
    .db()
    .collection<ShopItemDbModel>("shopItems")
    .findOne({ id: itemId, shopId });
  if (!listing) notFound();

  const t = await getTranslations("ShopBo.editor");
  const tListings = await getTranslations("ShopBo.listings");
  const format = await getFormatter();
  const [movements, lot] = await Promise.all([
    getMovements(itemId),
    listing.inventoryItemId ? getLot(listing.inventoryItemId) : null,
  ]);
  const service = listing.type === "SERVICE";
  const reserved = listing.reserved ?? 0;
  const linked = !!listing.inventoryItemId;

  return (
    <>
      <ListLink
        href={`/shops/${shopId}/bo/listings`}
        className="text-sm text-[#CCE7FF] hover:underline"
      >
        {t("back")}
      </ListLink>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-bold">{listing.name}</h2>
          <div className="flex flex-wrap gap-2">
            {listing.reportHidden ? (
              <Tag tone="bad">{tListings("tags.moderated")}</Tag>
            ) : listing.hidden ? (
              <Tag tone="dim">{tListings("tags.hidden")}</Tag>
            ) : (
              <Tag tone="ok">{t("onSale")}</Tag>
            )}
            <Tag tone="dim">
              {service ? tListings("service") : t("object")}
            </Tag>
          </div>
        </div>
        <Link
          href={`/shopping/i/${listing.id}`}
          className="text-sm text-[#CCE7FF] hover:underline"
        >
          {t("viewListing")}
        </Link>
      </div>

      {listing.reportHidden && (
        <p className="rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {t("moderated")}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <ListingInfoForm
          itemId={listing.id}
          name={listing.name}
          description={listing.description}
          price={Number(listing.price) || 0}
          location={listing.location}
          linked={linked}
        />

        <div className="space-y-5">
          {!service && (
            <section className={BOX}>
              <h2 className="font-semibold">{t("stock")}</h2>
              <dl className="grid grid-cols-3 gap-3">
                {[
                  [t("stockTotal"), listing.stock],
                  [t("stockReserved"), reserved],
                  [t("stockAvailable"), Math.max(0, listing.stock - reserved)],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-lg border border-[#9ED0FF]/15 px-3 py-2"
                  >
                    <dt className={cn("text-xs", MUTED)}>{label}</dt>
                    <dd className="font-mono text-xl font-bold text-[#CCE7FF]">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {linked ? t("sourceLot") : t("sourceManual")}
                </h3>
                <p className={cn("text-sm", MUTED)}>
                  {linked ? t("sourceLotHelp") : t("sourceManualHelp")}
                </p>
                {linked ? (
                  <LotPanel itemId={listing.id} lot={lot} linked />
                ) : (
                  <ManualStockForm itemId={listing.id} />
                )}
              </div>

              {!linked && (
                <div className="space-y-2 border-t border-[#9ED0FF]/10 pt-4">
                  <h3 className="text-sm font-semibold">{t("linkTitle")}</h3>
                  <p className={cn("text-sm", MUTED)}>{t("linkHelp")}</p>
                  <LotPanel itemId={listing.id} lot={null} linked={false} />
                </div>
              )}
            </section>
          )}

          <section className={BOX}>
            <h2 className="font-semibold">{t("visibility")}</h2>
            <VisibilityControls
              itemId={listing.id}
              hidden={!!listing.hidden}
            />
          </section>
        </div>
      </div>

      {!service && (
        <section className="space-y-3">
          <h2 className="font-semibold">{t("history")}</h2>
          {movements.length === 0 ? (
            <p className={cn("text-sm", MUTED)}>{t("historyEmpty")}</p>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr
                    className={cn(
                      "border-b border-[#9ED0FF]/30 text-left text-[11px] tracking-wider uppercase",
                      MUTED,
                    )}
                  >
                    <th className="px-2.5 py-2 font-semibold">
                      {t("historyColumns.when")}
                    </th>
                    <th className="px-2.5 py-2 font-semibold">
                      {t("historyColumns.what")}
                    </th>
                    <th className="px-2.5 py-2 text-right font-semibold">
                      {t("historyColumns.delta")}
                    </th>
                    <th className="px-2.5 py-2 text-right font-semibold">
                      {t("historyColumns.after")}
                    </th>
                    <th className="px-2.5 py-2 font-semibold">
                      {t("historyColumns.by")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr
                      key={movement.id}
                      className="border-b border-[#9ED0FF]/10"
                    >
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {format.dateTime(new Date(movement.at), {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="px-2.5 py-2">
                        {tListings(`movementSources.${movement.source}`)}
                        {movement.note && (
                          <span className={MUTED}> · {movement.note}</span>
                        )}
                        {movement.orderId && (
                          <>
                            {" · "}
                            <Link
                              href={`/shops/${shopId}/bo/orders/${movement.orderId}`}
                              className="text-[#CCE7FF] hover:underline"
                            >
                              {t("historyOrder")}
                            </Link>
                          </>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                      </td>
                      <td className="px-2.5 py-2 text-right font-mono">
                        {movement.stockAfter}
                      </td>
                      <td className="px-2.5 py-2">{movement.byName ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
