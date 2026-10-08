import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { MapPinIcon } from "@heroicons/react/24/outline";
import {
  availableActions,
  type OrderRole,
  type OrderStatus,
  type ShopOrder,
} from "@/lib/shop-orders";
import { MUTED, OrderStatusBadge, TEXT_BOX } from "@/app/shopping/ui";
import { OrderControls } from "@/app/shopping/order-controls";
import { cn } from "@/lib/utils";

/** La place de chaque état sur la barre d'étapes. */
const STEP_OF: Record<OrderStatus, number> = {
  PENDING: 0,
  QUOTED: 1,
  CONFIRMED: 2,
  ACCEPTED: 2,
  READY: 3,
  DELIVERED: 4,
  REFUSED: -1,
  CANCELLED: -1,
};

/**
 * Une commande vue par l'acheteur ou par le magasin : étapes, contenu, lieu
 * de remise, puis le fil des messages, devis et changements d'état.
 */
export async function OrderView({
  order,
  role,
  shop,
}: {
  order: ShopOrder;
  role: OrderRole;
  shop: { id: string; name: string } | null;
}) {
  const t = await getTranslations("Orders");
  const format = await getFormatter();

  // Une demande sur mesure passe par un devis ; un achat direct le saute.
  const steps = order.kind === "DIRECT" ? [0, 2, 3, 4] : [0, 1, 2, 3, 4];
  const current = STEP_OF[order.status];
  const closed = current < 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            {order.kind === "DIRECT" ? t("titleDirect") : t("titleCustom")}
          </h1>
          <p className={cn("text-sm", MUTED)}>
            {role === "buyer" && shop ? (
              <>
                <Link
                  href={`/shops/${shop.id}`}
                  className="text-[#CCE7FF] hover:underline"
                >
                  {shop.name}
                </Link>
                {" · "}
              </>
            ) : (
              <>{t("from", { name: order.userName })} · </>
            )}
            {format.dateTime(new Date(order.createdAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        </div>
        <OrderStatusBadge
          status={order.status}
          label={t(`status.${order.status}`)}
        />
      </div>

      <ol
        className={cn("flex gap-1.5", closed && "opacity-40")}
        aria-label={t("progress")}
      >
        {steps.map((step) => {
          const done = !closed && current >= step;
          return (
            <li
              key={step}
              className={cn(
                "flex flex-1 flex-col gap-1.5 text-xs",
                done ? "text-[#C9E4FF]" : MUTED,
              )}
              aria-current={!closed && current === step ? "step" : undefined}
            >
              <span
                className={cn(
                  "h-1 rounded-full",
                  done ? "bg-emerald-300/80" : "bg-[#9ED0FF]/20",
                )}
              />
              {t(`steps.${step}`)}
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="min-w-0 space-y-4 lg:order-1">
          <ol className="space-y-3" aria-label={t("thread")}>
            {order.timeline.map((entry) => {
              const mine = entry.role === role;
              if (entry.kind === "status") {
                return (
                  <li
                    key={entry.id}
                    className={cn("text-center text-xs", MUTED)}
                  >
                    {t(`events.${entry.status}`, {
                      name: entry.authorName || t(`roles.${entry.role}`),
                    })}
                    {" · "}
                    {format.dateTime(new Date(entry.at), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </li>
                );
              }
              return (
                <li
                  key={entry.id}
                  className={cn(
                    "max-w-[85%] space-y-1",
                    mine ? "ml-auto" : "mr-auto",
                  )}
                >
                  <p className={cn("text-xs", MUTED)}>
                    {entry.authorName || t(`roles.${entry.role}`)}
                    {" · "}
                    {format.dateTime(new Date(entry.at), {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                  <div
                    className={cn(
                      TEXT_BOX,
                      mine && "bg-[#CCE7FF]/8",
                      entry.kind === "quote" && "border-sky-300/40",
                    )}
                  >
                    {entry.kind === "quote" && entry.quote !== undefined && (
                      <p className="mb-1 font-mono font-semibold text-sky-200">
                        {t("quoteOf", {
                          amount: format.number(entry.quote),
                        })}
                      </p>
                    )}
                    {entry.body}
                  </div>
                </li>
              );
            })}
          </ol>

          <OrderControls
            orderId={order.id}
            role={role}
            actions={availableActions(order, role)}
            kind={order.kind}
          />
        </div>

        <aside className="space-y-3 lg:order-2">
          {order.lines.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 p-4 text-sm">
              <h2 className="font-semibold">{t("contents")}</h2>
              <ul className="space-y-1">
                {order.lines.map((line) => (
                  <li
                    key={line.listingId}
                    className="flex justify-between gap-2"
                  >
                    <Link
                      href={`/shopping/i/${line.listingId}`}
                      className="min-w-0 truncate text-[#CCE7FF] hover:underline"
                    >
                      {line.quantity} × {line.name}
                    </Link>
                    <span className="shrink-0 font-mono">
                      {format.number(line.unitPrice * line.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {order.total !== undefined && (
            <div className="flex items-baseline justify-between rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 p-4 text-sm">
              <span className="font-semibold">{t("total")}</span>
              <span className="font-mono text-lg font-bold text-[#CFE8FF]">
                {format.number(order.total)} aUEC
              </span>
            </div>
          )}
          {order.pickup && (
            <div className="space-y-1 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 p-4 text-sm">
              <h2 className="font-semibold">{t("pickup")}</h2>
              <p className="flex items-center gap-1">
                <MapPinIcon aria-hidden="true" className="size-4 shrink-0" />
                {order.pickup.name}
                {order.pickup.system && (
                  <span className={MUTED}>· {order.pickup.system}</span>
                )}
              </p>
              {order.pickup.proposed && (
                <p className={cn("text-xs", MUTED)}>{t("pickupProposed")}</p>
              )}
            </div>
          )}
          <p className={cn("text-xs", MUTED)}>{t("paymentNote")}</p>
        </aside>
      </div>
    </div>
  );
}
