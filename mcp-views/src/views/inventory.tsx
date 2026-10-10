import { formatMoney, formatNumber, OpenOnSite, useView } from "../shared";

type Lot = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  quality?: number;
  description?: string;
  location?: string;
  locationId: string;
  reserved?: number;
  onSale?: { shopName: string; price: number }[];
  sharedWithOrg: boolean;
};

/** L'inventaire (`list_inventory`), groupé par lieu. */
export function InventoryView({ data }: { data: Record<string, unknown> }) {
  const { locale, t } = useView();
  const lots = (Array.isArray(data.lots) ? data.lots : []) as Lot[];
  const groups = new Map<string, Lot[]>();
  for (const lot of lots) {
    const key = lot.location ?? t("inventory.elsewhere");
    groups.set(key, [...(groups.get(key) ?? []), lot]);
  }

  return (
    <section>
      <p className="meta">
        {t("inventory.lots", { count: Number(data.total ?? lots.length) })}
      </p>
      {lots.length === 0 && <p className="muted">{t("common.empty")}</p>}
      {[...groups].map(([location, items]) => (
        <div key={location} className="card group">
          <h2>{location}</h2>
          <table>
            <tbody>
              {items.map((lot) => (
                <tr key={lot.id}>
                  <td>
                    <strong>{lot.name}</strong>
                    {lot.description && (
                      <div className="muted">{lot.description}</div>
                    )}
                    <div className="badges">
                      {lot.quality !== undefined && (
                        <span className="badge">
                          {t("inventory.quality", { quality: lot.quality })}
                        </span>
                      )}
                      {lot.reserved ? (
                        <span className="badge warn">
                          {t("inventory.reserved", { count: lot.reserved })}
                        </span>
                      ) : null}
                      {lot.onSale?.length ? (
                        <span className="badge accent">
                          {t("inventory.onSale", {
                            shops: lot.onSale
                              .map(
                                (sale) =>
                                  `${sale.shopName} (${formatMoney(locale, sale.price)})`,
                              )
                              .join(", "),
                          })}
                        </span>
                      ) : null}
                      {lot.sharedWithOrg && (
                        <span className="badge">{t("inventory.shared")}</span>
                      )}
                    </div>
                  </td>
                  <td className="num">
                    {lot.unit
                      ? `${formatNumber(locale, lot.quantity)} ${lot.unit}`
                      : `× ${formatNumber(locale, lot.quantity)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <OpenOnSite href={typeof data.url === "string" ? data.url : undefined} />
    </section>
  );
}
