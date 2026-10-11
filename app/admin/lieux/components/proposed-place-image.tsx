"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { readSize } from "@/app/lieux/[slug]/gallery";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 12_000_000;

/** L'image choisie : un fichier à téléverser, ou celle d'une proposition reprise. */
export type ProposedImage =
  | { file: File; preview: string; width: number; height: number }
  | { url: string; width: number; height: number };

/**
 * L'image principale d'un lieu proposé. Le fichier n'est téléversé qu'à
 * l'envoi, une fois le parent connu : c'est dans sa galerie qu'il attend la
 * relecture. Publié, il devient la première image du lieu, donc sa bannière.
 */
export function ProposedPlaceImage({
  value,
  onChange,
}: {
  value: ProposedImage | null;
  onChange: (value: ProposedImage | null) => void;
}) {
  const t = useTranslations("Contributions.Form");
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = value ? ("file" in value ? value.preview : value.url) : null;

  // L'aperçu local est libéré quand il change ou que le champ disparaît.
  useEffect(() => {
    const preview = value && "file" in value ? value.preview : null;
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [value]);

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ACCEPTED.includes(file.type) || file.size > MAX_BYTES) {
      setError(t("newPlaceImageConstraints"));
      return;
    }
    const preview = URL.createObjectURL(file);
    try {
      const { width, height } = await readSize(preview);
      setError(null);
      onChange({ file, preview, width, height });
    } catch {
      URL.revokeObjectURL(preview);
      setError(t("newPlaceImageConstraints"));
    }
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{t("newPlaceImage")}</p>
      {shown ? (
        <div className="relative overflow-hidden rounded-lg border border-[#9ED0FF]/15">
          {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) */}
          <img src={shown} alt="" className="max-h-64 w-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={t("newPlaceImageRemove")}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 hover:bg-black/80"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[#9ED0FF]/30 text-sm text-muted-foreground transition-colors hover:bg-white/5"
        >
          <ImagePlus className="size-6" />
          {t("newPlaceImagePick")}
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={pick}
      />
      <p
        className={`text-xs ${error ? "text-red-400" : "text-muted-foreground"}`}
      >
        {error ?? t("newPlaceImageHint")}
      </p>
    </div>
  );
}
