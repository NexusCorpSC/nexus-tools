"use client";

import {
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DateTime } from "luxon";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MarkdownContent } from "@/components/markdown-content";
import { cn } from "@/lib/utils";
import { saveNoteAction } from "@/app/notes/actions";
import { Note, NOTE_CONTENT_MAX_LENGTH } from "@/types/notes";

// Delay before edits are persisted automatically
const AUTOSAVE_DELAY_MS = 1200;

type SaveStatus = "idle" | "saving" | "saved" | "error";

const subscribeToNothing = () => () => {};

// Relative dates depend on the current time and time zone: render them on the
// client only, so server and client markup stay identical during hydration.
function LastUpdated({ iso }: { iso: string | null }) {
  const t = useTranslations("Notes");
  const locale = useLocale();
  const isHydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  if (!isHydrated || !iso) {
    return null;
  }

  const time = DateTime.fromISO(iso).setLocale(locale).toRelative();

  if (!time) {
    return null;
  }

  return <>{t("lastUpdated", { time })}</>;
}

interface NoteEditorProps {
  initialNote: Note;
  autoFocus?: boolean;
  className?: string;
  textareaClassName?: string;
  // Filled by the editor so parents can persist pending edits before unmounting
  flushRef?: RefObject<(() => Promise<void>) | null>;
}

export function NoteEditor({
  initialNote,
  autoFocus = false,
  className,
  textareaClassName,
  flushRef,
}: NoteEditorProps) {
  const t = useTranslations("Notes");

  const [note, setNote] = useState<Note>(initialNote);
  const [content, setContent] = useState(initialNote.content);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [isPreview, setIsPreview] = useState(false);

  const isDirty = content !== note.content;

  const save = useCallback(
    async (value: string) => {
      setStatus("saving");

      try {
        const saved = await saveNoteAction(value);

        setNote(saved);
        setStatus("saved");
      } catch (error) {
        setStatus("error");
        toast.error(t("saveErrorTitle"), {
          description:
            error instanceof Error ? error.message : t("saveErrorDescription"),
        });
      }
    },
    [t],
  );

  // Keep the latest values around so pending saves always flush current content
  const contentRef = useRef(content);
  const isDirtyRef = useRef(isDirty);

  useEffect(() => {
    contentRef.current = content;
    isDirtyRef.current = isDirty;
  }, [content, isDirty]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const timeout = setTimeout(() => {
      void save(contentRef.current);
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timeout);
  }, [content, isDirty, save]);

  useEffect(() => {
    if (!flushRef) {
      return;
    }

    flushRef.current = async () => {
      if (isDirtyRef.current) {
        await save(contentRef.current);
      }
    };

    return () => {
      flushRef.current = null;
    };
  }, [flushRef, save]);

  // Persist pending edits when the editor goes away (panel closed, navigation)
  useEffect(() => {
    return () => {
      if (isDirtyRef.current) {
        void save(contentRef.current);
      }
    };
  }, [save]);

  const statusLabel = isDirty
    ? t("statusUnsaved")
    : status === "saving"
      ? t("statusSaving")
      : status === "error"
        ? t("statusError")
        : status === "saved"
          ? t("statusSaved")
          : null;

  return (
    <div className={cn("flex min-h-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-[#9ED0FF]/55">
          <LastUpdated iso={note.updatedAt} />
        </span>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPreview((previous) => !previous)}
          >
            {isPreview ? t("edit") : t("preview")}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => save(content)}
            disabled={!isDirty || status === "saving"}
          >
            {status === "saving" ? t("saving") : t("save")}
          </Button>
        </div>
      </div>

      {isPreview ? (
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-md border border-[#9ED0FF]/20 bg-[#0B3A5A]/40 p-3",
            textareaClassName,
          )}
        >
          {content.trim() ? (
            <MarkdownContent content={content} />
          ) : (
            <p className="text-sm text-[#9ED0FF]/60">{t("emptyPreview")}</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={NOTE_CONTENT_MAX_LENGTH}
          placeholder={t("contentPlaceholder")}
          aria-label={t("title")}
          autoFocus={autoFocus}
          className={cn(
            "min-h-0 flex-1 resize-none rounded-md border border-[#9ED0FF]/20 bg-[#0B3A5A]/40 p-3 font-mono text-sm text-[#CCE7FF] outline-none placeholder:text-[#9ED0FF]/45 focus:border-[#9ED0FF]/50",
            textareaClassName,
          )}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9ED0FF]/55">
        <span aria-live="polite">{statusLabel}</span>
        <span>
          {t("characters", {
            count: content.length,
            max: NOTE_CONTENT_MAX_LENGTH,
          })}
        </span>
      </div>
    </div>
  );
}
