"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { addSeller, removeSeller, updateShopInfo } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── ShopInfoEditor ──────────────────────────────────────────────────────────

export function ShopInfoEditor({
  shopId,
  initialName,
  initialDescription,
}: {
  shopId: string;
  initialName: string;
  initialDescription: string;
}) {
  const t = useTranslations("ShopManagement");
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isDirty =
    name.trim() !== initialName || description.trim() !== initialDescription;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateShopInfo(shopId, name, description);
      if (result.success) {
        setSuccess(true);
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="shopName">{t("shopName")}</Label>
        <Input
          id="shopName"
          value={name}
          onChange={(e) => { setName(e.target.value); setSuccess(false); }}
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shopDescription">{t("shopDescription")}</Label>
        <Textarea
          id="shopDescription"
          value={description}
          onChange={(e) => { setDescription(e.target.value); setSuccess(false); }}
          rows={4}
          disabled={isPending}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{t("saveSuccess")}</p>}

      <Button type="submit" disabled={isPending || !isDirty || !name.trim()}>
        {isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

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

