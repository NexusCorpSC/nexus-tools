import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { RememberListUrl } from "@/components/remember-list-url";
import {
  getClosedOrdersForShop,
  getOpenOrdersForShop,
  getShopMonthStats,
  type OrderAction,
  type OrderStatus,
  type ShopOrder,
} from "@/lib/shop-orders";
import { Button } from "@/components/ui/button";
import {
  MUTED,
  OrderStatusBadge,
  ROW_LINK,
  Tag,
} from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import { BoardAction } from "./board-action";

export const metadata: Metadata = {
  title: "Commandes — Back-office",
  description: "Gérez les commandes reçues sur votre boutique Nexus Tools.",
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 20;
/** Au-delà, une commande qui attend le magasin ressort en orange. */
const LATE_HOURS = 24;

/** L'heure du rendu, pour dire depuis quand une commande attend. */
function renderTime() {
  return Date.now();
}

/** Les colonnes du tableau, dans l'ordre du cycle. */
const COLUMNS: { key: string; statuses: OrderStatus[] }[] = [
  { key: "pending", statuses: ["PENDING"] },
  { key: "quoted", statuses: ["QUOTED"] },
  { key: "confirmed", statuses: ["CONFIRMED", "ACCEPTED"] },
  { key: "ready", statuses: ["READY"] },
];

/** Le geste offert sur la carte, quand il ne demande rien d'autre. */
const QUICK_ACTION: Partial<Record<OrderStatus, OrderAction>> = {
  CONFIRMED: "ready",
  ACCEPTED: "ready",
  READY: "deliver",
};

/**
 * Les commandes du magasin rangées par étape, avec ce qui attend le vendeur
 * depuis trop longtemps. `?type=custom` ne garde que les demandes sur
 * mesure ; `?vue=closed` liste les commandes closes.
 */
export default async function BoOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ shopId: string }>;
  searchParams: Promise<{ page?: string; type?: string; vue?: string }>;
}) {
  const { shopId } = await params;
  const query = await searchParams;
  const t = await getTranslations("ShopBo.orders");
  const tOrders = await getTranslations("Orders");
  const format = await getFormatter();
  const base = `/shops/${shopId}/bo/orders`;

  if (query.vue === "closed") {
    const page = Math.max(1, parseInt(query.page ?? "1", 10) || 1);
    const { orders, total } = await getClosedOrdersForShop(shopId, {
      offset: (page - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
    });
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    return (
      <>
        <RememberListUrl />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{t("closedTitle")}</h2>
          <Link href={base} className="text-sm text-[#CCE7FF] hover:underline">
            {t("backToBoard")}
          </Link>
        </div>
        {orders.length === 0 ? (
          <p className={MUTED}>{t("closedEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`${base}/${order.id}`}
                  className={cn(ROW_LINK, "flex items-center gap-3")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[#CCE7FF]">
                      {order.userName}
                    </span>
                    <span className={cn("block truncate text-sm", MUTED)}>
                      {order.message}
                    </span>
                  </span>
                  {order.total !== undefined && (
                    <span className="font-mono text-sm">
                      {format.number(order.total)}
                    </span>
                  )}
                  <OrderStatusBadge
                    status={order.status}
                    label={tOrders(`status.${order.status}`)}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            {page > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}?vue=closed&page=${page - 1}`}>
                  {t("prev")}
                </Link>
              </Button>
            )}
            <span className={cn("text-sm", MUTED)}>
              {t("pageInfo", { page, totalPages })}
            </span>
            {page < totalPages && (
              <Button asChild variant="outline" size="sm">
                <Link href={`${base}?vue=closed&page=${page + 1}`}>
                  {t("next")}
                </Link>
              </Button>
            )}
          </div>
        )}
      </>
    );
  }

  const custom = query.type === "custom";
  const [orders, month] = await Promise.all([
    getOpenOrdersForShop(shopId, custom ? { kind: "CUSTOM" } : {}),
    getShopMonthStats(shopId),
  ]);
  const now = renderTime();
  const waitingHours = (order: ShopOrder) =>
    Math.floor((now - new Date(order.updatedAt).getTime()) / 3_600_000);
  const toHandle = orders.filter((order) =>
    ["PENDING", "CONFIRMED", "ACCEPTED"].includes(order.status),
  ).length;
  const ready = orders.filter((order) => order.status === "READY").length;

  const kpis = [
    { label: t("kpis.toHandle"), value: format.number(toHandle) },
    { label: t("kpis.ready"), value: format.number(ready) },
    { label: t("kpis.delivered"), value: format.number(month.delivered) },
    {
      label: t("kpis.revenue"),
      value: format.number(month.revenue, { notation: "compact" }),
      mono: true,
    },
  ];

  return (
    <>
      <RememberListUrl />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-bold">
          {custom ? t("customTitle") : t("title")}
        </h2>
        <Link
          href={`${base}?vue=closed`}
          className="text-sm text-[#CCE7FF] hover:underline"
        >
          {t("closedLink")}
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-[#9ED0FF]/15 px-3 py-2.5"
          >
            <dd
              className={cn(
                "text-xl font-bold text-[#CCE7FF] tabular-nums",
                kpi.mono && "font-mono",
              )}
            >
              {kpi.value}
            </dd>
            <dt className={cn("text-xs", MUTED)}>{kpi.label}</dt>
          </div>
        ))}
      </dl>

      {orders.length === 0 ? (
        <p className={MUTED}>{custom ? t("customEmpty") : t("empty")}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="grid min-w-[760px] grid-cols-4 gap-2.5">
            {COLUMNS.map((column) => {
              const cards = orders.filter((order) =>
                column.statuses.includes(order.status),
              );
              return (
                <section
                  key={column.key}
                  aria-label={t(`columns.${column.key}`)}
                  className="flex flex-col gap-2 rounded-xl bg-[#062338]/40 p-2.5"
                >
                  <h3
                    className={cn(
                      "flex justify-between text-xs font-semibold tracking-wider uppercase",
                      MUTED,
                    )}
                  >
                    {t(`columns.${column.key}`)}
                    <span>{cards.length}</span>
                  </h3>
                  {cards.map((order) => {
                    const hours = waitingHours(order);
                    const late =
                      order.status === "PENDING" && hours >= LATE_HOURS;
                    const action = QUICK_ACTION[order.status];
                    return (
                      <div
                        key={order.id}
                        className={cn(
                          "flex flex-col gap-1 rounded-lg border bg-[#0B3A5A] px-2.5 py-2 text-xs",
                          late ? "border-amber-300/50" : "border-[#9ED0FF]/15",
                        )}
                      >
                        <Link
                          href={`${base}/${order.id}`}
                          className="text-sm font-semibold text-[#CCE7FF] hover:underline"
                        >
                          {order.userName}
                        </Link>
                        <span className="line-clamp-2">
                          {order.kind === "DIRECT"
                            ? order.message
                            : t("customSummary", { message: order.message })}
                        </span>
                        {order.status === "QUOTED" &&
                          order.total !== undefined && (
                            <span className="font-mono text-[#CFE8FF]">
                              {format.number(order.total)} aUEC
                            </span>
                          )}
                        {order.pickup && order.status !== "QUOTED" && (
                          <span className={MUTED}>{order.pickup.name}</span>
                        )}
                        {late ? (
                          <Tag tone="warn" className="w-fit">
                            {t("waiting", { hours })}
                          </Tag>
                        ) : (
                          <span className={MUTED}>
                            {format.relativeTime(new Date(order.updatedAt), now)}
                          </span>
                        )}
                        {action && (
                          <BoardAction orderId={order.id} action={action} />
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
