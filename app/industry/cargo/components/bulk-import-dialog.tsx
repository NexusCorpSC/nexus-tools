"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
import { ParsedBulkLine } from "@/lib/cargo";
import { parseQuickEntry } from "@/lib/mission-objectives";

interface BulkImportDialogProps {
  onImport: (lines: ParsedBulkLine[]) => void;
}

export default function BulkImportDialog({ onImport }: BulkImportDialogProps) {
  const t = useTranslations("Cargo");
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");

  const { parsed, invalid } = parseQuickEntry(raw);

  function handleImport() {
    if (parsed.length === 0) {
      return;
    }

    onImport(parsed);
    setRaw("");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setRaw("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          {t("bulkImport")}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("bulkImport")}</DialogTitle>
          <DialogDescription>{t("bulkDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <code className="block rounded-md bg-[#0B3A5A]/60 px-3 py-2 text-xs text-[#9ED0FF]">
            {t("bulkFormat")}
          </code>

          <Textarea
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={10}
            spellCheck={false}
            className="font-mono text-sm"
            placeholder={t("bulkPlaceholder")}
          />

          <div className="flex flex-wrap gap-x-4 text-xs">
            <span className="text-[#9ED0FF]/80">
              {t("bulkReady", { count: parsed.length })}
            </span>
            {invalid.length > 0 && (
              <span className="text-red-400">
                {t("bulkInvalid", { count: invalid.length })}
              </span>
            )}
          </div>

          {invalid.length > 0 && (
            <ul className="max-h-24 space-y-0.5 overflow-y-auto rounded-md bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
              {invalid.slice(0, 10).map((line, index) => (
                <li key={`${line}-${index}`} className="truncate">
                  {line}
                </li>
              ))}
            </ul>
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
            onClick={handleImport}
            disabled={parsed.length === 0}
          >
            {t("bulkConfirm", { count: parsed.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
