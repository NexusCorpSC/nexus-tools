import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/shop-orders";

/** Le conteneur sombre commun à toutes les pages de la marketplace. */
export const PAGE_PANEL =
  "m-2 mx-auto space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm";

/** Un bloc de texte (message, réponse) posé sur le conteneur. */
export const TEXT_BOX =
  "whitespace-pre-wrap rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/50 p-4 text-sm";

/** Une ligne cliquable d'une liste (commandes, outils du back-office). */
export const ROW_LINK =
  "block rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/50 px-4 py-3 transition-colors hover:border-[#9ED0FF]/50";

export const MUTED = "text-[#9ED0FF]/70";

const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: "border-amber-300/50 text-amber-200",
  QUOTED: "border-sky-300/40 text-sky-200",
  ACCEPTED: "border-emerald-300/40 text-emerald-200",
  REFUSED: "border-red-300/40 text-red-200",
  CANCELLED: "border-[#9ED0FF]/25 text-[#9ED0FF]/70",
};

/** L'état d'une commande, dans la même pastille que les contributions. */
export function OrderStatusBadge({
  status,
  label,
}: {
  status: OrderStatus;
  label: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded border px-2 text-xs font-semibold",
        STATUS_TONE[status],
      )}
    >
      {label}
    </span>
  );
}
