"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  GlobeAltIcon,
  PencilSquareIcon,
  TrashIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { POINTS } from "@/types/contributions";
import type { PrivatePlace } from "@/types/private-places";

/**
 * Les actions du créateur d'un lieu privé : le modifier, changer qui le voit,
 * le proposer au public, le supprimer.
 */
export function PrivatePlaceActions({ place }: { place: PrivatePlace }) {
  const t = useTranslations("PrivatePlaces");
  const [proposing, setProposing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const open =
    place.proposal?.status === "pending" ||
    place.proposal?.status === "changesRequested";

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/lieux/${place.slug}/modifier`}>
          <PencilSquareIcon className="size-4" />
          {t("edit")}
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={`/lieux/${place.slug}/modifier#partage`}>
          <UserGroupIcon className="size-4" />
          {t("share")}
        </Link>
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="border-[#c4b2ff]/45 bg-[#c4b2ff]/10 text-[#c4b2ff] hover:bg-[#c4b2ff]/20"
        onClick={() => setProposing(true)}
      >
        <GlobeAltIcon className="size-4" />
        {open ? t("proposeAgain") : t("propose")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="text-muted-foreground"
        onClick={() => setDeleting(true)}
        aria-label={t("delete")}
      >
        <TrashIcon className="size-4" />
      </Button>
      <ProposeDialog
        place={place}
        open={proposing}
        onOpenChange={setProposing}
      />
      <DeleteDialog place={place} open={deleting} onOpenChange={setDeleting} />
    </div>
  );
}

function ProposeDialog({
  place,
  open,
  onOpenChange,
}: {
  place: PrivatePlace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("PrivatePlaces");
  const tPlaces = useTranslations("Places");
  const router = useRouter();
  const [withPosition, setWithPosition] = useState(true);
  const [withImage, setWithImage] = useState(true);
  const [withDescription, setWithDescription] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const send = () =>
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/lieux/prives/${place.slug}/proposer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withPosition, withImage, withDescription }),
      }).catch(() => null);
      if (!response?.ok) {
        const data = (await response?.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          t.has(`errors.${data?.error}`)
            ? t(`errors.${data?.error}` as "errors.invalidInput")
            : t("errors.unknown"),
        );
        return;
      }
      const result = (await response.json()) as {
        contribution: { status: string; target: { slug: string } };
      };
      onOpenChange(false);
      // Publiée d'emblée : le lieu privé n'existe plus, sa fiche publique oui.
      if (result.contribution.status === "published") {
        router.push(`/lieux/${result.contribution.target.slug}`);
      }
      router.refresh();
    });

  const rows: [string, string, boolean][] = [
    [t("proposeName"), place.name, true],
    [t("proposeType"), tPlaces(`types.${place.type}`), true],
    [t("proposeParent"), place.parentName ?? place.parentSlug, true],
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("proposeTitle", { name: place.name })}</DialogTitle>
          <DialogDescription>{t("proposeIntro")}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-3 py-2.5 text-sm">
          <span className="rounded-full border border-amber-300/55 bg-amber-300/15 px-2 font-mono text-[11px] font-bold text-amber-200">
            +{POINTS.placeCreate}
          </span>
          <span>{t("proposeNotice", { points: POINTS.placeCreate })}</span>
        </div>

        <dl className="divide-y divide-[#9ED0FF]/15 rounded-lg border border-[#9ED0FF]/15 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-3 px-3 py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2 text-sm">
          {place.position && (
            <Check
              checked={withPosition}
              onChange={setWithPosition}
              label={t("proposeWithPosition")}
            />
          )}
          {place.image && (
            <Check
              checked={withImage}
              onChange={setWithImage}
              label={t("proposeWithImage")}
            />
          )}
          {place.description && (
            <Check
              checked={withDescription}
              onChange={setWithDescription}
              label={t("proposeWithDescription")}
              hint={t("proposeDescriptionHint")}
            />
          )}
        </div>

        <ul className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <li className="rounded-lg border border-[#9ED0FF]/15 p-2.5">
            <b className="block text-[13px] text-foreground">
              {t("stepPendingTitle")}
            </b>
            {t("stepPending")}
          </li>
          <li className="rounded-lg border border-[#9ED0FF]/15 p-2.5">
            <b className="block text-[13px] text-foreground">
              {t("stepPublishedTitle")}
            </b>
            {t("stepPublished")}
          </li>
          <li className="rounded-lg border border-[#9ED0FF]/15 p-2.5">
            <b className="block text-[13px] text-foreground">
              {t("stepRejectedTitle")}
            </b>
            {t("stepRejected")}
          </li>
        </ul>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button disabled={isPending} onClick={send}>
            {isPending ? t("sending") : t("proposeSend")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Check({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 accent-[#c4b2ff]"
      />
      <span>
        {label}
        {hint && (
          <span className="block text-xs text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

function DeleteDialog({
  place,
  open,
  onOpenChange,
}: {
  place: PrivatePlace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("PrivatePlaces");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remove = () =>
    startTransition(async () => {
      setError(null);
      const response = await fetch(`/api/lieux/prives/${place.slug}`, {
        method: "DELETE",
      }).catch(() => null);
      if (!response?.ok) {
        setError(t("errors.unknown"));
        return;
      }
      onOpenChange(false);
      router.push("/lieux?visibilite=prives");
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("deleteTitle", { name: place.name })}</DialogTitle>
          <DialogDescription>{t("deleteHint")}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            {t("cancel")}
          </Button>
          <Button variant="destructive" disabled={isPending} onClick={remove}>
            {t("deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
