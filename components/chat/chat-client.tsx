"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatAccessPanel } from "@/components/chat/chat-access-panel";
import { ChatBudget } from "@/components/chat/chat-budget";
import { ChatView } from "@/components/chat/chat-view";
import { newChatId, type ChatUIMessage } from "@/lib/chat/client";
import {
  CHAT_TITLE_MAX_LENGTH,
  type ChatConversationSummary,
  type ChatStatus,
} from "@/types/chat";

type Active = { id: string; messages: ChatUIMessage[] };

/** La conversation ouverte, dans l'adresse (`?c=`), sans recharger la page. */
function setUrlConversation(id: string | null, push: boolean) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  if (url.href === window.location.href) return;
  if (push) window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

/**
 * La page de Nexus Chat : les conversations du joueur à gauche, celle qui est
 * ouverte à droite, et son budget du mois.
 */
export function ChatClient({
  initialStatus,
  initialConversations,
  initialConversation,
}: {
  initialStatus: ChatStatus;
  initialConversations: ChatConversationSummary[];
  initialConversation: Active | null;
}) {
  const t = useTranslations("Chat");
  const [status, setStatus] = useState(initialStatus);
  const [conversations, setConversations] = useState(initialConversations);
  const [active, setActive] = useState<Active>(
    () => initialConversation ?? { id: newChatId(), messages: [] },
  );
  const [loadFailed, setLoadFailed] = useState(false);

  const refreshList = useCallback(async () => {
    const response = await fetch("/api/chat/conversations");
    if (response.ok) setConversations(await response.json());
  }, []);

  const open = useCallback(async (id: string, push = true) => {
    setLoadFailed(false);
    const response = await fetch(`/api/chat/conversations/${id}`);
    if (!response.ok) {
      setLoadFailed(true);
      return;
    }
    const conversation = (await response.json()) as {
      id: string;
      messages: ChatUIMessage[];
    };
    setActive({ id: conversation.id, messages: conversation.messages });
    setUrlConversation(conversation.id, push);
  }, []);

  function startNew() {
    setLoadFailed(false);
    setActive({ id: newChatId(), messages: [] });
    setUrlConversation(null, true);
  }

  // Précédent / suivant du navigateur.
  useEffect(() => {
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get("c");
      if (id) void open(id, false);
      else setActive({ id: newChatId(), messages: [] });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  const onSaved = useCallback(
    (id: string) => {
      setUrlConversation(id, false);
      void refreshList();
    },
    [refreshList],
  );

  async function rename(id: string, title: string) {
    const response = await fetch(`/api/chat/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (response.ok) await refreshList();
  }

  async function remove(id: string) {
    const response = await fetch(`/api/chat/conversations/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) return;
    setConversations((list) => list.filter((entry) => entry.id !== id));
    if (active.id === id) startNew();
  }

  const granted = status.enabled && status.status === "granted";

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 shadow-xl shadow-black/20 backdrop-blur-sm">
      {granted && (
        <aside className="hidden w-64 shrink-0 flex-col border-r border-[#9ED0FF]/12 bg-[#092840]/50 md:flex">
          <div className="p-3">
            <Button className="w-full" variant="outline" onClick={startNew}>
              <MessageSquarePlus className="size-4" aria-hidden />
              {t("newConversation")}
            </Button>
          </div>
          <nav
            aria-label={t("conversations")}
            className="min-h-0 flex-1 overflow-y-auto px-2"
          >
            {conversations.length === 0 ? (
              <p className="px-2 py-3 text-xs text-[#F2F7FC]/50">
                {t("noConversation")}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {conversations.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    current={conversation.id === active.id}
                    onOpen={() => void open(conversation.id)}
                    onRename={(title) => void rename(conversation.id, title)}
                    onDelete={() => void remove(conversation.id)}
                  />
                ))}
              </ul>
            )}
          </nav>
          <div className="border-t border-[#9ED0FF]/12 p-3">
            <ChatBudget status={status} />
          </div>
        </aside>
      )}

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-[#9ED0FF]/12 px-4 py-3">
          <h1 className="text-lg font-bold text-[#CCE7FF]">{t("title")}</h1>
          {granted && (
            <Button
              size="sm"
              variant="ghost"
              className="md:hidden"
              onClick={startNew}
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              {t("newConversation")}
            </Button>
          )}
        </header>
        {granted && (
          <div className="space-y-2 border-b border-[#9ED0FF]/12 px-4 py-2 md:hidden">
            {conversations.length > 0 && (
              <select
                value={
                  conversations.some((entry) => entry.id === active.id)
                    ? active.id
                    : ""
                }
                onChange={(event) =>
                  event.target.value
                    ? void open(event.target.value)
                    : startNew()
                }
                aria-label={t("conversations")}
                className="w-full rounded-lg border border-[#9ED0FF]/20 bg-[#061E30] px-2 py-1.5 text-sm text-[#F2F7FC]"
              >
                <option value="">{t("newConversation")}</option>
                {conversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.title}
                  </option>
                ))}
              </select>
            )}
            <ChatBudget status={status} />
          </div>
        )}
        {!granted ? (
          <div className="flex-1 overflow-y-auto p-4">
            <ChatAccessPanel status={status} onStatus={setStatus} />
          </div>
        ) : loadFailed ? (
          <p className="p-4 text-sm text-[#F7A8A8]">{t("errors.not_found")}</p>
        ) : (
          <ChatView
            key={active.id}
            id={active.id}
            initialMessages={active.messages}
            status={status}
            onStatus={setStatus}
            onSaved={onSaved}
          />
        )}
      </section>
    </div>
  );
}

