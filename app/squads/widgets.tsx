"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The code, and a tap to put it on the clipboard for whoever asks. */
export function CodeChip({ code, tone }: { code: string; tone?: "raid" }) {
  const t = useTranslations("Squads");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1_500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      title={copied ? t("copied") : t("copyCode")}
      onClick={() => {
        // The code is written right there and selectable, so a clipboard
        // that is refused — or absent, outside a secure context — costs
        // nothing worth reporting.
        void navigator.clipboard
          ?.writeText(code)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-[#061E30]/60 px-2 font-mono text-xs tracking-widest text-[#CCE7FF] transition hover:bg-[#061E30]/90",
        tone === "raid" ? "border-amber-300/40" : "border-[#9ED0FF]/25",
      )}
    >
      {code}
      {copied ? (
        <Check className="size-3.5 text-emerald-300" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5 text-[#9ED0FF]/60" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * A button that asks twice, without a native dialog: the first tap turns it
 * into the question for a few seconds, the second answers it. A thumb slips
 * more easily than a mouse, and «leave the squad» is not worth a slip.
 */
export function ConfirmButton({
  confirmLabel,
  onConfirm,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  confirmLabel: string;
  /** The click that counts — the second one. There is no `onClick`. */
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4_000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      {...props}
      aria-live="polite"
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}
