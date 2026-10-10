import { useState } from "react";
import {
  formatMoney,
  imageSrc,
  OpenOnSite,
  SiteLink,
  useView,
} from "../shared";

type Listing = {
  id: string;
  name: string;
  type: "OBJECT" | "SERVICE";
  price: number;
  available: number;
  category?: string;
  location?: { name: string; system?: string };
  shop: { id: string; name: string };
  imageUrl?: string;
  url: string;
  description?: string;
};

type CartShop = {
  shopId: string;
  shopName: string;
  handover?: string;
  subtotal: number;
  lines: {
    listingId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    problem?: string;
  }[];
};

/** Le bouton « Ajouter au panier » : l'outil `app_cart_add`, réservé à la vue. */
function AddToCart({ listing }: { listing: Listing }) {
  const { app, t } = useView();
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "busy" }
    | { kind: "done"; count: number }
    | { kind: "failed"; error: string }
  >({ kind: "idle" });
  if (listing.type !== "OBJECT" || listing.available < 1) return null;

  const add = async () => {
    setState({ kind: "busy" });
    try {
      const result = await app.callServerTool({
        name: "app_cart_add",
        arguments: { listingId: listing.id, quantity: 1 },
      });
      const text = result.content?.find((part) => part.type === "text");
      if (result.isError) {
        setState({
          kind: "failed",
          error: text && "text" in text ? text.text : "?",
        });
        return;
      }
      const count = Number(
        (result.structuredContent as { itemsInCart?: number })?.itemsInCart ??
          0,
      );
      setState({ kind: "done", count });
    } catch (error) {
      setState({ kind: "failed", error: (error as Error).message });
    }
  };

  if (state.kind === "done")
    return (
      <span className="ok">
        {t("marketplace.added", { count: state.count })}
      </span>
    );
  return (
    <span className="actions">
      <button type="button" onClick={add} disabled={state.kind === "busy"}>
        {state.kind === "busy"
          ? t("marketplace.adding")
          : t("marketplace.addToCart")}
      </button>
      {state.kind === "failed" && (
        <span className="warn">
          {t("marketplace.addFailed", { error: state.error })}
        </span>
      )}
    </span>
  );
}

function ListingCard({
  listing,
  showShop = true,
}: {
  listing: Listing;
  showShop?: boolean;
}) {
  const { locale, t } = useView();
  const image = imageSrc(listing.imageUrl, listing.url);
  return (
    <article className="card listing">
      {image ? (
        <img src={image} alt="" loading="lazy" />
      ) : (
        <div className="noimg" />
      )}
      <div className="body">
        <SiteLink href={listing.url} className="title">
          {listing.name}
        </SiteLink>
        <div className="price">{formatMoney(locale, listing.price)}</div>
        <div className="meta">
          {listing.available > 0 ? (
            <span>
              {t("marketplace.available", { count: listing.available })}
            </span>
          ) : (
            <span className="warn">{t("marketplace.soldOut")}</span>
          )}
          {listing.location && (
            <span>
              {t("marketplace.handover", {
                place: listing.location.system
                  ? `${listing.location.name} (${listing.location.system})`
                  : listing.location.name,
              })}
            </span>
          )}
          {showShop && (
            <span>{t("marketplace.shop", { name: listing.shop.name })}</span>
          )}
        </div>
        {listing.description && <p className="desc">{listing.description}</p>}
        <AddToCart listing={listing} />
      </div>
    </article>
  );
}

function Cart({
  shops,
  total,
  url,
}: {
  shops: CartShop[];
  total: number;
  url: string;
}) {
  const { locale, t } = useView();
  if (shops.length === 0)
    return <p className="muted">{t("marketplace.cartEmpty")}</p>;
  return (
    <section>
      <h1>{t("marketplace.cart")}</h1>
      {shops.map((shop) => (
        <div key={shop.shopId} className="card group">
          <h2>{shop.shopName}</h2>
          <p className="meta">
            {shop.handover
              ? t("marketplace.handover", { place: shop.handover })
              : t("marketplace.noHandover")}
          </p>
          <table>
            <tbody>
              {shop.lines.map((line) => (
                <tr
                  key={line.listingId}
                  className={line.problem ? "problem" : undefined}
                >
                  <td>{line.quantity} ×</td>
                  <td>
                    {line.name}
                    {line.problem && (
                      <div className="warn">{t("marketplace.problem")}</div>
                    )}
                  </td>
                  <td className="num">
                    {formatMoney(locale, line.unitPrice * line.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="num">
            {t("marketplace.subtotal", {
              amount: formatMoney(locale, shop.subtotal),
            })}
          </p>
        </div>
      ))}
      <p className="total">
        {t("marketplace.total", { amount: formatMoney(locale, total) })}
      </p>
      <OpenOnSite href={url} />
    </section>
  );
}

export function MarketplaceView({ data }: { data: Record<string, unknown> }) {
  const { t } = useView();

  // cart_view
  if (Array.isArray(data.shops) && typeof data.total === "number") {
    return (
      <Cart
        shops={data.shops as CartShop[]}
        total={data.total}
        url={String(data.url)}
      />
    );
  }
  // get_shop
  if (Array.isArray(data.listings) && typeof data.name === "string") {
    return (
      <section>
        <h1>
          <SiteLink href={String(data.url)}>{data.name}</SiteLink>
        </h1>
        {typeof data.description === "string" && (
          <p className="desc">{data.description}</p>
        )}
        <p className="meta">
          {typeof data.owner === "string" && (
            <span>{t("marketplace.owner", { name: data.owner })}</span>
          )}
          {typeof data.deliveredOrders === "number" && (
            <span>
              {t("marketplace.delivered", { count: data.deliveredOrders })}
            </span>
          )}
          {typeof data.listingCount === "number" && (
            <span>
              {t("marketplace.results", { count: data.listingCount })}
            </span>
          )}
        </p>
        <div className="grid">
          {(data.listings as Listing[]).map((listing) => (
            <ListingCard key={listing.id} listing={listing} showShop={false} />
          ))}
        </div>
      </section>
    );
  }
  // search_listings
  if (Array.isArray(data.listings)) {
    const listings = data.listings as Listing[];
    return (
      <section>
        <p className="meta">
          {t("marketplace.results", {
            count: Number(data.total ?? listings.length),
          })}
        </p>
        {listings.length === 0 ? (
          <p className="muted">{t("common.empty")}</p>
        ) : (
          <div className="grid">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    );
  }
  // get_listing
  if (typeof data.id === "string" && data.shop) {
    return <ListingCard listing={data as unknown as Listing} />;
  }
  return <p className="muted">{t("common.empty")}</p>;
}
