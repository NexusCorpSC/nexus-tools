"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { upload } from "@vercel/blob/client";
import { LockClosedIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlacePicker } from "@/app/lieux/place-picker";
import {
  PlacePositionField,
  type PositionValue,
} from "@/app/admin/lieux/components/place-position-field";
import {
  ProposedPlaceImage,
  type ProposedImage,
} from "@/app/admin/lieux/components/proposed-place-image";
import { blobName } from "@/app/lieux/[slug]/gallery";
import { MAX_PLACE_NAME_LENGTH } from "@/types/places";
import {
  MAX_PRIVATE_PLACE_DESCRIPTION_LENGTH,
  PRIVATE_PLACE_TYPES,
  type PrivatePlace,
  type PrivatePlaceType,
} from "@/types/private-places";

export type OrgOption = { id: string; name: string; tag?: string };

/**
 * Le formulaire d'un lieu privé, à la création comme à la modification : les
 * champs d'un lieu proposé, sans relecture, et « qui le voit ». Le parent est
 * toujours un lieu public, l'image part sous `prives/`.
 */
export function PrivatePlaceForm({
  place,
  orgs,
  initialParent,
  initialName,
  fromLocationId,
}: {
  /** Absent : on le crée. */
  place?: PrivatePlace;
  orgs: OrgOption[];
  initialParent?: { slug: string; name: string; systemSlug?: string };
  /** Le nom d'un emplacement de l'inventaire que l'on complète. */
  initialName?: string;
  fromLocationId?: string;
}) {
  const t = useTranslations("PrivatePlaces");
  const tPlaces = useTranslations("Places");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(place?.name ?? initialName ?? "");
  const [type, setType] = useState<PrivatePlaceType>(place?.type ?? "outpost");
  const [parentSlug, setParentSlug] = useState(
    place?.parentSlug ?? initialParent?.slug,
  );
  const [parentLabel, setParentLabel] = useState(
    place?.parentName ?? initialParent?.name,
  );
  const [systemSlug, setSystemSlug] = useState(
    place?.systemSlug ?? initialParent?.systemSlug,
  );
  const [description, setDescription] = useState(place?.description ?? "");
  const [position, setPosition] = useState<PositionValue>(
    place?.position ?? null,
  );
  const [image, setImage] = useState<ProposedImage | null>(
    place?.image ?? null,
  );
  const [orgId, setOrgId] = useState<string>(place?.org?.id ?? "");
  const uploaded = useRef<{ file: File; url: string }>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!parentSlug) {
      setError(t("errors.parentRequired"));
      return;
    }
    if (position === "invalid") {
      setError(tPlaces("Position.invalid"));
      return;
    }

    startTransition(async () => {
      let sentImage: { url: string; width: number; height: number } | null =
        null;
      if (image) {
        if ("file" in image) {
          let url =
            uploaded.current?.file === image.file ? uploaded.current.url : null;
          if (!url) {
            try {
              const blob = await upload(
                `prives/${blobName(image.file)}`,
                image.file,
                { access: "public", handleUploadUrl: "/api/lieux/upload" },
              );
              url = blob.url;
              uploaded.current = { file: image.file, url };
            } catch {
              setError(t("errors.imageFailed"));
              return;
            }
          }
          sentImage = { url, width: image.width, height: image.height };
        } else {
          sentImage = image;
        }
      }

      const body = {
        name,
        type,
        parentSlug,
        description,
        position,
        image: sentImage,
        orgId: orgId || null,
        ...(fromLocationId && !place ? { fromLocationId } : {}),
      };
      const response = await fetch(
        place ? `/api/lieux/prives/${place.slug}` : "/api/lieux/prives",
        {
          method: place ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ).catch(() => null);
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
      const { slug } = (await response.json()) as { slug: string };
      router.push(`/lieux/${slug}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="private-place-name">{t("fieldName")}</Label>
          <Input
            id="private-place-name"
            value={name}
            required
            maxLength={MAX_PLACE_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="private-place-type">{t("fieldType")}</Label>
          <Select
            value={type}
            onValueChange={(value) => setType(value as PrivatePlaceType)}
          >
            <SelectTrigger id="private-place-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIVATE_PLACE_TYPES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {tPlaces(`types.${entry}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>{t("fieldParent")}</Label>
          <PlacePicker
            value={parentSlug}
            valueLabel={parentLabel}
            excludeTypes={["shop"]}
            onChange={(next) => {
              setParentSlug(next?.slug);
              setParentLabel(next?.name);
              setSystemSlug(
                next?.type === "star" ? next.slug : next?.systemSlug,
              );
            }}
            placeholder={t("fieldParentPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">
            {t("fieldParentHint")}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="private-place-description">
          {t("fieldDescription")}
        </Label>
        <Textarea
          id="private-place-description"
          rows={4}
          maxLength={MAX_PRIVATE_PLACE_DESCRIPTION_LENGTH}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <PlacePositionField
        initial={place?.position}
        systemSlug={systemSlug}
        onChange={setPosition}
      />

      <ProposedPlaceImage value={image} onChange={setImage} />

      <fieldset
        id="partage"
        className="space-y-2.5 rounded-xl border border-[#c4b2ff]/45 bg-[#c4b2ff]/5 p-4"
      >
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-[#c4b2ff]">
          <UserGroupIcon className="size-4" />
          {t("shareTitle")}
        </legend>
        <div className="flex flex-wrap gap-2">
          <ShareOption
            checked={!orgId}
            onSelect={() => setOrgId("")}
            label={t("shareOwn")}
            icon={<LockClosedIcon className="size-4" />}
          />
          {orgs.map((org) => (
            <ShareOption
              key={org.id}
              checked={orgId === org.id}
              onSelect={() => setOrgId(org.id)}
              label={t("shareWith", { org: org.name })}
              tag={org.tag}
              icon={<UserGroupIcon className="size-4" />}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {orgs.length === 0 ? t("shareNoOrg") : t("shareHint")}
        </p>
      </fieldset>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#9ED0FF]/15 pt-4">
        <p className="text-xs text-muted-foreground">
          {place ? "" : t("laterPublic")}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={() => router.back()}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t("saving") : place ? t("save") : t("create")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function ShareOption({
  checked,
  onSelect,
  label,
  tag,
  icon,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  tag?: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
        checked
          ? "border-[#c4b2ff] text-[#e3f1ff]"
          : "border-[#9ED0FF]/25 text-muted-foreground hover:bg-white/5"
      }`}
    >
      <input
        type="radio"
        name="private-place-share"
        checked={checked}
        onChange={onSelect}
        className="size-4 accent-[#c4b2ff]"
      />
      {icon}
      {label}
      {tag && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {tag}
        </span>
      )}
    </label>
  );
}
