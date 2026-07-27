"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  MissionObjective,
  objectivesToQuickEntry,
  parseMissionText,
} from "@/lib/mission-objectives";

interface ScreenshotImportDialogProps {
  /** Receives the quick entry rows built from the objectives. */
  onImport: (quickEntry: string) => void;
}

type Status = "idle" | "reading" | "done" | "error";

export default function ScreenshotImportDialog({
  onImport,
}: ScreenshotImportDialogProps) {
  const t = useTranslations("Cargo");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [objectives, setObjectives] = useState<MissionObjective[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setStatus("idle");
    setProgress(0);
    setError(null);
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setText("");
    setObjectives([]);
    setIgnored([]);
  }

  const readImage = useCallback(async (file: File) => {
    setStatus("reading");
    setProgress(0);
    setError(null);
    setText("");
    setObjectives([]);
    setIgnored([]);
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return URL.createObjectURL(file);
    });

    try {
      // Loaded on demand: the OCR engine is far too heavy for the page bundle.
      const { createWorker } = await import("tesseract.js");

      const worker = await createWorker("eng", 1, {
        logger: (message: { status: string; progress: number }) => {
          if (message.status === "recognizing text") {
            setProgress(Math.round(message.progress * 100));
          }
        },
      });

      try {
        const { data } = await worker.recognize(file);
        const parsed = parseMissionText(data.text);

        setText(data.text);
        setObjectives(parsed.objectives);
        setIgnored(parsed.ignored);
        setStatus("done");
      } finally {
        await worker.terminate();
      }
    } catch (cause) {
      console.error(cause);
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    }
  }, []);

  // Ctrl+V of a screenshot, which is how the game capture usually arrives.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onPaste = (event: ClipboardEvent) => {
      const file = [...(event.clipboardData?.items ?? [])]
        .filter((item) => item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .find((item): item is File => item !== null);

      if (file) {
        event.preventDefault();
        void readImage(file);
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, readImage]);

  const quickEntry = objectivesToQuickEntry(objectives);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <PhotoIcon className="h-4 w-4" />
          {t("screenshotImport")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("screenshotImport")}</DialogTitle>
          <DialogDescription>
            {t("screenshotImportDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files[0];
              if (file?.type.startsWith("image/")) {
                void readImage(file);
              }
            }}
            className="rounded-lg border border-dashed border-[#9ED0FF]/30 bg-[#0B3A5A]/40 p-4 text-center"
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void readImage(file);
                }
                event.target.value = "";
              }}
            />

            <p className="text-sm text-[#9ED0FF]/80">{t("screenshotDrop")}</p>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => inputRef.current?.click()}
              disabled={status === "reading"}
            >
              {t("screenshotChoose")}
            </Button>
          </div>

          {preview && (
            // eslint-disable-next-line @next/next/no-img-element -- local blob
            <img
              src={preview}
              alt=""
              className="max-h-40 w-full rounded-md object-contain"
            />
          )}

          {status === "reading" && (
            <p className="text-sm text-[#9ED0FF]/80">
              {t("screenshotReading", { progress })}
            </p>
          )}

          {status === "error" && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {t("screenshotError")}
              {error ? ` (${error})` : ""}
            </p>
          )}

          {status === "done" && (
            <>
              <div className="space-y-1">
                <Label htmlFor="screenshot-ocr">{t("screenshotRawText")}</Label>
                <Textarea
                  id="screenshot-ocr"
                  readOnly
                  rows={7}
                  value={text}
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              </div>

              <div className="space-y-1">
                <p className="text-sm">
                  {t("screenshotObjectives", { count: objectives.length })}
                  {ignored.length > 0 && (
                    <span className="ml-2 text-amber-300">
                      {t("screenshotIgnored", { count: ignored.length })}
                    </span>
                  )}
                </p>

                {objectives.length > 0 && (
                  <pre className="max-h-32 overflow-auto rounded-md bg-[#0B3A5A]/60 px-3 py-2 font-mono text-xs text-[#C9E4FF]">
                    {quickEntry}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={objectives.length === 0}
            onClick={() => {
              onImport(quickEntry);
              setOpen(false);
              reset();
            }}
          >
            {t("screenshotFill", { count: objectives.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
