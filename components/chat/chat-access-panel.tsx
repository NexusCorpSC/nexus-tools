"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ChatStatus } from "@/types/chat";

/**
 * Ce que voit un joueur sans accès ouvert : demander l'accès, la demande en
 * attente, l'accès retiré, ou le chat fermé par l'admin.
 */
export function ChatAccessPanel({
  status,
  onStatus,
}: {
  status: ChatStatus;
  onStatus: (status: ChatStatus) => void;
}) {
  const t = useTranslations("Chat.access");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function request() {
    setSending(true);
    setFailed(false);
    try {
      const response = await fetch("/api/chat/access", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      onStatus((await response.json()) as ChatStatus);
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  }

  const state = !status.enabled ? "disabled" : status.status;

  return (
    <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
      <h2 className="text-lg font-semibold text-[#CCE7FF]">
        {t(`${state}.title`)}
      </h2>
      <p className="text-sm text-[#F2F7FC]/70">{t(`${state}.body`)}</p>
      {state === "none" && (
        <Button onClick={request} disabled={sending}>
          {t("request")}
        </Button>
      )}
      {failed && <p className="text-sm text-[#F7A8A8]">{t("failed")}</p>}
    </div>
  );
}
