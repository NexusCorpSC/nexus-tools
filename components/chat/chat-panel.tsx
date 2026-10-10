"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";

/** Le contenu du panneau, et l'AI SDK avec lui : chargés à la première ouverture. */
const ChatPanelBody = dynamic(
  () => import("@/components/chat/chat-panel-body"),
  { ssr: false },
);

/** Le panneau reste ouvert d'une page à l'autre, et d'une visite à l'autre. */
const STORAGE_KEY = "nexus-chat-panel";

/** En dessous, le panneau couvre la page : un lien suivi le referme. */
const NARROW_QUERY = "(max-width: 767px)";

/** Prévient les lecteurs de `STORAGE_KEY` dans cet onglet. */
const CHANGE_EVENT = "nexus-chat-panel";

/** Le choix du joueur, gardé en mémoire si le stockage l'est aussi. */
let fallback = false;

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "open";
  } catch {
    return fallback;
  }
}

function writeOpen(open: boolean) {
  fallback = open;
  try {
    if (open) window.localStorage.setItem(STORAGE_KEY, "open");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée…) : `fallback` suffit.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Nexus Chat dans un panneau latéral, ouvert par un bouton en bas à droite
 * de l'écran (la barre du haut défile avec la page, et elle est pleine). Il est
 * dans la mise en page racine : il reste ouvert, avec sa conversation, au fil
 * de la navigation. Sur grand écran la page se resserre à côté de lui
 * (`html[data-chat-panel]`, voir `globals.css`) ; en dessous il la couvre.
 *
 * Il n'apparaît pas sur `/chat`, qui montre déjà le chat en grand.
 */
export function ChatPanel() {
  const t = useTranslations("Chat.panel");
  const pathname = usePathname();
  const open = useSyncExternalStore(subscribe, readOpen, () => false);
  const onChatPage = pathname === "/chat";
  const shown = open && !onChatPage;

  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.chatPanel = "open";
    else delete root.dataset.chatPanel;
    return () => {
      delete root.dataset.chatPanel;
    };
  }, [shown]);

  // Sous la barre du haut tant qu'elle est à l'écran (elle défile avec la
  // page), en haut de la fenêtre ensuite ; tout l'écran sur téléphone.
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const aside = panel.current;
    const header = aside?.closest("header");
    if (!shown || !aside || !header) return;
    const place = () => {
      const below = window.matchMedia(NARROW_QUERY).matches
        ? 0
        : Math.max(0, header.getBoundingClientRect().bottom);
      aside.style.top = `${below}px`;
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [shown]);

  const openPanel = useCallback(() => writeOpen(true), []);
  const close = useCallback(() => writeOpen(false), []);

  // Sur téléphone, suivre un lien vers une page du site montre la page.
  const onClickCapture = useCallback(
    (event: React.MouseEvent) => {
      const link = (event.target as Element).closest("a[href^='/']");
      // Après le clic : le lien doit encore être là pour naviguer sans
      // recharger la page.
      if (link && window.matchMedia(NARROW_QUERY).matches) setTimeout(close);
    },
    [close],
  );

  if (onChatPage) return null;

  return (
    <>
      {!shown && (
        <button
          type="button"
          onClick={openPanel}
          aria-controls="nexus-chat-panel"
          aria-expanded={false}
          aria-label={t("open")}
          title={t("open")}
          data-chat-launcher
          className="fixed right-4 bottom-4 z-40 flex size-12 items-center justify-center rounded-full border border-[#9ED0FF]/30 bg-[#0B3A5A] text-[#CCE7FF] shadow-xl shadow-black/40 hover:border-[#9ED0FF]/60 hover:bg-[#124A70] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60 sm:right-6 sm:bottom-6"
        >
          <Bot aria-hidden="true" className="size-6" />
        </button>
      )}
      {shown && (
        <aside
          ref={panel}
          id="nexus-chat-panel"
          aria-label={t("title")}
          onClickCapture={onClickCapture}
          className="fixed top-0 right-0 bottom-0 z-50 flex w-full flex-col border-l border-[#9ED0FF]/15 bg-[#0B3A5A] shadow-2xl shadow-black/40 md:w-[400px]"
        >
          <ChatPanelBody onClose={close} />
        </aside>
      )}
    </>
  );
}
