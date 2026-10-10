"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Loader2, Maximize2, MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatAccessPanel } from "@/components/chat/chat-access-panel";
import { ChatBudget } from "@/components/chat/chat-budget";
import { ChatView } from "@/components/chat/chat-view";
import { newChatId, type ChatUIMessage } from "@/lib/chat/client";
import type { ChatStatus } from "@/types/chat";

type Active = { id: string; messages: ChatUIMessage[]; saved: boolean };

/**
 * Le contenu du panneau latéral : la conversation la plus récente du joueur
 * (celle qu'il poursuivait, ici ou sur `/chat`), ou une nouvelle.
 */
export default function ChatPanelBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Chat");
  const [status, setStatus] = useState<ChatStatus | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statusResponse, latestResponse] = await Promise.all([
          fetch("/api/chat/status"),
          fetch("/api/chat/conversations/latest"),
        ]);
        if (!statusResponse.ok) throw new Error(String(statusResponse.status));
        const latest = latestResponse.ok
          ? ((await latestResponse.json()) as {
              id: string;
              messages: ChatUIMessage[];
            } | null)
          : null;
        if (cancelled) return;
        setStatus((await statusResponse.json()) as ChatStatus);
        setActive(
          latest
            ? { id: latest.id, messages: latest.messages, saved: true }
            : { id: newChatId(), messages: [], saved: false },
        );
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startNew = useCallback(() => {
    setActive({ id: newChatId(), messages: [], saved: false });
  }, []);

  const onSaved = useCallback((id: string) => {
    setActive((current) =>
      current?.id === id && !current.saved
        ? { ...current, saved: true }
        : current,
    );
  }, []);

  const onStatus = useCallback(
    (update: (status: ChatStatus) => ChatStatus) =>
      setStatus((current) => (current ? update(current) : current)),
    [],
  );

  const granted = status?.enabled && status.status === "granted";

  return (
    <>
      <header className="flex items-center gap-1 border-b border-[#9ED0FF]/12 px-3 py-2">
        <h2 className="flex-1 truncate text-base font-bold text-[#CCE7FF]">
          {t("title")}
        </h2>
        {granted && (
          <Button
            size="icon"
            variant="ghost"
            onClick={startNew}
            aria-label={t("newConversation")}
            title={t("newConversation")}
          >
            <MessageSquarePlus className="size-4" aria-hidden />
          </Button>
        )}
        {active && (
          <Button
            asChild
            size="icon"
            variant="ghost"
            title={t("panel.openPage")}
          >
            <Link
              href={active.saved ? `/chat?c=${active.id}` : "/chat"}
              aria-label={t("panel.openPage")}
            >
              <Maximize2 className="size-4" aria-hidden />
            </Link>
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={onClose}
          aria-label={t("panel.close")}
          title={t("panel.close")}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </header>

      {failed ? (
        <p className="p-4 text-sm text-[#F7A8A8]">{t("errors.generic")}</p>
      ) : !status || !active ? (
        <p className="flex items-center gap-2 p-4 text-sm text-[#F2F7FC]/60">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("panel.loading")}
        </p>
      ) : !granted ? (
        <div className="flex-1 overflow-y-auto p-4">
          <ChatAccessPanel status={status} onStatus={setStatus} />
        </div>
      ) : (
        <>
          <div className="border-b border-[#9ED0FF]/12 px-3 py-2">
            <ChatBudget status={status} />
          </div>
          <ChatView
            key={active.id}
            id={active.id}
            initialMessages={active.messages}
            status={status}
            onStatus={onStatus}
            onSaved={onSaved}
            compact
          />
        </>
      )}
    </>
  );
}
