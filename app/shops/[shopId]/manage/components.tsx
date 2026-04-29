"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addSeller, removeSeller } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── AddSellerModal ─────────────────────────────────────────────────────────

export function AddSellerButton({ shopId }: { shopId: string }) {
  const t = useTranslations("ShopManagement");
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    setUserId("");
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await addSeller(shopId, userId.trim());
      if (result.success) {
        setOpen(false);
        setUserId("");
      } else {
        setError(
          result.message
            ? t(`errors.${result.message}` as Parameters<typeof t>[0])
            : t("errors.error"),
        );
      }
    });
  }

  return (
    <>
      <Button onClick={handleOpen}>{t("addSeller")}</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("addSellerTitle")}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="userId">{t("addSellerUserIdLabel")}</Label>
              <Input
                id="userId"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder={t("addSellerUserIdPlaceholder")}
                required
                disabled={isPending}
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={isPending || !userId.trim()}>
                {isPending ? t("adding") : t("addSellerConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── RemoveSellerButton ──────────────────────────────────────────────────────

export function RemoveSellerButton({
  shopId,
  sellerId,
}: {
  shopId: string;
  sellerId: string;
}) {
  const t = useTranslations("ShopManagement");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeSeller(shopId, sellerId);
      if (!result.success) {
        setError(
          result.message
            ? t(`errors.${result.message}` as Parameters<typeof t>[0])
            : t("errors.error"),
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="destructive"
        onClick={handleRemove}
        disabled={isPending}
      >
        {isPending ? t("removing") : t("removeSeller")}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

