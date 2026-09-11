import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { formatCraftingTime } from "@/lib/crafting-time";
import { isNumber, type ItemDetails, type ResourceMarket } from "@/types/items";
import { ItemAdminMenu } from "../components";
import { ItemCompareButton } from "../compare-button";
import {
  BlueprintCard,
  CommonSections,
  EmptySection,
  ItemBreadcrumb,
  KindDataNotice,
  SectionTitle,
  KIND_ACCENT,
} from "../sections";

const ACCENT = KIND_ACCENT.resource;

const SIDE_STYLE: Record<string, { color: string; background: string }> = {
  buy: { color: "#6FD08C", background: "rgba(111,208,140,0.14)" },
  sell: { color: "#E89347", background: "rgba(232,147,71,0.16)" },
  grey: {
    color: "rgba(158,208,255,0.85)",
    background: "rgba(158,208,255,0.12)",
  },
};

const FREQUENCY_STYLE: Record<string, { color: string; background: string }> = {
  common: { color: "var(--color-nexus-fg)", background: "transparent" },
  occasional: { color: "var(--color-nexus-fg)", background: "transparent" },
  risky: { color: "#E89347", background: "rgba(232,147,71,0.16)" },
};

function mean(values: number[]): number | undefined {
  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : undefined;
}

/** The reference price of a resource is what buyers pay for it. */
function referencePrices(markets: ResourceMarket[]) {
  const buying = markets.filter((market) => market.side === "buy");
  const pool = buying.length > 0 ? buying : markets;

  return {
    average: mean(pool.map((market) => market.price)),
    best: pool.length > 0 ? Math.max(...pool.map((m) => m.price)) : undefined,
  };
}

/** A plain area chart of the last recorded prices, oldest point first. */
function PriceHistory({ history }: { history: number[] }) {
  const min = Math.min(...history);
  const max = Math.max(...history);
  const span = max - min || 1;
  const step = 800 / (history.length - 1);

  const points = history.map((price, index) => ({
    x: index * step,
    y: 150 - ((price - min) / span) * 120,
  }));
  const line = points
    .map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" L ");

  return (
    <svg
      viewBox="0 0 800 170"
      preserveAspectRatio="none"
      className="block h-[170px] w-full"
    >
      <g stroke="rgba(158,208,255,0.1)" strokeWidth="1">
        <path d="M0 30 H800 M0 70 H800 M0 110 H800 M0 150 H800" />
      </g>
      <path
        d={`M ${line} L 800 170 L 0 170 Z`}
        fill="rgba(217,164,65,0.12)"
        stroke="none"
      />
      <path
        d={`M ${line}`}
        fill="none"
        stroke={ACCENT}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={points[points.length - 1].x}
        cy={points[points.length - 1].y}
        r="4"
        fill={ACCENT}
      />
    </svg>
  );
}

