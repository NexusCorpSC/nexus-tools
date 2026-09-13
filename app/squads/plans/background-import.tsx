"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { upload } from "@vercel/blob/client";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PLAN_BACKGROUND_MAX_BYTES } from "@/types/plan";

/**
 * The image the plan is drawn on: a scan, a star map, a screenshot of the
 * station.
 *
 * Two ways in, and the second is the one people use. **Paste** — `Ctrl+V` with
 * a screenshot on the clipboard — is what somebody who has just alt-tabbed out
 * of the game reaches for, and it costs one listener. The file picker is there
 * for everything else.
 *
 * The upload goes straight to the blob store with a token from
 * `…/background/upload`; the URL and the image's own size are written onto the
 * plan afterwards, because `onUploadCompleted` does not fire on a developer's
 * machine and the picture's dimensions are something only the browser that
 * loaded it knows.
 */
export function BackgroundImport({
  planId,
  squadId,
  hasBackground,
  busy,
  onDone,
  children,
}: {
  planId: string;
  squadId: string | null;
  hasBackground: boolean;
  busy: boolean;
  onDone: (
    background: { url: string; width: number; height: number } | null,
  ) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("Plans");
  const picker = useRef<HTMLInputElement | null>(null);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (file: File) => {
      if (file.size > PLAN_BACKGROUND_MAX_BYTES) {
        toast.error(t("backgroundTooBig"));
        return;
      }

      setSending(true);

      try {
        const measured = await measure(file);
        const extension = extensionOf(file);

        const blob = await upload(
          `plans/${planId}/background.${extension}`,
          file,
          {
            access: "public",
            handleUploadUrl: `/api/squads/plans/${planId}/background/upload${
              squadId ? `?squad=${encodeURIComponent(squadId)}` : ""
            }`,
          },
        );

        onDone({ url: blob.url, width: measured.width, height: measured.height });
      } catch (error) {
        toast.error(t("errorTitle"), {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setSending(false);
      }
    },
    [onDone, planId, squadId, t],
  );

  /** A screenshot straight off the clipboard, which is how this gets used. */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      // Not while somebody is typing a phase name into a field.
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;

      const file = [...(event.clipboardData?.items ?? [])]
        .find((item) => item.type.startsWith("image/"))
        ?.getAsFile();

      if (!file) return;

      event.preventDefault();
      void send(file);
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [send]);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy || sending}
        title={t("backgroundHint")}
        onClick={() => {
          if (hasBackground) {
            onDone(null);
            return;
          }

          picker.current?.click();
        }}
      >
        {sending ? <Loader2 className="animate-spin" /> : children}
      </Button>

      <input
        ref={picker}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void send(file);
        }}
      />
    </>
  );
}

/** The picture's own size, which the canvas needs to frame it before it loads. */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unreadable image"));
    };

    image.src = url;
  });
}

function extensionOf(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}
