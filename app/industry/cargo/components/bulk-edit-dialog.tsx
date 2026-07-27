"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { BulkLineChanges } from "@/lib/cargo";

type Field = keyof BulkLineChanges;

const FIELDS: Field[] = ["destination", "content", "location", "mission"];

interface BulkEditDialogProps {
  /** Lines currently displayed, which is what the edit applies to. */
  targetCount: number;
  onApply: (changes: BulkLineChanges) => void;
}

export default function BulkEditDialog({
  targetCount,
  onApply,
}: BulkEditDialogProps) {
  const t = useTranslations("Cargo");
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState<Record<Field, boolean>>({
    destination: false,
    content: false,
    location: false,
    mission: false,
  });
  const [values, setValues] = useState<Record<Field, string>>({
    destination: "",
    content: "",
    location: "",
    mission: "",
  });

  function reset() {
    setEnabled({
      destination: false,
      content: false,
      location: false,
      mission: false,
    });
    setValues({ destination: "", content: "", location: "", mission: "" });
  }

  const changes: BulkLineChanges = {};
  for (const field of FIELDS) {
    if (enabled[field]) {
      changes[field] = values[field].trim();
    }
  }

  // Destination anchors every row, so it cannot be blanked out in bulk.
  const isValid =
    Object.keys(changes).length > 0 &&
    (!enabled.destination || values.destination.trim() !== "");

  function handleApply() {
    if (!isValid) {
      return;
    }

    onApply(changes);
    reset();
    setOpen(false);
  }

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
        <Button type="button" variant="outline" disabled={targetCount === 0}>
          {t("bulkEdit")}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("bulkEdit")}</DialogTitle>
          <DialogDescription>
            {t("bulkEditDescription", { count: targetCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {FIELDS.map((field) => (
            <div key={field} className="space-y-1">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`bulk-edit-${field}-enabled`}
                  checked={enabled[field]}
                  onChange={(event) =>
                    setEnabled((current) => ({
                      ...current,
                      [field]: event.target.checked,
                    }))
                  }
                  className="size-4 rounded border-[#9ED0FF]/40 bg-transparent"
                />
                <Label htmlFor={`bulk-edit-${field}-enabled`}>{t(field)}</Label>
              </div>

              <Input
                aria-label={t(field)}
                value={values[field]}
                disabled={!enabled[field]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field]: event.target.value,
                  }))
                }
                placeholder={
                  enabled[field]
                    ? t("bulkEditClearHint")
                    : t("bulkEditUnchanged")
                }
              />
            </div>
          ))}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button type="button" onClick={handleApply} disabled={!isValid}>
            {t("bulkEditApply", { count: targetCount })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