function ConversationRow({
  conversation,
  current,
  onOpen,
  onRename,
  onDelete,
}: {
  conversation: ChatConversationSummary;
  current: boolean;
  onOpen: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Chat");
  const [mode, setMode] = useState<"view" | "rename" | "delete">("view");
  const [title, setTitle] = useState(conversation.title);

  if (mode === "rename") {
    return (
      <li>
        <form
          className="flex items-center gap-1 px-1 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim()) onRename(title.trim());
            setMode("view");
          }}
        >
          <input
            autoFocus
            value={title}
            maxLength={CHAT_TITLE_MAX_LENGTH}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setMode("view")}
            aria-label={t("rename")}
            className="min-w-0 flex-1 rounded border border-[#9ED0FF]/30 bg-[#061E30] px-2 py-1 text-sm text-[#F2F7FC] outline-none"
          />
          <button
            type="submit"
            className="rounded p-1 text-[#F2F7FC]/70 hover:text-[#F2F7FC]"
            aria-label={t("save")}
          >
            <Check className="size-3.5" aria-hidden />
          </button>
        </form>
      </li>
    );
  }

  return (
    <li
      className={`group flex items-center gap-1 rounded-lg ${current ? "bg-[#1A5C8A]/40" : "hover:bg-[#1A5C8A]/20"}`}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-current={current ? "page" : undefined}
        className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm text-[#F2F7FC]/85"
        title={conversation.title}
      >
        {conversation.title}
      </button>
      {mode === "delete" ? (
        <span className="flex shrink-0 items-center gap-0.5 pr-1">
          <button
            type="button"
            onClick={onDelete}
            className="rounded px-1.5 py-0.5 text-xs text-[#F7A8A8] hover:bg-[#F7A8A8]/10"
          >
            {t("delete")}
          </button>
          <button
            type="button"
            onClick={() => setMode("view")}
            className="rounded p-1 text-[#F2F7FC]/60 hover:text-[#F2F7FC]"
            aria-label={t("cancel")}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ) : (
        <span className="flex shrink-0 items-center pr-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => {
              setTitle(conversation.title);
              setMode("rename");
            }}
            className="rounded p-1 text-[#F2F7FC]/60 hover:text-[#F2F7FC]"
            aria-label={t("rename")}
            title={t("rename")}
          >
            <Pencil className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setMode("delete")}
            className="rounded p-1 text-[#F2F7FC]/60 hover:text-[#F7A8A8]"
            aria-label={t("delete")}
            title={t("delete")}
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </span>
      )}
    </li>
  );
}
