"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { NoteEditor } from "@/components/note-editor";
import { getNoteAction } from "@/app/notes/actions";
import { Note } from "@/types/notes";

// Keyboard shortcut opening/closing the scratch pad from anywhere
const SHORTCUT_CODE = "KeyN";

export function ScratchPadPanel() {
  const t = useTranslations("Notes");

  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Filled by the editor, lets us persist pending edits before closing
  const flushRef = useRef<(() => Promise<void>) | null>(null);

  const open = useCallback(async () => {
    setIsOpen(true);
    setIsLoading(true);

    try {
      // Always read the freshest content, the note may have been edited
      // from the full page view or from another device.
      setNote(await getNoteAction());
    } catch (error) {
      setIsOpen(false);
      toast.error(t("loadErrorTitle"), {
        description:
          error instanceof Error ? error.message : t("loadErrorDescription"),
      });
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const close = useCallback(async () => {
    await flushRef.current?.();
    setIsOpen(false);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.code !== SHORTCUT_CODE ||
        !event.altKey ||
        event.ctrlKey ||
        event.metaKey
      ) {
        return;
      }

      event.preventDefault();

      if (isOpen) {
        void close();
      } else {
        void open();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, open, close]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        title={`${t("open")} (${t("shortcut")})`}
        className="relative shrink-0 rounded-full border border-[#9ED0FF]/20 bg-[#0B3A5A]/60 p-1 text-[#9ED0FF] hover:border-[#9ED0FF]/40 hover:text-[#CCE7FF] focus:outline-hidden focus:ring-2 focus:ring-[#9ED0FF]/60 focus:ring-offset-2 focus:ring-offset-[#06243A]"
      >
        <span className="absolute -inset-1.5" />
        <span className="sr-only">{t("open")}</span>
        <PencilSquareIcon aria-hidden="true" className="h-6 w-6" />
      </button>

      <Dialog open={isOpen} onClose={close} className="relative z-50">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-300 data-closed:opacity-0"
        />

        <div className="fixed inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <DialogPanel
              transition
              className="pointer-events-auto flex w-screen max-w-md transform flex-col border-l border-[#9ED0FF]/20 bg-[#06243A] shadow-xl shadow-black/40 transition duration-300 ease-in-out data-closed:translate-x-full"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[#9ED0FF]/15 px-4 py-3">
                <DialogTitle className="text-base font-semibold text-[#CCE7FF]">
                  {t("title")}
                </DialogTitle>

                <div className="flex items-center gap-1">
                  <span className="hidden text-xs text-[#9ED0FF]/50 sm:inline">
                    {t("shortcut")}
                  </span>

                  <Link
                    href="/notes"
                    onClick={() => void close()}
                    title={t("openFullPage")}
                    className="rounded-lg p-1.5 text-[#9ED0FF]/75 hover:bg-[#9ED0FF]/10 hover:text-[#CCE7FF]"
                  >
                    <span className="sr-only">{t("openFullPage")}</span>
                    <ArrowTopRightOnSquareIcon
                      aria-hidden="true"
                      className="h-5 w-5"
                    />
                  </Link>

                  <button
                    type="button"
                    onClick={() => void close()}
                    title={t("close")}
                    className="rounded-lg p-1.5 text-[#9ED0FF]/75 hover:bg-[#9ED0FF]/10 hover:text-[#CCE7FF]"
                  >
                    <span className="sr-only">{t("close")}</span>
                    <XMarkIcon aria-hidden="true" className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col p-4">
                {isLoading || !note ? (
                  <p className="text-sm text-[#9ED0FF]/60">{t("loading")}</p>
                ) : (
                  <NoteEditor
                    initialNote={note}
                    autoFocus
                    flushRef={flushRef}
                    className="flex-1"
                  />
                )}
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </>
  );
}
