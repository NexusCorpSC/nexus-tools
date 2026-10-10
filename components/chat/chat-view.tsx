"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowUp,
  Loader2,
  Mic,
  RotateCcw,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatMessage } from "@/components/chat/chat-message";
import { useChatVoice } from "@/components/chat/use-chat-voice";
import {
  chatErrorCode,
  hasConfirmedWrite,
  requestChatStop,
  type ChatUIMessage,
} from "@/lib/chat/client";
import { speechText, textPartCount } from "@/lib/chat/voice-client";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatStatus } from "@/types/chat";

/**
 * Le transport de `useChat` : le serveur garde l'historique, chaque requête
 * n'envoie que le dernier message, et dit si le tour se fait à la voix.
 */
const transport = new DefaultChatTransport<ChatUIMessage>({
  api: "/api/chat",
  prepareSendMessagesRequest: ({ id, messages }) => ({
    body: {
      id,
      message: messages.at(-1),
      ...(voiceTurns.has(id) && { voice: true }),
    },
  }),
});

/**
 * Les conversations dont le tour en cours a commencé à la voix : la réponse
 * est faite pour l'oral et lue à voix haute (confirmations comprises).
 */
const voiceTurns = new Set<string>();

/** Les exemples de demandes de l'accueil (`Chat.suggestions`). */
const SUGGESTIONS = ["find", "buy", "inventory"] as const;

