"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ClockIcon,
  LinkIcon,
  MinusCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Location } from "@/types/inventory";
import type {
  ParcelErrorCode,
  ParcelView,
  ParcelViewItem,
} from "@/lib/parcels";
import { LocationCombobox } from "./components";
import {
  lookupParcel,
  myParcels,
  receiveParcel,
  withdrawParcel,
} from "./actions";

/** Search parameter a parcel link carries: `/inventory?parcel=K7QM2X9A`. */
export const PARCEL_PARAM = "parcel";

const CODE_LENGTH = 8;

/** A code as typed: capitals and digits only, at most 8 of them. */
function cleanCode(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

/** "K7QM2X9A" → "K7QM-2X9A", easier to read out and to copy by eye. */
export function formatParcelCode(code: string) {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** The message for a refusal from `lib/parcels.ts`. */
function useParcelError() {
  const t = useTranslations("Parcels");
  return (error: ParcelErrorCode | "unauthorized", item?: string) =>
    t(`error_${error}`, { item: item ?? "" });
}

function useNumber() {
  const locale = useLocale();
  return useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );
}

/** "23 h 58", "12 min": what is left of a code's life. */
function useRemaining(expiresAt: string) {
  const t = useTranslations("Parcels");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const minutes = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - now) / 60_000),
  );
  return minutes >= 60
    ? t("remainingHours", {
        hours: Math.floor(minutes / 60),
        minutes: String(minutes % 60).padStart(2, "0"),
      })
    : t("remainingMinutes", { minutes });
}

