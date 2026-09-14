"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  EllipsisVerticalIcon,
  MapIcon,
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
import { deletePlaceAction } from "@/app/lieux/actions";

/** Le menu d'édition d'une fiche, réservé à qui peut tenir le catalogue. */
export function PlaceAdminMenu({ slug }: { slug: string }) {
  const t = useTranslations("Places.Admin");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    const result = await deletePlaceAction(slug);
    if (!result.ok) {
      setError(result.error);
      setIsDeleting(false);
      return;
    }

    router.push("/lieux");
    router.refresh();
  };

  return (
    <div className="relative">
      <button
        aria-label={t("menuLabel")}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md p-1.5 transition-colors hover:bg-white/10"
      >
        <EllipsisVerticalIcon className="size-5" />
      </button>

      {open && (
        <>
          {/* Overlay to close on outside click */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-[#9ED0FF]/20 bg-nexus-bg py-1 shadow-md">
            <Link
              href={`/admin/lieux/${slug}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <PencilIcon className="size-4" />
              {t("edit")}
            </Link>
            <Link
              href={`/admin/lieux/${slug}/plans`}
              className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-white/10"
              onClick={() => setOpen(false)}
            >
              <MapIcon className="size-4" />
              {t("editPlans")}
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-500 transition-colors hover:bg-red-500/10"
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