export async function ResourceView({
  item,
  canEdit,
}: {
  item: ItemDetails;
  canEdit: boolean;
}) {
  const t = await getTranslations("Items");
  const tr = await getTranslations("Items.Resource");
  const format = await getFormatter();

  const resource = item.resource;
  const markets = resource?.markets ?? [];
  const { average, best } = referencePrices(markets);

  const history = resource?.priceHistory ?? [];
  const trend =
    history.length > 1 && history[history.length - 2] !== 0
      ? ((history[history.length - 1] - history[history.length - 2]) /
          history[history.length - 2]) *
        100
      : undefined;

  const figures = [
    best !== undefined && {
      label: tr("bestBuy"),
      value: format.number(best, { maximumFractionDigits: 2 }),
    },
    isNumber(resource?.unitVolumeScu) && {
      label: tr("unitVolume"),
      value: `${format.number(resource.unitVolumeScu!, { maximumFractionDigits: 3 })} SCU`,
    },
    isNumber(resource?.purityMin) || isNumber(resource?.purityMax)
      ? {
          label: tr("purity"),
          value: [resource?.purityMin, resource?.purityMax]
            .filter(isNumber)
            .map((value) => `${format.number(value)} %`)
            .join(" – "),
        }
      : undefined,
  ].filter((figure): figure is { label: string; value: string } =>
    Boolean(figure),
  );

  return (
    <div className="m-2 mx-auto max-w-4xl overflow-hidden rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 shadow-xl shadow-black/20 backdrop-blur-sm">
      {/* Header */}
      <div
        className="px-6 pb-5 pt-5"
        style={{ borderBottom: `2px solid ${ACCENT}` }}
      >
        <div className="flex items-start justify-between gap-2">
          <ItemBreadcrumb name={item.name} />
          <div className="flex shrink-0 items-center gap-1.5">
            <ItemCompareButton item={item} accent={ACCENT} />
            {canEdit && <ItemAdminMenu slug={item.slug} />}
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p
              className="font-mono text-[11px] tracking-[0.16em]"
              style={{ color: ACCENT }}
            >
              {[resource?.form, item.category, item.subcategory]
                .filter(Boolean)
                .join(" · ")
                .toUpperCase()}
            </p>
            <h1 className="mt-1.5 text-[34px] font-bold tracking-tight text-nexus-primary">
              {item.name}
            </h1>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span
                className="inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ backgroundColor: ACCENT, color: "#16110A" }}
              >
                {t(`kinds.${item.kind}`)}
              </span>
              {resource?.form && (
                <span className="inline-flex items-center rounded-sm border border-[#9ED0FF]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-nexus">
                  {resource.form}
                </span>
              )}
              {resource?.volatile && (
                <span className="inline-flex items-center rounded-sm border border-[#9ED0FF]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-nexus">
                  {tr("volatile")}
                </span>
              )}
            </div>
          </div>

          {average !== undefined ? (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-nexus/60">
                {tr("averagePrice")}
              </p>
              <p className="mt-0.5 font-mono text-[32px] font-bold leading-none text-[#EAF5FF]">
                {format.number(average, { maximumFractionDigits: 2 })}
              </p>
              <p className="mt-1.5 flex items-center justify-end gap-1.5">
                {trend !== undefined && (
                  <span
                    className="font-mono text-[13px] font-semibold"
                    style={{ color: trend >= 0 ? "#6FD08C" : "#E8472B" }}
                  >
                    {trend >= 0 ? "▲" : "▼"}{" "}
                    {format.number(Math.abs(trend), {
                      maximumFractionDigits: 1,
                    })}{" "}
                    %
                  </span>
                )}
                <span className="text-xs text-nexus/60">{tr("perUnit")}</span>
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {figures.length > 0 && (
        <div
          className="grid border-b border-[#9ED0FF]/12 bg-[#092F49]/30"
          style={{
            gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))`,
          }}
        >
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="border-r border-[#9ED0FF]/12 px-6 py-3.5 last:border-r-0"
            >
              <p className="text-[11px] uppercase tracking-wide text-nexus/60">
                {figure.label}
              </p>
              <p className="mt-0.5 font-mono text-xl font-semibold text-[#EAF5FF]">
                {figure.value}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-7 p-6">
        {item.description && (
          <p className="max-w-[68ch] whitespace-pre-line leading-relaxed text-nexus">
            {item.description}
          </p>
        )}

        {resource ? (
          <>
            <div>
              <SectionTitle
                aside={
                  markets.length > 0
                    ? [
                        tr("marketsCount", { count: markets.length }),
                        resource.pricesUpdatedAt
                          ? tr("updated", {
                              when: format.relativeTime(
                                new Date(resource.pricesUpdatedAt),
                              ),
                            })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : undefined
                }
              >
                {tr("markets")}
              </SectionTitle>
              {markets.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-[#9ED0FF]/15 bg-[#092F49]/35">
                  <div className="grid grid-cols-[2.1fr_1fr_1.1fr_0.9fr] bg-white/[0.04] px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-nexus/60">
                    <span>{tr("counter")}</span>
                    <span>{tr("side")}</span>
                    <span className="text-right">{tr("unitPrice")}</span>
                    <span className="text-right">{tr("stock")}</span>
                  </div>
                  {markets.map((market, index) => (
                    <div
                      key={`${market.location}-${index}`}
                      className="grid grid-cols-[2.1fr_1fr_1.1fr_0.9fr] items-center border-t border-[#9ED0FF]/[0.09] px-3.5 py-2.5 text-[13px] odd:bg-white/[0.015]"
                      style={
                        market.price === best && market.side === "buy"
                          ? { boxShadow: `inset 3px 0 0 0 ${ACCENT}` }
                          : undefined
                      }
                    >
                      <span className="font-semibold text-nexus-primary">
                        {market.location}
                      </span>
                      <span>
                        <span
                          className="inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={SIDE_STYLE[market.side]}
                        >
                          {tr(`sides.${market.side}`)}
                        </span>
                      </span>
                      <span className="text-right font-mono text-[#EAF5FF]">
                        {format.number(market.price, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-right font-mono text-nexus/80">
                        {isNumber(market.stock)
                          ? format.number(market.stock)
                          : "∞"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySection
                  label={tr("marketsEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                />
              )}
            </div>

            <div>
              <SectionTitle>
                {tr("history", { count: history.length })}
              </SectionTitle>
              {history.length > 1 ? (
                <div className="rounded-lg border border-[#9ED0FF]/15 bg-white/[0.03] px-4 pb-2.5 pt-4">
                  <PriceHistory history={history} />
                  <div className="mt-2 flex justify-between text-[11px] text-nexus/55">
                    <span className="font-mono">
                      {format.number(Math.min(...history), {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {tr("min")}
                    </span>
                    <span>{tr("historyHint")}</span>
                    <span className="font-mono">
                      {format.number(Math.max(...history), {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {tr("max")}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptySection
                  label={tr("historyEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                />
              )}
            </div>

            <div>
              <SectionTitle>{tr("refining")}</SectionTitle>
              {resource.refining ? (
                <div className="rounded-lg border border-[#9ED0FF]/15 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex-1 text-center">
                      <p className="font-mono text-[22px] font-bold text-[#EAF5FF]">
                        100
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-nexus/60">
                        {tr("rawUnits")}
                      </p>
                    </div>
                    <span aria-hidden className="text-nexus/45">
                      →
                    </span>
                    <div className="flex-[1.4] text-center">
                      {isNumber(resource.refining.yield) && (
                        <div className="h-2 overflow-hidden rounded-full bg-[#9ED0FF]/12">
                          <div
                            className="h-full"
                            style={{
                              width: `${Math.min(100, resource.refining.yield!)}%`,
                              backgroundColor: ACCENT,
                            }}
                          />
                        </div>
                      )}
                      <p className="mt-2 font-mono text-[15px] font-semibold text-[#EAF5FF]">
                        {isNumber(resource.refining.yield)
                          ? tr("yield", { yield: resource.refining.yield })
                          : tr("yieldUnknown")}
                      </p>
                      {resource.refining.process && (
                        <p className="mt-0.5 text-[11px] text-nexus/60">
                          {resource.refining.process}
                        </p>
                      )}
                    </div>
                    <span aria-hidden className="text-nexus/45">
                      →
                    </span>
                    <div className="flex-1 text-center">
                      <p
                        className="font-mono text-[22px] font-bold"
                        style={{ color: ACCENT }}
                      >
                        {isNumber(resource.refining.yield)
                          ? format.number(resource.refining.yield)
                          : "—"}
                      </p>
                      <p className="mt-0.5 text-[11px] uppercase tracking-wide text-nexus/60">
                        {tr("refinedUnits")}
                      </p>
                      {resource.refining.outputName && (
                        <p className="mt-0.5 text-[11px] text-nexus/55">
                          {resource.refining.outputName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-7 border-t border-[#9ED0FF]/12 pt-3.5">
                    {isNumber(resource.refining.durationSeconds) && (
                      <div>
                        <span className="text-[11px] uppercase tracking-wide text-nexus/60">
                          {tr("duration")}
                        </span>
                        <p className="mt-0.5 font-mono font-semibold text-nexus-primary">
                          {formatCraftingTime(
                            resource.refining.durationSeconds,
                          )}
                        </p>
                      </div>
                    )}
                    {isNumber(resource.refining.cost) && (
                      <div>
                        <span className="text-[11px] uppercase tracking-wide text-nexus/60">
                          {tr("cost")}
                        </span>
                        <p className="mt-0.5 font-mono font-semibold text-nexus-primary">
                          {format.number(resource.refining.cost!)} aUEC
                        </p>
                      </div>
                    )}
                    <Link
                      href="/industry/refine"
                      className="ml-auto inline-flex h-8 items-center rounded-md border border-[#9ED0FF]/30 px-3 text-[13px] font-medium text-nexus hover:bg-white/5"
                    >
                      {tr("openRefining")}
                    </Link>
                  </div>
                </div>
              ) : (
                <EmptySection
                  label={tr("refiningEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                />
              )}
            </div>

            <div>
              <SectionTitle>{tr("extraction")}</SectionTitle>
              {resource.extraction && resource.extraction.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {resource.extraction.map((site, index) => (
                    <div
                      key={`${site.location}-${index}`}
                      className="flex items-center gap-3 rounded-lg border border-[#9ED0FF]/15 bg-white/[0.03] px-3.5 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-nexus-primary">
                          {site.location}
                        </p>
                        {site.method && (
                          <p className="truncate text-xs text-nexus/65">
                            {site.method}
                          </p>
                        )}
                      </div>
                      {site.frequency && (
                        <span
                          className="shrink-0 rounded-sm border border-[#9ED0FF]/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                          style={FREQUENCY_STYLE[site.frequency]}
                        >
                          {tr(`frequencies.${site.frequency}`)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySection
                  label={tr("extractionEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                />
              )}
            </div>

            <div>
              <SectionTitle
                aside={
                  item.consumedBy.length > 0
                    ? tr("usedInCount", { count: item.consumedBy.length })
                    : undefined
                }
              >
                {tr("usedIn")}
              </SectionTitle>
              {item.consumedBy.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {item.consumedBy.map((blueprint) => (
                    <BlueprintCard
                      key={blueprint.slug}
                      blueprint={blueprint}
                      quantityLabel={
                        blueprint.quantity
                          ? t("quantityUnits", { count: blueprint.quantity })
                          : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[#9ED0FF]/25 px-4 py-3 text-sm text-nexus/70">
                  {tr("usedInEmpty")}
                </div>
              )}
            </div>

            {(resource.transportNote ||
              resource.volatile ||
              isNumber(resource.unitVolumeScu)) && (
              <div>
                <SectionTitle>{tr("transport")}</SectionTitle>
                <div className="flex flex-wrap items-center gap-3.5 rounded-lg border border-[#E89347]/35 bg-white/[0.03] p-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#E89347]/15">
                    <ExclamationTriangleIcon className="size-5 text-[#E89347]" />
                  </div>
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-nexus">
                    {resource.transportNote ??
                      (resource.volatile
                        ? tr("volatileNote")
                        : tr("transportNoteFallback"))}
                  </p>
                  <Link
                    href="/industry/cargo"
                    className="inline-flex h-8 items-center rounded-md border border-[#9ED0FF]/30 px-3 text-[13px] font-medium text-nexus hover:bg-white/5"
                  >
                    {tr("openCargo")}
                  </Link>
                </div>
              </div>
            )}
          </>
        ) : (
          <KindDataNotice kind="resource" slug={item.slug} canEdit={canEdit} />
        )}

        <CommonSections item={item} canEdit={canEdit} />
      </div>
    </div>
  );
}
