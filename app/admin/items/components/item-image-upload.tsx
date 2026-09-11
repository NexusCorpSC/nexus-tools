"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Uploads the item illustration to blob storage and hands the resulting url
 * back to the form. The slug is part of the path, so re-uploading an image for
 * the same item replaces the previous one.
 */
export function ItemImageUpload({
  slug,
  imageUrl,
  onChange,
}: {
  slug: string;
  imageUrl?: string;
  onChange: (url: string | undefined) => void;
}) {
  const t = useTranslations("Items.Admin");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
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
      const blob = await upload(`items/${slug}/image.${extension}`, file, {
        access: "public",
        handleUploadUrl: "/api/items/upload",
      });
      onChange(blob.url);
    } catch (uploadError) {
      setError((uploadError as Error).message ?? t("imageUploadFailed"));
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {imageUrl ? (
        <div className="relative w-full max-w-xs">
          <Image
            src={imageUrl}
            alt={t("imagePreview")}
            width={320}
            height={180}
            className="rounded-lg border border-[#9ED0FF]/20 object-cover w-full"
          />
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setError(null);
            }}
            className="absolute top-1.5 right-1.5 rounded-full bg-white/80 p-1 shadow-sm hover:bg-white transition-colors"
            aria-label={t("imageRemove")}
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 w-full max-w-xs h-36 rounded-lg border-2 border-dashed border-[#9ED0FF]/25 bg-white/5 cursor-pointer hover:border-[#9ED0FF]/50 hover:bg-white/10 transition-colors">
          {isUploading ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-nexus" />
              <span className="text-xs text-nexus">{t("imageUploading")}</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-nexus" />
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
            onChange={handleFileChange}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
