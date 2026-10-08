import type { ReactNode } from "react";
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
  CONFIRMED: "border-emerald-300/40 text-emerald-200",
  ACCEPTED: "border-emerald-300/40 text-emerald-200",
  READY: "border-violet-300/40 text-violet-200",
  DELIVERED: "border-[#9ED0FF]/40 text-[#CCE7FF]",
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

const TAG_TONE = {
  ok: "bg-emerald-300/12 text-emerald-200",
  warn: "bg-amber-300/12 text-amber-200",
  bad: "bg-red-300/12 text-red-200",
  info: "bg-sky-300/12 text-sky-200",
  dim: "bg-[#9ED0FF]/8 text-[#9ED0FF]/80",
} as const;

/** Une petite étiquette d'état : stock, type d'annonce. */
export function Tag({
  tone,
  children,
  className,
}: {
  tone: keyof typeof TAG_TONE;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded px-1.5 text-xs font-semibold whitespace-nowrap",
        TAG_TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** L'étiquette de stock d'une annonce, sur les cartes comme sur la fiche. */
export function stockTag(
  type: "OBJECT" | "SERVICE",
  available: number,
): { tone: keyof typeof TAG_TONE; key: string; count: number } {
  if (type === "SERVICE") return { tone: "info", key: "onQuote", count: 0 };
  if (available <= 0) return { tone: "bad", key: "soldOut", count: 0 };
  if (available === 1) return { tone: "warn", key: "lastOne", count: 1 };
  return { tone: "ok", key: "available", count: available };
}

const LOGO_TONES = ["#CCE7FF", "#9EE6C4", "#F6CF94", "#FFB3B3", "#C9B8FF"];

/** Les initiales d'un magasin, dans une pastille de couleur stable. */
export function ShopLogo({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "?";
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-sm font-bold text-[#062338]",
        className,
      )}
      style={{ background: LOGO_TONES[hash % LOGO_TONES.length] }}
    >
      {initials}
    </span>
  );
}
