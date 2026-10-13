"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  LockClosedIcon,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PlacePositionField,
  type PositionValue,
} from "@/app/admin/lieux/components/place-position-field";
import {
  DEFAULT_MARKER_COLOR,
  MARKER_COLORS,
  MARKER_KINDS,
  MAX_MARKER_COLLECTION_NAME_LENGTH,
  MAX_MARKER_NAME_LENGTH,
  MAX_MARKER_NOTE_LENGTH,
  type Marker,
  type MarkerCollection,
  type MarkerColor,
  type MarkerKind,
  type MarkerOrg,
} from "@/types/markers";
import { MarkerPin } from "./marker-pin";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Le message d'une réponse en erreur, traduit par son code. */
function useErrorText() {
  const t = useTranslations("Markers");
  return async (response: Response | null) => {
    const data = (await response?.json().catch(() => null)) as {
      error?: string;
    } | null;
    return t.has(`errors.${data?.error}`)
      ? t(`errors.${data?.error}` as "errors.invalidInput")
      : t("errors.unknown");
  };
}

/**
 * Ajouter un marqueur (en collant un relevé) ou modifier le sien : nom,
 * catégorie, collection, note et position.
 */
export function MarkerDialog({
  marker,
  collections,
  defaultCollectionId,
  systems,
  onClose,
  onSaved,
}: {
  /** Absent : on le crée. */
  marker?: Marker;
  /** Les siennes : on ne range pas un marqueur dans la collection d'un autre. */
  collections: MarkerCollection[];
  defaultCollectionId?: string;
  systems: { slug: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations("Markers");
  const errorText = useErrorText();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [name, setName] = useState(marker?.name ?? "");
  const [kind, setKind] = useState<MarkerKind>(marker?.kind ?? "ore");
  const [collectionId, setCollectionId] = useState(
    marker ? (marker.collectionId ?? "") : (defaultCollectionId ?? ""),
  );
  const [note, setNote] = useState(marker?.note ?? "");
  const [systemSlug, setSystemSlug] = useState(
    marker?.systemSlug ?? systems.find((s) => s.slug === "stanton")?.slug ?? "",
  );
  const [position, setPosition] = useState<PositionValue>(
    marker?.position ?? null,
  );

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!position || position === "invalid") {
      setError(t("errors.positionRequired"));
      return;
    }
    const moved =
      !marker ||
      JSON.stringify(position) !== JSON.stringify(marker.position) ||
      (!position.body && systemSlug !== marker.systemSlug);
    startTransition(async () => {
      const response = await fetch(
        marker ? `/api/marqueurs/${marker.id}` : "/api/marqueurs",
        {
          method: marker ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            kind,
            note,
            collectionId: collectionId || null,
            ...(moved ? { position, systemSlug, source: "paste" } : {}),
          }),
        },
      ).catch(() => null);
      if (!response?.ok) {
        setError(await errorText(response));
        return;
      }
      await onSaved();
      onClose();
    });
  };

  const remove = () =>
    startTransition(async () => {
      if (!marker) return;
      const response = await fetch(`/api/marqueurs/${marker.id}`, {
        method: "DELETE",
      }).catch(() => null);
      if (!response?.ok) {
        setError(await errorText(response));
        return;
      }
      await onSaved();
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MarkerPin
              color={
                collections.find((c) => c.id === collectionId)?.color ??
                DEFAULT_MARKER_COLOR
              }
              className="size-5"
            />
            {marker ? marker.name : t("addTitle")}
          </DialogTitle>
          {!marker && <DialogDescription>{t("addHint")}</DialogDescription>}
        </DialogHeader>

        <form id="marker-form" onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marker-name">{t("fieldName")}</Label>
              <Input
                id="marker-name"
                value={name}
                required
                maxLength={MAX_MARKER_NAME_LENGTH}
                placeholder={t("namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marker-kind">{t("fieldKind")}</Label>
              <select
                id="marker-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as MarkerKind)}
                className={SELECT}
              >
                {MARKER_KINDS.map((one) => (
                  <option key={one} value={one}>
                    {t(`kinds.${one}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marker-collection">{t("fieldCollection")}</Label>
              <select
                id="marker-collection"
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
                className={SELECT}
              >
                <option value="">{t("none")}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marker-note">
                {t("fieldNote")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("optional")}
                </span>
              </Label>
              <Textarea
                id="marker-note"
                value={note}
                maxLength={MAX_MARKER_NOTE_LENGTH}
                rows={3}
                placeholder={t("notePlaceholder")}
                onChange={(event) => setNote(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="marker-system">{t("fieldSystem")}</Label>
            <select
              id="marker-system"
              value={systemSlug}
              onChange={(event) => setSystemSlug(event.target.value)}
              className={SELECT}
            >
              {systems.map((system) => (
                <option key={system.slug} value={system.slug}>
                  {system.name}
                </option>
              ))}
            </select>
          </div>
          <PlacePositionField
            key={systemSlug}
            initial={
              marker && systemSlug === marker.systemSlug
                ? marker.position
                : undefined
            }
            systemSlug={systemSlug}
            required
            onChange={setPosition}
          />
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {marker ? (
            confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>{t("deleteConfirm")}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={remove}
                >
                  {t("delete")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t("cancel")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-300"
                  onClick={() => setConfirmDelete(true)}
                >
                  <TrashIcon className="size-4" />
                  {t("delete")}
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-[#c4b2ff]/45 bg-[#c4b2ff]/10 text-[#c4b2ff] hover:bg-[#c4b2ff]/20"
                >
                  <Link
                    href={`/lieux/proposer?prive=1&marqueur=${encodeURIComponent(marker.id)}`}
                  >
                    <LockClosedIcon className="size-4" />
                    {t("toPrivatePlace")}
                  </Link>
                </Button>
              </div>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={isPending} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              form="marker-form"
              disabled={isPending}
              className="bg-[#7ff0d0] font-semibold text-[#04261d] hover:bg-[#7ff0d0]/90"
            >
              {marker ? t("save") : t("addSubmit")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Créer, renommer, colorer, partager ou supprimer une de ses collections. */
export function CollectionDialog({
  collection,
  orgs,
  onClose,
  onSaved,
}: {
  collection?: MarkerCollection;
  orgs: MarkerOrg[];
  onClose: () => void;
  /** `removedId` : la collection supprimée. */
  onSaved: (removedId?: string) => Promise<void>;
}) {
  const t = useTranslations("Markers");
  const errorText = useErrorText();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [name, setName] = useState(collection?.name ?? "");
  const [color, setColor] = useState<MarkerColor>(
    collection?.color ?? MARKER_COLORS[1],
  );
  const [orgId, setOrgId] = useState(collection?.org?.id ?? "");
  // Une orga qu'il a quittée reste affichée tant qu'il ne change rien.
  const options =
    collection?.org && !orgs.some((org) => org.id === collection.org!.id)
      ? [...orgs, collection.org]
      : orgs;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch(
        collection
          ? `/api/marqueurs/collections/${collection.id}`
          : "/api/marqueurs/collections",
        {
          method: collection ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color, orgId: orgId || null }),
        },
      ).catch(() => null);
      if (!response?.ok) {
        setError(await errorText(response));
        return;
      }
      await onSaved();
      onClose();
    });
  };

  const remove = () =>
    startTransition(async () => {
      if (!collection) return;
      const response = await fetch(
        `/api/marqueurs/collections/${collection.id}`,
        { method: "DELETE" },
      ).catch(() => null);
      if (!response?.ok) {
        setError(await errorText(response));
        return;
      }
      await onSaved(collection.id);
      onClose();
    });

  const shareOption = (value: string, label: React.ReactNode) => (
    <label
      key={value || "me"}
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        orgId === value
          ? "border-[#c4b2ff] text-foreground"
          : "border-[#9ED0FF]/25 text-muted-foreground"
      }`}
    >
      <input
        type="radio"
        name="collection-share"
        value={value}
        checked={orgId === value}
        onChange={() => setOrgId(value)}
        className="accent-[#c4b2ff]"
      />
      {label}
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {collection
              ? t("collectionTitle", { name: collection.name })
              : t("newCollection")}
          </DialogTitle>
        </DialogHeader>
        <form id="collection-form" onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="collection-name">{t("fieldName")}</Label>
            <Input
              id="collection-name"
              value={name}
              required
              maxLength={MAX_MARKER_COLLECTION_NAME_LENGTH}
              placeholder={t("collectionPlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("fieldColor")}</legend>
            <div className="flex flex-wrap gap-2">
              {MARKER_COLORS.map((one) => (
                <label key={one} className="cursor-pointer">
                  <input
                    type="radio"
                    name="collection-color"
                    value={one}
                    checked={color === one}
                    onChange={() => setColor(one)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden
                    className="block size-7 rounded-full ring-offset-2 ring-offset-[#0e2c45] peer-checked:ring-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-[#9ed0ff]"
                    style={{
                      background: one,
                      ["--tw-ring-color" as string]: one,
                    }}
                  />
                  <span className="sr-only">{one}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2 rounded-xl border border-[#c4b2ff]/45 bg-[#c4b2ff]/5 p-3">
            <legend className="flex items-center gap-1.5 px-1 text-sm font-medium text-[#c4b2ff]">
              <UserGroupIcon className="size-4" />
              {t("shareTitle")}
            </legend>
            <div className="flex flex-wrap gap-2">
              {shareOption(
                "",
                <>
                  <LockClosedIcon className="size-4" />
                  {t("onlyMe")}
                </>,
              )}
              {options.map((org) =>
                shareOption(
                  org.id,
                  <>
                    <UserGroupIcon className="size-4" />
                    {org.name}
                    {org.tag && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {org.tag}
                      </span>
                    )}
                  </>,
                ),
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {options.length === 0 ? t("shareNoOrg") : t("shareHint")}
            </p>
          </fieldset>
        </form>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {collection ? (
            confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>{t("deleteCollectionConfirm")}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={remove}
                >
                  {t("delete")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                >
                  {t("cancel")}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-red-300"
                onClick={() => setConfirmDelete(true)}
              >
                <TrashIcon className="size-4" />
                {t("deleteCollection")}
              </Button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={isPending} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              form="collection-form"
              disabled={isPending}
              className="bg-[#7ff0d0] font-semibold text-[#04261d] hover:bg-[#7ff0d0]/90"
            >
              {t("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
