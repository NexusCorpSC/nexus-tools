"use client";

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
} from "@/components/ui/dialog";
import { CargoLine, MAX_VOLUME } from "@/lib/cargo";
import { NewCargoLine } from "./add-line-form";

interface EditLineDialogProps {
  line: CargoLine | null;
  onClose: () => void;
  onSave: (id: string, values: NewCargoLine) => void;
}

export default function EditLineDialog({
  line,
  onClose,
  onSave,
}: EditLineDialogProps) {
  const t = useTranslations("Cargo");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!line) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const volume = Math.floor(Number(formData.get("volume")));

    if (!Number.isFinite(volume) || volume < 1 || volume > MAX_VOLUME) {
      return;
    }

    onSave(line.id, {
      destination: String(formData.get("destination") ?? "").trim(),
      content: String(formData.get("content") ?? "").trim(),
      location: String(formData.get("location") ?? "").trim(),
      mission: String(formData.get("mission") ?? "").trim(),
      volume,
    });
  }

  return (
    <Dialog
      open={line !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editLine")}</DialogTitle>
          <DialogDescription>{t("editLineDescription")}</DialogDescription>
        </DialogHeader>

        {line && (
          // Remounting per line keeps the uncontrolled defaults in sync.
          <form key={line.id} onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="edit-destination">{t("destination")}</Label>
                <Input
                  id="edit-destination"
                  name="destination"
                  defaultValue={line.destination}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-content">{t("content")}</Label>
                <Input
                  id="edit-content"
                  name="content"
                  defaultValue={line.content}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-volume">{t("volume")}</Label>
                <Input
                  id="edit-volume"
                  name="volume"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_VOLUME}
                  step={1}
                  defaultValue={line.volume}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-location">{t("location")}</Label>
                <Input
                  id="edit-location"
                  name="location"
                  defaultValue={line.location}
                />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="edit-mission">{t("mission")}</Label>
                <Input
                  id="edit-mission"
                  name="mission"
                  defaultValue={line.mission}
                />
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button type="submit">{t("saveChanges")}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
