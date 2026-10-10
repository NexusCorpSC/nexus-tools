"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatUsd } from "@/lib/chat/format";
import type { ChatStatus } from "@/types/chat";

/**
 * Ce que le joueur a consommé de son budget du mois, sur une ligne avec une
 * barre fine ; la date où il repart n'est en clair que si on le demande.
 */
export function ChatBudget({
  status,
  showReset = false,
}: {
  status: ChatStatus;
  /** La date où le budget repart, en clair (la barre latérale de `/chat`). */
  showReset?: boolean;
}) {
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
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs text-[#8FB1D6]">
        <span>{t("label")}</span>
        <span className="whitespace-nowrap font-mono text-[#CFE2F7]">
          {t("spent", {
            spent: formatUsd(status.spentMicros, locale),
            budget: formatUsd(status.monthlyBudgetMicros, locale),
          })}
        </span>
      </div>
      <div
        className="h-0.5 overflow-hidden rounded-full bg-[#8FD0FF]/12"
        role="progressbar"
        aria-label={t("label")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
      >
        <div
          className={`h-full rounded-full ${ratio >= 0.9 ? "bg-[#F7D2AE]" : "bg-[#8FD0FF]"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className={showReset ? "text-[11px] text-[#8FB1D6]" : "sr-only"}>
        {t("resets", { date: resets })}
      </p>
    </div>
  );
}