/**
 * Une conversation de Nexus Chat : les messages, la saisie, les
 * confirmations. Le serveur garde l'historique : chaque requête n'envoie que
 * le dernier message (le nouveau message du joueur, ou ses réponses aux
 * confirmations).
 *
 * La voix, quand elle est ouverte : maintenir le bouton micro (ou
 * Ctrl+Espace) pour parler, relâcher pour envoyer ; la réponse à une
 * question dictée est lue à voix haute.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Les parties de texte déjà lues, par message : après une confirmation, la
  // suite de la réponse est lue sans relire le début.
  const spoken = useRef(new Map<string, number>());
  const voiceRef = useRef<ReturnType<typeof useChatVoice> | null>(null);
  // Où en est la conversation quand une transcription revient.
  const canSendRef = useRef(true);

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
    onFinish: ({ message, isError, isAbort, isDisconnect }) => {
      const voice = voiceRef.current;
      // Une réponse arrêtée par le joueur ou coupée n'est pas lue.
      const complete = !isError && !isAbort && !isDisconnect;
      if (complete && voiceTurns.has(id) && voice?.readAloud) {
        const from = spoken.current.get(message.id) ?? 0;
        spoken.current.set(message.id, textPartCount(message));
        voice.speak(speechText(message, from));
      }
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

  const voice = useChatVoice({
    conversationId: id,
    onTranscript: (text) => {
      // Une réponse partie entre-temps : la question attend dans le champ.
      if (!canSendRef.current) {
        setInput((current) => current || text);
        return;
      }
      clearError();
      voiceTurns.add(id);
      sendMessage({ text });
    },
    onRemaining: (remaining) =>
      onStatus((current) => ({
        ...current,
        remainingMicros: remaining,
        spentMicros: Math.max(0, current.monthlyBudgetMicros - remaining),
      })),
  });

  useEffect(() => {
    voiceRef.current = voice;
  });

  const busy = chatStatus === "submitted" || chatStatus === "streaming";
  const exhausted = status.remainingMicros <= 0;
  const voiceReady = status.voice && !exhausted;
  useEffect(() => {
    canSendRef.current = !busy && !exhausted;
  });
  const errorCode = error ? chatErrorCode(error) : null;
  const last = messages.at(-1);
  // Réessayer rejouerait le tour : pas après une écriture déjà faite.
  const canRetry =
    (errorCode === "generic" ||
      errorCode === "unavailable" ||
      errorCode === "busy") &&
    !(last?.role === "assistant" && hasConfirmedWrite(last));
  const pendingApproval = last?.parts.some(
    (part) => "state" in part && part.state === "approval-requested",
  );

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, chatStatus]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => {
      voiceTurns.delete(id);
    };
  }, [id]);

  // Ctrl+Espace : maintenir pour parler, relâcher pour envoyer — tant que
  // cette conversation est à l'écran (le panneau refermé la garde cachée).
  const { press, release, cancel } = voice;
  const canTalk = voiceReady && !busy;
  useEffect(() => {
    if (!voiceReady) return;
    let held = false;
    const visible = () => rootRef.current?.checkVisibility?.() ?? true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && cancel()) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.code !== "Space" || !event.ctrlKey || event.altKey) return;
      if (!visible()) return;
      event.preventDefault();
      if (event.repeat || held || !canTalk) return;
      held = true;
      void press();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!held || (event.code !== "Space" && event.key !== "Control")) return;
      held = false;
      release();
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [voiceReady, canTalk, press, release, cancel]);

  /** Envoie une question écrite (ou un exemple de l'accueil). */
  function send(text: string): boolean {
    // Pendant une dictée, la question dictée passe d'abord.
    if (!text || busy || exhausted || voice.state !== "idle") return false;
    clearError();
    voiceTurns.delete(id);
    voice.stopSpeaking();
    sendMessage({ text });
    return true;
  }

  function submit(event?: React.FormEvent) {
    event?.preventDefault();
    if (send(input.trim())) setInput("");
  }

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col">
      <div
        className={`min-h-0 flex-1 space-y-4 overflow-y-auto ${compact ? "p-3" : "p-4"}`}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-8 text-center text-sm text-[#8FB1D6]">
            <Image
              alt=""
              src="/nexus_logo_square.png"
              width={48}
              height={48}
              className="size-12 drop-shadow-[0_0_18px_rgb(58_160_220/0.45)]"
            />
            <p className="text-base font-semibold text-[#EAF3FF]">
              {t("emptyTitle")}
            </p>
            <p>{t("emptyHint")}</p>
            {!exhausted && (
              <ul
                aria-label={t("suggestionsLabel")}
                className="mt-2 flex flex-wrap justify-center gap-2"
              >
                {SUGGESTIONS.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => send(t(`suggestions.${key}`))}
                      className="rounded-lg bg-[#1E6AA8] px-3 py-1.5 text-left text-sm text-white transition hover:bg-[#2386C8] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#CFE9FF]"
                    >
                      {t(`suggestions.${key}`)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
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
          <p className="flex items-center gap-2 text-xs text-[#8FB1D6]">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {t("thinking")}
          </p>
        )}
        {last?.metadata?.budgetExhausted && (
          <p className="text-xs text-[#F7D2AE]">{t("stoppedBudget")}</p>
        )}
        {voice.error && (
          <p className="text-xs text-[#F7D2AE]" role="status">
            {t(`voice.errors.${voice.error}`)}
          </p>
        )}
        {errorCode && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#F7A8A8]/30 bg-[#3A1515]/40 px-3 py-2 text-sm text-[#F7D2D2]">
            <span>{t(`errors.${errorCode}`)}</span>
            {canRetry && (
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
        className={compact ? "px-3 pt-1 pb-3" : "px-4 pt-1 pb-4"}
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
          <div className="space-y-2">
            {status.voice && voice.state !== "idle" && (
              <p
                className="flex items-center gap-2 px-1 text-xs text-[#8FD0FF]"
                role="status"
              >
                {voice.state === "recording" ? (
                  <span className="size-2 animate-pulse rounded-full bg-[#8FD0FF] shadow-[0_0_8px_#8FD0FF]" />
                ) : (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                )}
                {t(`voice.${voice.state}`)}
              </p>
            )}
            <div className="flex items-end gap-2">
              {status.voice && (
                <Button
                  type="button"
                  size="icon"
                  className="rounded-full"
                  variant="ghost"
                  onClick={() => voice.setReadAloud(!voice.readAloud)}
                  aria-pressed={voice.readAloud}
                  aria-label={t(
                    voice.readAloud
                      ? "voice.readAloudOn"
                      : "voice.readAloudOff",
                  )}
                  title={t(
                    voice.readAloud
                      ? "voice.readAloudOn"
                      : "voice.readAloudOff",
                  )}
                >
                  {voice.readAloud ? (
                    <Volume2 className="size-4" aria-hidden />
                  ) : (
                    <VolumeX className="size-4" aria-hidden />
                  )}
                </Button>
              )}
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
                className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-[#8FD0FF]/35 bg-transparent px-4 py-2 text-sm text-[#EAF3FF] outline-none placeholder:text-[#6E93BC] focus-visible:border-[#8FD0FF]/70"
              />
              {status.voice &&
                (voice.speaking ? (
                  <Button
                    type="button"
                    size="icon"
                    className="rounded-full"
                    variant="outline"
                    onClick={voice.stopSpeaking}
                    aria-label={t("voice.stopSpeaking")}
                    title={t("voice.stopSpeaking")}
                  >
                    <VolumeX className="size-4" aria-hidden />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className={
                      voice.state === "recording"
                        ? "chat-orb rounded-full border-transparent text-white ring-4 ring-[#3AA0DC]/25 hover:text-white"
                        : "rounded-full"
                    }
                    disabled={!canTalk || voice.state === "transcribing"}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      void voice.press();
                    }}
                    onPointerUp={() => voice.release()}
                    onPointerCancel={() => voice.release()}
                    onKeyDown={(event) => {
                      if (
                        (event.key === " " || event.key === "Enter") &&
                        !event.repeat
                      ) {
                        event.preventDefault();
                        void voice.press();
                      }
                    }}
                    onKeyUp={(event) => {
                      if (event.key === " " || event.key === "Enter")
                        voice.release();
                    }}
                    aria-pressed={voice.state === "recording"}
                    aria-label={t("voice.talk")}
                    title={t("voice.talkHint")}
                  >
                    <Mic className="size-4" aria-hidden />
                  </Button>
                ))}
              {busy ? (
                <Button
                  type="button"
                  size="icon"
                  className="rounded-full"
                  variant="outline"
                  onClick={() => {
                    void stop();
                    requestChatStop();
                  }}
                  aria-label={t("stop")}
                  title={t("stop")}
                >
                  <Square className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  className="rounded-full"
                  disabled={!input.trim() || voice.state !== "idle"}
                  aria-label={t("send")}
                  title={t("send")}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
