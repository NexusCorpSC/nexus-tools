"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatUsd } from "@/lib/chat/format";
import type { ChatStatus } from "@/types/chat";

/** Ce que le joueur a consommé de son budget du mois, et quand il repart. */
export function ChatBudget({ status }: { status: ChatStatus }) {
  const t = useTranslations("Chat.budget");
  const locale = useLocale();
  const ratio =
    status.monthlyBudgetMicros > 0
      ? Math.min(1, status.spentMicros / status.monthlyBudgetMicros)
      : 1;
  const resets = new Date(status.resetsAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-1.5" title={t("resets", { date: resets })}>
      <div className="flex items-baseline justify-between gap-2 text-xs text-[#F2F7FC]/70">
        <span>{t("label")}</span>
        <span className="whitespace-nowrap font-mono">
          {t("spent", {
            spent: formatUsd(status.spentMicros, locale),
            budget: formatUsd(status.monthlyBudgetMicros, locale),
          })}
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-[#9ED0FF]/12"
        role="progressbar"
        aria-label={t("label")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div
          className={`h-full rounded-full ${ratio >= 0.9 ? "bg-[#F7D2AE]" : "bg-[#9ED0FF]/70"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="text-[11px] text-[#F2F7FC]/50">
        {t("resets", { date: resets })}
      </p>
    </div>
  );
}
