import { imageSrc, OpenOnSite, SiteLink, useView } from "../shared";

type Statistic = { value: string | number; unit?: string };

function Chips({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; href?: string }[];
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2>{title}</h2>
      <p className="chips">
        {items.map((item) => (
          <SiteLink key={item.key} href={item.href} className="chip">
            {item.label}
          </SiteLink>
        ))}
      </p>
    </section>
  );
}

/** La fiche d'un objet (`get_item`) ou d'un lieu (`get_place`). */
export function SheetView({ data }: { data: Record<string, unknown> }) {
  const { t } = useView();
  const url = typeof data.url === "string" ? data.url : undefined;
  const site = url ? new URL(url).origin : undefined;
  const image = imageSrc(data.imageUrl, url);
  const subtitle = [
    data.category,
    data.subcategory,
    data.manufacturer,
    typeof data.size === "number" ? `S${data.size}` : undefined,
    data.type,
    ...(Array.isArray(data.ancestors)
      ? (data.ancestors as string[]).map((a) => a.replace(/ \([^)]*\)$/, ""))
      : []),
  ].filter((part): part is string => typeof part === "string" && part !== "");

  const statistics = Object.entries(
    (data.statistics ?? {}) as Record<string, Statistic>,
  ).filter(
    ([, stat]) =>
      stat &&
      (typeof stat.value === "string" || typeof stat.value === "number"),
  );

  const services = Array.isArray(data.services)
    ? (data.services as unknown[])
        .map((service) =>
          typeof service === "string"
            ? service
            : String(
                (service as { type?: string; name?: string }).name ??
                  (service as { type?: string }).type ??
                  "",
              ),
        )
        .filter(Boolean)
    : [];
  const children = Array.isArray(data.children)
    ? (data.children as { slug: string; name: string }[])
    : [];
  const shops = Array.isArray(data.shops)
    ? (data.shops as { slug: string; name: string }[])
    : [];
  const plans = Array.isArray(data.plans)
    ? (data.plans as { id: string; name: string }[])
    : [];
  const missions = Array.isArray(data.missions)
    ? (data.missions as { title: string; url: string }[])
    : [];
  const placeHref = (slug: string) =>
    site ? `${site}/lieux/${slug}` : undefined;

  return (
    <article className="sheet">
      {image && <img className="hero" src={image} alt="" />}
      <h1>
        <SiteLink href={url}>{String(data.name ?? "")}</SiteLink>
      </h1>
      {subtitle.length > 0 && <p className="meta">{subtitle.join(" · ")}</p>}
      {typeof data.description === "string" && (
        <p className="desc">{data.description}</p>
      )}
      {typeof data.tip === "string" && <p className="desc">💡 {data.tip}</p>}
      {typeof data.obtention === "string" && (
        <section>
          <h2>{t("sheet.obtention")}</h2>
          <p className="desc">{data.obtention}</p>
        </section>
      )}
      {statistics.length > 0 && (
        <section>
          <h2>{t("sheet.statistics")}</h2>
          <table>
            <tbody>
              {statistics.map(([name, stat]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="num">
                    {stat.value}
                    {stat.unit ? ` ${stat.unit}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      <Chips
        title={t("sheet.services")}
        items={services.map((code) => {
          const label = t(`placeServices.${code}`);
          return {
            key: code,
            label: label.startsWith("placeServices.") ? code : label,
          };
        })}
      />
      <Chips
        title={t("sheet.children")}
        items={children.map((child) => ({
          key: child.slug,
          label: child.name,
          href: placeHref(child.slug),
        }))}
      />
      <Chips
        title={t("sheet.shops")}
        items={shops.map((shop) => ({
          key: shop.slug,
          label: shop.name,
          href: placeHref(shop.slug),
        }))}
      />
      <Chips
        title={t("sheet.plans")}
        items={plans.map((plan) => ({
          key: plan.id,
          label: plan.name,
          href: url,
        }))}
      />
      <Chips
        title={t("sheet.missions")}
        items={missions.map((mission) => ({
          key: mission.url,
          label: mission.title,
          href: mission.url,
        }))}
      />
      <OpenOnSite href={url} />
    </article>
  );
}
