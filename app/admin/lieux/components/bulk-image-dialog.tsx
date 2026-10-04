"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setPlacesImageAction } from "@/app/lieux/actions";
import { placeTrail } from "@/lib/place-icons";
import type { PlaceSummary } from "@/types/places";
import { SharedPlaceImageUpload } from "./place-image-upload";

/**
 * Pose une même image sur tous les lieux sélectionnés. L'image n'est envoyée
 * qu'une fois ; la confirmation liste les lieux touchés et dit lesquels
 * avaient déjà la leur, puisqu'elle sera remplacée.
 */
export function BulkImageDialog({
  open,
  onOpenChange,
  places,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  places: PlaceSummary[];
  onApplied: (slugs: string[], imageUrl: string) => void;
}) {
  const t = useTranslations("Places.Admin");
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [isApplying, setIsApplying] = useState(false);

  const replaced = places.filter((place) => place.imageUrl).length;

  async function apply() {
    if (!imageUrl) return;
    setIsApplying(true);
    try {
      const result = await setPlacesImageAction(
        places.map((place) => place.slug),
        imageUrl,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const missing = places.length - result.updated.length;
      toast.success(t("bulkApplied", { count: result.updated.length }), {
        description:
          missing > 0 ? t("bulkMissing", { count: missing }) : undefined,
      });
      setImageUrl(undefined);
      onApplied(result.updated, imageUrl);
      onOpenChange(false);
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !isApplying && onOpenChange(next)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("bulkTitle", { count: places.length })}</DialogTitle>
          <DialogDescription>
            {replaced > 0
              ? t("bulkReplaceWarning", { count: replaced })
              : t("bulkDescription")}
          </DialogDescription>
        </DialogHeader>

        <SharedPlaceImageUpload imageUrl={imageUrl} onChange={setImageUrl} />

        <ul className="max-h-60 divide-y divide-[#9ED0FF]/10 overflow-y-auto rounded-lg border border-[#9ED0FF]/15">
          {places.map((place) => (
            <li
              key={place.slug}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-nexus">
                  {place.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {placeTrail(place)}
                </span>
              </div>
              {place.imageUrl && (
                <span className="shrink-0 text-xs text-amber-300">
                  {t("bulkHasImage")}
                </span>
              )}
            </li>
          ))}
        </ul>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={isApplying}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button onClick={apply} disabled={!imageUrl || isApplying}>
            {isApplying
              ? t("saving")
              : t("bulkApply", { count: places.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
