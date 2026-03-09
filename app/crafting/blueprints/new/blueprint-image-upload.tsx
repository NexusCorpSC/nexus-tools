"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus, X, Loader2 } from "lucide-react";
import Image from "next/image";

export function BlueprintImageUpload({
  slug,
  initialUrl,
}: {
  slug: string;
  initialUrl?: string;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(initialUrl ?? null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const pathname = `blueprints/${slug}/image.${ext}`;

    setIsUploading(true);
    setError(null);

    try {
      const blob = await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/blueprints/upload",
      });
      setImageUrl(blob.url);
    } catch (err) {
      setError((err as Error).message ?? "Upload failed");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleRemove() {
    setImageUrl(null);
    setError(null);
  }

  return (
    <div className="space-y-2">
      {/* Hidden field so the server action can read the URL */}
      <input type="hidden" name="imageUrl" value={imageUrl ?? ""} />

      {imageUrl ? (
        <div className="relative w-full max-w-xs">
          <Image
            src={imageUrl}
            alt="Blueprint preview"
            width={320}
            height={180}
            className="rounded-lg border border-gray-200 object-cover w-full"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute top-1.5 right-1.5 rounded-full bg-white/80 p-1 shadow hover:bg-white transition-colors"
            aria-label="Remove image"
          >
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 w-full max-w-xs h-36 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 cursor-pointer hover:border-gray-400 hover:bg-gray-100 transition-colors">
          {isUploading ? (
            <>
              <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
              <span className="text-xs text-gray-400">Upload en cours…</span>
            </>
          ) : (
            <>
              <ImagePlus className="h-6 w-6 text-gray-400" />
              <span className="text-xs text-gray-500">
                Cliquer pour ajouter une image
              </span>
              <span className="text-xs text-gray-400">
                JPEG, PNG ou WebP · max 8 Mo
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
