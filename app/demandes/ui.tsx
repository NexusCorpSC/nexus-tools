import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { OfferStatus, PlayerRequest } from "@/types/requests";

/**
 * Ce que les pages du tableau des demandes partagent : la teinte cuivre des
 * demandes, les pastilles d'audience et d'état. Rien ici n'appelle de hook :
 * pages serveur et composants client l'importent pareil.
 */

export const PAGE_PANEL =
  "m-2 mx-auto max-w-7xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6";

export const MUTED = "text-[#9ED0FF]/70";

/** Le bouton propre aux demandes : « J'en ai », « Publier ». */
export const REQ_BUTTON =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#FFB98A] px-3.5 text-sm font-semibold text-[#062338] transition-colors hover:bg-[#FFD0AE] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#FFB98A]/60 disabled:pointer-events-none disabled:opacity-50";

export const REQ_BUTTON_SM =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md bg-[#FFB98A] px-2.5 text-xs font-semibold text-[#062338] transition-colors hover:bg-[#FFD0AE] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#FFB98A]/60 disabled:pointer-events-none disabled:opacity-50";

export const GHOST_BUTTON =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#9ED0FF]/28 px-3 text-sm font-medium text-[#E3F1FF] transition-colors hover:border-[#9ED0FF]/50 hover:bg-[#9ED0FF]/8 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60 disabled:pointer-events-none disabled:opacity-50";

export const GHOST_BUTTON_SM =
  "inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-md border border-[#9ED0FF]/28 px-2.5 text-xs font-medium text-[#E3F1FF] transition-colors hover:border-[#9ED0FF]/50 hover:bg-[#9ED0FF]/8 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60 disabled:pointer-events-none disabled:opacity-50";

export const FIELD =
  "block h-9 w-full min-w-0 rounded-lg border border-[#9ED0FF]/20 bg-[#0E2C45] px-3 text-sm text-[#E3F1FF] placeholder:text-[#7E9FB7] focus:border-[#9ED0FF]/50 focus:ring-0 focus:outline-hidden";

export function Chip({
  on,
  children,
  className,
}: {
  on?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-xs whitespace-nowrap transition-colors",
        on
          ? "border-[#CCE7FF] bg-[#CCE7FF] font-semibold text-[#062338]"
          : "border-[#9ED0FF]/28 text-[#A9CDEE] hover:border-[#9ED0FF]/50 hover:text-[#E3F1FF]",
        className,
      )}
    >
      {children}
    </span>
  );
}

const AUDIENCE_TONE = {
  friend: "bg-emerald-300/10 text-emerald-200",
  org: "bg-violet-300/12 text-violet-200",
  public: "bg-sky-300/10 text-sky-200",
} as const;

export function AudiencePill({
  tone,
  children,
}: {
  tone: keyof typeof AUDIENCE_TONE;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 max-w-full shrink-0 items-center gap-1 truncate rounded-full px-2 text-[11px] font-semibold",
        AUDIENCE_TONE[tone],
      )}
    >
      <span aria-hidden="true">●</span>
      {children}
    </span>
  );
}

/**
 * Pour qui une demande est publiée. Sur le tableau, la raison la plus proche
 * du lecteur suffit (une pastille) ; sur la fiche, toutes.
 */
export function audienceOf(
  request: PlayerRequest,
): { tone: keyof typeof AUDIENCE_TONE; key: "friends" | "org" | "public"; org?: string }[] {
  const pills: { tone: keyof typeof AUDIENCE_TONE; key: "friends" | "org" | "public"; org?: string }[] = [];
  if (request.audience.friends) pills.push({ tone: "friend", key: "friends" });
  for (const org of request.audience.orgs) {
    pills.push({ tone: "org", key: "org", org: org.name });
  }
  if (request.audience.public) pills.push({ tone: "public", key: "public" });
  return pills;
}

const REQUEST_STATUS_TONE: Record<PlayerRequest["status"], string> = {
  OPEN: "bg-[#FFB98A]/12 text-[#FFB98A]",
  FILLED: "bg-emerald-300/12 text-emerald-200",
  EXPIRED: "bg-[#9ED0FF]/8 text-[#9ED0FF]/80",
  CLOSED: "bg-[#9ED0FF]/8 text-[#9ED0FF]/80",
};

const OFFER_STATUS_TONE: Record<OfferStatus, string> = {
  NEW: "bg-sky-300/12 text-sky-200",
  KEPT: "bg-emerald-300/12 text-emerald-200",
  RECEIVED: "bg-[#9ED0FF]/8 text-[#CCE7FF]",
  DECLINED: "bg-red-300/10 text-red-200",
  WITHDRAWN: "bg-[#9ED0FF]/8 text-[#9ED0FF]/80",
};

export function StatusPill({
  kind,
  status,
  children,
}: {
  kind: "request" | "offer";
  status: string;
  children: ReactNode;
}) {
  const tone =
    kind === "request"
      ? REQUEST_STATUS_TONE[status as PlayerRequest["status"]]
      : OFFER_STATUS_TONE[status as OfferStatus];
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded px-1.5 font-mono text-[11px] font-bold tracking-wide whitespace-nowrap uppercase",
        tone,
      )}
    >
      {children}
    </span>
  );
}

/** La barre de ce qui est déjà reçu. */
export function ProgressBar({ request, label }: { request: PlayerRequest; label: string }) {
  const done = request.quantity > 0 ? Math.min(1, request.received / request.quantity) : 0;
  return (
    <div
      className="h-1 overflow-hidden rounded-full bg-[#0E2C45]"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={request.quantity}
      aria-valuenow={request.received}
    >
      <span
        className="block h-full rounded-full bg-[#FFB98A]"
        style={{ width: `${Math.round(done * 100)}%` }}
      />
    </div>
  );
}

export function Fact({
  label,
  children,
  accent,
}: {
  label: string;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-[#0E2C45] px-2.5 py-1.5">
      <span className="block text-[10.5px] tracking-wider text-[#7E9FB7] uppercase">
        {label}
      </span>
      <span
        className={cn(
          "block truncate font-mono text-[13px] tabular-nums",
          accent ? "text-[#FFB98A]" : "text-[#E3F1FF]",
        )}
      >
        {children}
      </span>
    </div>
  );
}
