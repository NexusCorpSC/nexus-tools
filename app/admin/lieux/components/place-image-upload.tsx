"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

/** Les dimensions naturelles, lues côté client — le serveur ne décode rien. */
async function readSize(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new window.Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = reject;
        image.src = url;
      },
    );
    return size;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Frame({
  imageUrl,
  isUploading,
  error,
  onPick,
  onRemove,
}: {
  imageUrl?: string;
  isUploading: boolean;
  error: string | null;
  onPick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Places.Admin");
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      {imageUrl ? (
        <div className="relative w-full max-w-sm">
          <Image
            src={imageUrl}
            alt={t("imagePreview")}
            width={384}
            height={216}
            className="w-full rounded-lg border border-[#9ED0FF]/20 object-cover"
          />
          <button
            type="button"
            onClick={onRemove}
            className="absolute right-1.5 top-1.5 rounded-full bg-white/80 p-1 shadow-sm transition-colors hover:bg-white"
            aria-label={t("imageRemove")}
          >
            <X className="size-4 text-gray-600" />
          </button>
        </div>
      ) : (
        <label className="flex h-36 w-full max-w-sm cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#9ED0FF]/25 bg-white/5 transition-colors hover:border-[#9ED0FF]/50 hover:bg-white/10">
          {isUploading ? (
            <>
              <Loader2 className="size-6 animate-spin text-nexus" />
              <span className="text-xs text-nexus">{t("imageUploading")}</span>
            </>
          ) : (
            <>
              <ImagePlus className="size-6 text-nexus" />
              <span className="text-xs text-nexus">{t("imageAdd")}</span>
              <span className="text-xs text-nexus">
                {t("imageConstraints")}
              </span>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={isUploading}
            onChange={onPick}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

/**
 * La vignette d'un lieu. Le slug fait partie du chemin dans le blob, donc
 * renvoyer une image pour le même lieu remplace la précédente.
 */
export function PlaceImageUpload({
  slug,
  imageUrl,
  onChange,
}: {
  slug: string;
  imageUrl?: string;
  onChange: (url: string | undefined) => void;
}) {
  const t = useTranslations("Places.Admin");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!slug) {
      setError(t("imageNeedsSlug"));
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    setIsUploading(true);
    setError(null);

    try {
      const blob = await upload(`lieux/${slug}/image.${extension}`, file, {
        access: "public",
        handleUploadUrl: "/api/lieux/upload",
      });
      onChange(blob.url);
    } catch (uploadError) {
      setError((uploadError as Error).message ?? t("imageUploadFailed"));
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <Frame
      imageUrl={imageUrl}
      isUploading={isUploading}
      error={error}
      onPick={handlePick}
      onRemove={() => {
        onChange(undefined);
        setError(null);
      }}
    />
  );
}

/**
 * Le fond d'un plan. Il voyage avec ses dimensions naturelles : elles donnent
 * le rapport d'aspect du cadre, et c'est tout — les repères sont en fractions,
 * donc une dimension fausse abîme la mise en page sans les déplacer.
 */
export function PlanImageUpload({
  slug,
  planId,
  imageUrl,
  onChange,
}: {
  slug: string;
  planId: string;
  imageUrl?: string;
  onChange: (
    value: { url: string; width: number; height: number } | undefined,
  ) => void;
}) {
  const t = useTranslations("Places.Admin");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!slug) {
      setError(t("imageNeedsSlug"));
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    setIsUploading(true);
    setError(null);

    try {
      const size = await readSize(file);
      const blob = await upload(
        `lieux/${slug}/plans/${planId}.${extension}`,
        file,
        { access: "public", handleUploadUrl: "/api/lieux/upload" },
      );
      onChange({ url: blob.url, width: size.width, height: size.height });
    } catch (uploadError) {
      setError((uploadError as Error).message ?? t("imageUploadFailed"));
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <Frame
      imageUrl={imageUrl}
      isUploading={isUploading}
      error={error}
      onPick={handlePick}
      onRemove={() => {
        onChange(undefined);
        setError(null);
      }}
    />
  );
}
