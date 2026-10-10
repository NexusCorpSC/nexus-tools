"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Bot } from "lucide-react";

/** Le contenu du panneau, et l'AI SDK avec lui : chargés à la première ouverture. */
const ChatPanelBody = dynamic(
  () => import("@/components/chat/chat-panel-body"),
  { ssr: false },
);

/** Le panneau rouvre ouvert à la visite suivante s'il l'était. */
const STORAGE_KEY = "nexus-chat-panel";

/** En dessous, le panneau couvre la page : un lien suivi le referme. */
const NARROW_QUERY = "(max-width: 767px)";

/** Prévient les lecteurs de l'état du panneau, dans cet onglet. */
const CHANGE_EVENT = "nexus-chat-panel";

/**
 * L'état du panneau dans cet onglet (chaque onglet a le sien) :
 * - `never` : pas encore ouvert, rien n'est chargé ;
 * - `open` : ouvert ;
 * - `closed` : refermé, mais la conversation reste en vie, cachée — une
 *   réponse en cours va au bout et s'affiche à la réouverture.
 */
type PanelState = "never" | "open" | "closed";

let state: PanelState | null = null;

function readState(): PanelState {
  if (state === null) {
    try {
      state =
        window.localStorage.getItem(STORAGE_KEY) === "open" ? "open" : "never";
    } catch {
      state = "never";
    }
  }
  return state;
}

function writeOpen(open: boolean) {
  state = open ? "open" : readState() === "never" ? "never" : "closed";
  try {
    if (open) window.localStorage.setItem(STORAGE_KEY, "open");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Stockage indisponible (navigation privée…) : l'onglet s'en souvient.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/**
 * Nexus Chat dans un panneau latéral, ouvert par un bouton en bas à droite
 * de l'écran (la barre du haut défile avec la page, et elle est pleine). Il est
 * dans la mise en page racine : il reste ouvert, avec sa conversation, au fil
 * de la navigation. Sur grand écran la page se resserre à côté de lui
 * (`html[data-chat-panel]`, voir `globals.css`) ; en dessous il la couvre.
 *
 * Caché sur `/chat`, qui montre déjà le chat en grand.
 */
export function ChatPanel() {
  const t = useTranslations("Chat.panel");
  const pathname = usePathname();
  const panelState = useSyncExternalStore(subscribe, readState, () => "never");
  const onChatPage = pathname === "/chat";
  const shown = panelState === "open" && !onChatPage;

  useEffect(() => {
    const root = document.documentElement;
    if (shown) root.dataset.chatPanel = "open";
    else delete root.dataset.chatPanel;
    return () => {
      delete root.dataset.chatPanel;
    };
  }, [shown]);

  // Sous la barre du haut tant qu'elle est à l'écran (elle défile avec la
  // page), en haut de la fenêtre ensuite ; tout l'écran sur téléphone. Placé
  // avant d'être peint, pour ne pas passer une image sur la barre.
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const aside = panel.current;
    if (!shown || !aside) return;
    const narrow = window.matchMedia(NARROW_QUERY);
    let headerHeight = 0;
    const place = () => {
      const top = narrow.matches ? 0 : Math.max(0, headerHeight - scrollY);
      aside.style.top = `${top}px`;
    };
    const measure = () => {
      headerHeight = document.querySelector("header")?.offsetHeight ?? 0;
      place();
    };
    measure();
    // À la réouverture, la saisie reprend la main (à la première, la
    // conversation se charge et la prend d'elle-même).
    aside.querySelector("textarea")?.focus();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", measure);
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

  return (
    <>
      {!shown && !onChatPage && (
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
      {panelState !== "never" &&
        // Dans `body`, hors de la barre du haut : son `z-40` limiterait
        // celui du panneau.
        createPortal(
          <aside
            ref={panel}
            id="nexus-chat-panel"
            aria-label={t("title")}
            onClickCapture={onClickCapture}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                close();
              }
            }}
            className={`fixed top-0 right-0 bottom-0 z-50 w-full flex-col border-l border-[#9ED0FF]/15 bg-[#0B3A5A] shadow-2xl shadow-black/40 md:w-[400px] ${shown ? "flex" : "hidden"}`}
          >
            <ChatPanelBody onClose={close} />
          </aside>,
          document.body,
        )}
    </>
  );
}
