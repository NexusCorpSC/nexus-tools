"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useLocale, useTranslations } from "next-intl";
import { ArrowUp, Loader2, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/chat/chat-message";
import { chatErrorCode, type ChatUIMessage } from "@/lib/chat/client";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatStatus } from "@/types/chat";

/**
 * Une conversation de Nexus Chat : les messages, la saisie, les
 * confirmations. Le serveur garde l'historique : chaque requête n'envoie que
 * le dernier message (le nouveau message du joueur, ou ses réponses aux
 * confirmations).
 */
export function ChatView({
  id,
  initialMessages,
  status,
  onStatus,
  onSaved,
  compact = false,
}: {
  id: string;
  initialMessages: ChatUIMessage[];
  status: ChatStatus;
  onStatus: (update: (status: ChatStatus) => ChatStatus) => void;
  /** Une réponse est terminée (et enregistrée) : la liste peut se rafraîchir. */
  onSaved?: (id: string) => void;
  compact?: boolean;
}) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ id: chatId, messages }) => ({
          body: { id: chatId, message: messages.at(-1) },
        }),
      }),
    [],
  );

  const {
    messages,
    sendMessage,
    addToolApprovalResponse,
    regenerate,
    stop,
    status: chatStatus,
    error,
    clearError,
  } = useChat<ChatUIMessage>({
    id,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message, isError }) => {
      const metadata = message.metadata;
      if (metadata?.remainingMicros !== undefined) {
        const remaining = metadata.remainingMicros;
        onStatus((current) => ({
          ...current,
          remainingMicros: remaining,
          spentMicros: Math.max(0, current.monthlyBudgetMicros - remaining),
        }));
      }
      if (!isError) onSaved?.(id);
    },
    onError: (cause) => {
      const code = chatErrorCode(cause);
      if (code === "budget_exhausted") {
        onStatus((current) => ({
          ...current,
          remainingMicros: 0,
          spentMicros: current.monthlyBudgetMicros,
        }));
      } else if (code === "no_access" || code === "disabled") {
        onStatus((current) =>
          code === "disabled"
            ? { ...current, enabled: false }
            : { ...current, status: "revoked" },
        );
      }
    },
  });

  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const exhausted = status.remainingMicros <= 0;
  const errorCode = error ? chatErrorCode(error) : null;
  const pendingApproval = messages
    .at(-1)
    ?.parts.some(
      (part) => "state" in part && part.state === "approval-requested",
    );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, chatStatus]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [id]);

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy || exhausted) return;
    clearError();
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${compact ? "p-3" : "p-4"}`}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="mx-auto max-w-md space-y-2 py-8 text-center text-sm text-[#F2F7FC]/60">
            <p className="font-semibold text-[#CCE7FF]">{t("emptyTitle")}</p>
            <p>{t("emptyHint")}</p>
          </div>
        )}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            disabled={busy}
            onApproval={(approvalId, approved) =>
              addToolApprovalResponse({ id: approvalId, approved })
            }
          />
        ))}
        {chatStatus === "submitted" && (
          <p className="flex items-center gap-2 text-xs text-[#F2F7FC]/60">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("thinking")}
          </p>
        )}
        {messages.at(-1)?.metadata?.budgetExhausted && (
          <p className="text-xs text-[#F7D2AE]">{t("stoppedBudget")}</p>
        )}
        {errorCode && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#F7A8A8]/30 bg-[#3A1515]/40 px-3 py-2 text-sm text-[#F7D2D2]">
            <span>{t(`errors.${errorCode}`)}</span>
            {(errorCode === "generic" || errorCode === "unavailable") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  clearError();
                  regenerate();
                }}
              >
                <RotateCcw className="size-3.5" aria-hidden />
                {t("retry")}
              </Button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={submit}
        className={`border-t border-[#9ED0FF]/12 ${compact ? "p-2" : "p-3"}`}
      >
        {exhausted ? (
          <p className="px-1 py-2 text-sm text-[#F7D2AE]">
            {t("budget.exhausted", {
              date: new Date(status.resetsAt).toLocaleDateString(locale, {
                day: "numeric",
                month: "long",
              }),
            })}
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              maxLength={CHAT_MESSAGE_MAX_LENGTH}
              placeholder={
                pendingApproval ? t("placeholderApproval") : t("placeholder")
              }
              aria-label={t("placeholder")}
              className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-[#9ED0FF]/20 bg-[#061E30]/70 px-3 py-2 text-sm text-[#F2F7FC] outline-none placeholder:text-[#F2F7FC]/40 focus-visible:border-[#9ED0FF]/50"
            />
            {busy ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => stop()}
                aria-label={t("stop")}
                title={t("stop")}
              >
                <Square className="size-4" aria-hidden />
              </Button>
            ) : (
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim()}
                aria-label={t("send")}
                title={t("send")}
              >
                <ArrowUp className="size-4" aria-hidden />
              </Button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
