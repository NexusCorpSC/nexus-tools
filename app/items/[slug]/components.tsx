"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteItemAction } from "@/app/items/actions";

/** Edit/delete menu shown on an item page to whoever can edit the catalogue. */
export function ItemAdminMenu({ slug }: { slug: string }) {
  const t = useTranslations("Items.Admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    const result = await deleteItemAction(slug);
    if (!result.ok) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    router.push("/items");
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        aria-label={t("menuLabel")}
        onClick={() => setOpen((value) => !value)}
        className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
      >
        <EllipsisVerticalIcon className="size-5" />
      </button>

      {open && (
        <>
          {/* Overlay to close on outside click */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg border border-[#9ED0FF]/20 shadow-md py-1 bg-nexus-bg">
            <Link
              href={`/admin/items/${slug}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-white/10 transition-colors"
              onClick={() => setOpen(false)}
            >
              <PencilIcon className="size-4" />
              {t("edit")}
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <TrashIcon className="size-4" />
              {t("delete")}
            </button>
          </div>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                {t("deleteConfirmCancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "…" : t("deleteConfirmConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