function ParcelItems({ items }: { items: ParcelViewItem[] }) {
  const number = useNumber();
  return (
    <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/15">
      {items.map((item, index) => (
        <li
          key={`${index}-${item.name}`}
          className="flex items-center gap-3 px-3 py-2 text-sm"
        >
          <span className="min-w-0 flex-1 truncate font-medium text-[#CCE7FF]">
            {item.name}
          </span>
          {item.quality != null && (
            <span className="font-mono text-xs text-[#9FBDD3]">
              Q {item.quality}
            </span>
          )}
          <span className="w-28 text-right font-mono text-sm font-semibold tabular-nums">
            ×{number.format(item.quantity)}
            {item.unit && (
              <span className="ml-1 text-xs text-[#9FBDD3]">{item.unit}</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    // The code stays on screen to be copied by hand.
  }
}

// ─── The code of a parcel just sent ──────────────────────────────────────────

/**
 * What the sender sees once the parcel is sealed: its code, big enough to
 * read out, ways to copy it, and a way to take it back.
 */
export function SentParcelDialog({
  parcel,
  onClose,
  onCancelled,
}: {
  parcel: ParcelView | null;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const t = useTranslations("Parcels");
  const errorMessage = useParcelError();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancel = async () => {
    if (!parcel) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await withdrawParcel(parcel.code);
      if (!result.ok) {
        setError(errorMessage(result.error, result.item));
        return;
      }
      toast.success(t("cancelled"));
      onCancelled();
      onClose();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <Dialog
      open={parcel !== null}
      onOpenChange={(open) => {
        if (!open) {
          setError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArchiveBoxIcon className="size-5 text-[#9ED0FF]" />
            {t("sentTitle")}
          </DialogTitle>
          <DialogDescription>{t("sentDescription")}</DialogDescription>
        </DialogHeader>

        {parcel && <SentParcelBody parcel={parcel} />}

        {error && <p className="text-sm text-red-300">{error}</p>}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            className="text-red-300 hover:text-red-200"
            disabled={cancelling}
            onClick={cancel}
          >
            {t("cancel")}
          </Button>
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link href="/inventory/parcels">{t("seeAll")}</Link>
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("close")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SentParcelBody({ parcel }: { parcel: ParcelView }) {
  const t = useTranslations("Parcels");
  const remaining = useRemaining(parcel.expiresAt);
  const link =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/inventory?${PARCEL_PARAM}=${parcel.code}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-[#9ED0FF]/15 bg-[#061E30] p-5">
        <p
          aria-label={t("codeLabel", { code: parcel.code })}
          className="flex items-center gap-1.5"
        >
          {parcel.code.split("").map((char, index) => (
            <span key={index} className="flex items-center gap-1.5">
              {index === 4 && (
                <span aria-hidden className="h-0.5 w-3 bg-[#3F6F92]" />
              )}
              <span
                aria-hidden
                className="flex h-14 w-11 items-center justify-center rounded-lg bg-[#0B3A5A] font-mono text-3xl font-bold text-[#E6F3FF]"
              >
                {char}
              </span>
            </span>
          ))}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            onClick={() => copy(parcel.code, t("codeCopied"))}
          >
            <ClipboardDocumentIcon className="size-4" />
            {t("copyCode")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => copy(link, t("linkCopied"))}
          >
            <LinkIcon className="size-4" />
            {t("copyLink")}
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-amber-300">
          <ClockIcon className="size-4" />
          {t("waiting", { remaining })}
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wider text-[#9FBDD3] uppercase">
          {t("contents")}
        </p>
        <ParcelItems items={parcel.items} />
        <p className="text-xs text-[#9FBDD3]">{t("reservedHint")}</p>
      </div>
    </div>
  );
}

// ─── Receiving a parcel ──────────────────────────────────────────────────────

/**
 * The recipient's side: a code, what it holds and who sent it, where to put
 * it. Nothing moves until "Accept".
 */
export function ReceiveParcelDialog({
  open,
  initialCode,
  onOpenChange,
  onReceived,
}: {
  open: boolean;
  initialCode?: string;
  onOpenChange: (open: boolean) => void;
  onReceived: () => void;
}) {
  const t = useTranslations("Parcels");
  const errorMessage = useParcelError();
  const [code, setCode] = useState("");
  const [parcel, setParcel] = useState<ParcelView | null>(null);
  const [looking, setLooking] = useState(false);
  const [location, setLocation] = useState<Location | null>(null);
  const [orgVisible, setOrgVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The code each lookup was for: a reply to an older one is dropped.
  const lookupRef = useRef("");

  useEffect(() => {
    if (open) setCode(cleanCode(initialCode ?? ""));
  }, [open, initialCode]);

  const lookup = useCallback(
    async (value: string) => {
      lookupRef.current = value;
      setLooking(true);
      setError(null);
      try {
        const result = await lookupParcel(value);
        if (lookupRef.current !== value) return;
        if (result.ok) setParcel(result.parcel);
        else setError(errorMessage(result.error, result.item));
      } finally {
        if (lookupRef.current === value) setLooking(false);
      }
    },
    [errorMessage],
  );

  // A full code is looked up as soon as it is typed or pasted.
  useEffect(() => {
    setParcel(null);
    setError(null);
    if (open && code.length === CODE_LENGTH) void lookup(code);
    else lookupRef.current = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lookup` is stable enough: the message only follows the locale
  }, [code, open]);

  const reset = () => {
    lookupRef.current = "";
    setCode("");
    setParcel(null);
    setLocation(null);
    setOrgVisible(false);
    setError(null);
  };

  const accept = async () => {
    if (!parcel || !location) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await receiveParcel(parcel.code, location.id, orgVisible);
      if (!result.ok) {
        setError(errorMessage(result.error, result.item));
        return;
      }
      toast.success(
        t("receivedTitle", {
          sender: parcel.senderName ?? t("someone"),
          location: location.name,
        }),
        {
          description: t("receivedDescription", {
            created: result.created,
            merged: result.merged,
          }),
        },
      );
      onReceived();
      onOpenChange(false);
      reset();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownTrayIcon className="size-5 text-[#9ED0FF]" />
            {t("receiveTitle")}
          </DialogTitle>
          <DialogDescription>{t("receiveDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="parcel-code">{t("codeField")}</Label>
            <div className="relative">
              <Input
                id="parcel-code"
                value={formatParcelCode(code)}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                placeholder="XXXX-XXXX"
                aria-invalid={error !== null && !parcel ? true : undefined}
                className={cn(
                  "h-14 pr-12 font-mono text-2xl font-bold tracking-[0.2em] uppercase md:text-2xl",
                  parcel && "border-emerald-400",
                )}
              />
              {parcel && (
                <CheckIcon className="absolute top-1/2 right-4 size-6 -translate-y-1/2 text-emerald-300" />
              )}
            </div>
            <p className="text-xs text-[#9FBDD3]">
              {looking ? t("looking") : t("codeHint")}
            </p>
          </div>

          {parcel && (
            <div className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#061E30] p-4">
              <p className="text-sm text-[#CCE7FF]">
                {t("from", {
                  sender: parcel.senderName ?? t("someone"),
                  count: parcel.items.length,
                })}
              </p>
              <ParcelItems items={parcel.items} />
            </div>
          )}

          {parcel && (
            <div className="space-y-2">
              <Label>{t("storeAt")}</Label>
              <LocationCombobox
                value={location}
                onChange={setLocation}
                placeholder={t("storeAtPlaceholder")}
                aria-label={t("storeAt")}
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#C9E4FF]">
                <input
                  type="checkbox"
                  checked={orgVisible}
                  onChange={(e) => setOrgVisible(e.target.checked)}
                  className="size-3.5 accent-[#9ED0FF]"
                />
                {t("orgVisible")}
              </label>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="items-center gap-2">
          {parcel && (
            <p className="mr-auto text-xs text-[#9FBDD3]">{t("mergeHint")}</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              reset();
            }}
          >
            {t("close")}
          </Button>
          <Button
            type="button"
            disabled={!parcel || !location || submitting}
            onClick={accept}
          >
            <CheckIcon className="size-4" />
            {submitting ? t("accepting") : t("accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── The list of parcels ─────────────────────────────────────────────────────

const STATUS_STYLE: Record<ParcelView["status"], string> = {
  pending: "bg-amber-400/10 text-amber-300",
  delivered: "bg-emerald-400/10 text-emerald-300",
  cancelled: "bg-[#12384F] text-[#CCE7FF]",
  expired: "bg-[#12384F] text-[#CCE7FF]",
};

function ParcelStatus({ parcel }: { parcel: ParcelView }) {
  const t = useTranslations("Parcels");
  const locale = useLocale();
  const remaining = useRemaining(parcel.expiresAt);
  const when = parcel.deliveredAt
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(parcel.deliveredAt))
    : "";

  const Icon =
    parcel.status === "pending"
      ? ClockIcon
      : parcel.status === "delivered"
        ? CheckIcon
        : parcel.status === "cancelled"
          ? XMarkIcon
          : MinusCircleIcon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs",
        STATUS_STYLE[parcel.status],
      )}
    >
      <Icon className="size-3.5" />
      {t(`status_${parcel.status}`, { remaining, when })}
    </span>
  );
}

/** The reader's parcels, sent and received, with what can still be done. */
export function ParcelList() {
  const t = useTranslations("Parcels");
  const errorMessage = useParcelError();
  const number = useNumber();
  const [parcels, setParcels] = useState<ParcelView[] | null>(null);
  const [direction, setDirection] = useState<"sent" | "received">("sent");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await myParcels();
    if (result.ok) setParcels(result.parcels);
    else setError(errorMessage(result.error));
  }, [errorMessage]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loaded once; `load` follows the locale only
  }, []);

  const cancel = async (code: string) => {
    const result = await withdrawParcel(code);
    if (!result.ok) {
      toast.error(errorMessage(result.error, result.item));
      return;
    }
    toast.success(t("cancelled"));
    void load();
  };

  const shown = (parcels ?? []).filter((p) => p.direction === direction);

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        className="inline-flex rounded-lg border border-[#9ED0FF]/15 bg-[#0A2A42] p-1"
      >
        {(["sent", "received"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={direction === tab}
            onClick={() => setDirection(tab)}
            className={cn(
              "h-9 rounded-md px-4 text-sm font-semibold",
              direction === tab
                ? "bg-[#1F4F72] text-[#E6F3FF]"
                : "text-[#9FBDD3] hover:text-[#CCE7FF]",
            )}
          >
            {t(`tab_${tab}`)}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {parcels === null ? (
        <div className="h-40 animate-pulse rounded-xl bg-[#0A2A42]" />
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-[#0A2A42] py-12 text-center text-sm text-[#9FBDD3]">
          {t(`empty_${direction}`)}
        </p>
      ) : (
        <ul className="divide-y divide-[#9ED0FF]/10 overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#0A2A42]">
          {shown.map((parcel) => (
            <li
              key={parcel.code}
              className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3"
            >
              <span
                className={cn(
                  "w-28 font-mono text-[15px] font-bold tracking-wider",
                  parcel.status !== "pending" && "text-[#9FBDD3]",
                )}
              >
                {formatParcelCode(parcel.code)}
              </span>
              <span className="min-w-48 flex-1 text-sm text-[#CCE7FF]">
                {parcel.items
                  .map(
                    (item) => `${item.name} ×${number.format(item.quantity)}`,
                  )
                  .join(", ")}
                <span className="text-[#9FBDD3]">
                  {" · "}
                  {direction === "sent"
                    ? [
                        ...new Set(
                          parcel.items.map((i) => i.locationName ?? "—"),
                        ),
                      ].join(", ")
                    : (parcel.deliveredLocationName ?? "—")}
                </span>
              </span>
              <ParcelStatus parcel={parcel} />
              <span className="w-32 truncate text-sm text-[#9FBDD3]">
                {direction === "sent"
                  ? (parcel.recipientName ?? "—")
                  : (parcel.senderName ?? "—")}
              </span>
              {direction === "sent" && parcel.status === "pending" ? (
                <span className="flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={t("copyCodeOf", { code: parcel.code })}
                    onClick={() => copy(parcel.code, t("codeCopied"))}
                  >
                    <ClipboardDocumentIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-red-300 hover:text-red-200"
                    onClick={() => cancel(parcel.code)}
                  >
                    {t("cancelShort")}
                  </Button>
                </span>
              ) : (
                <span className="w-[108px]" />
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[#9FBDD3]">{t("listHint")}</p>
    </div>
  );
}
