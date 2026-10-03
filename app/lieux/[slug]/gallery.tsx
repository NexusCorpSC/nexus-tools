"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MAX_GAME_VERSION_LENGTH,
  MAX_MEDIA_CAPTION_LENGTH,
  MAX_MEDIA_CREDIT_LENGTH,
  MAX_MEDIA_PER_CONTRIBUTION,
  POINTS,
  type ContributionErrorCode,
  type PlaceMedia,
  type SubmitContributionResult,
} from "@/types/contributions";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 12_000_000;

type Draft = {
  key: string;
  file: File;
  preview: string;
  width: number;
  height: number;
  caption: string;
};

async function readSize(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = url;
  });
}

/** `Hall des départs (2).PNG` → `Hall-des-d-parts-2-.png` : ce que le blob accepte. */
function blobName(file: File): string {
  const dot = file.name.lastIndexOf(".");
  const base = (dot > 0 ? file.name.slice(0, dot) : file.name)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  return `${base || "image"}.${extension}`;
}

/**
 * La galerie d'un lieu, et la porte pour y contribuer.
 *
 * Les images sont téléversées une à une, puis envoyées ensemble comme une
 * seule contribution : c'est elle que l'admin relit, et elle qui rapporte.
 */
export function PlaceGallery({
  slug,
  placeName,
  media,
  signedIn,
  defaultCredit,
  myPending,
  firstBonus,
}: {
  slug: string;
  placeName: string;
  media: PlaceMedia[];
  signedIn: boolean;
  defaultCredit?: string;
  myPending: number;
  /** Le lieu n'a ni galerie ni vignette : la première image rapporte plus. */
  firstBonus: boolean;
}) {
  const t = useTranslations("Contributions.Gallery");
  const [viewed, setViewed] = useState<PlaceMedia | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      {media.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {media.map((image) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => setViewed(image)}
                className="group relative block aspect-video w-full overflow-hidden rounded-lg border border-[#9ED0FF]/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-[#9ED0FF]/60"
                aria-label={image.caption ?? t("open")}
              >
                <Image
                  src={image.url}
                  alt={image.caption ?? placeName}
                  fill
                  sizes="(min-width: 640px) 320px, 50vw"
                  className="object-cover transition-transform group-hover:scale-[1.02]"
                />
                <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent px-2 pt-6 pb-1.5 text-left text-xs text-white/85">
                  {t("by", { name: image.credit ?? image.userName ?? "?" })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-[#9ED0FF]/25 bg-[#092F49]/35 px-4 py-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {signedIn ? (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            <ImagePlus />
            {t("add")}
            <PointsChip
              points={
                firstBonus ? POINTS.media + POINTS.firstMedia : POINTS.media
              }
            />
          </Button>
        ) : (
          <Link href="/login" className="text-sm text-nexus underline">
            {t("signInToAdd")}
          </Link>
        )}
        {myPending > 0 && (
          <span className="text-xs text-muted-foreground">
            {t("myPending", { count: myPending })}
          </span>
        )}
      </div>

      <Dialog open={viewed !== null} onOpenChange={() => setViewed(null)}>
        <DialogContent className="max-w-4xl">
          {viewed && (
            <>
              <DialogHeader>
                <DialogTitle>{viewed.caption ?? placeName}</DialogTitle>
                <DialogDescription>
                  {t("by", {
                    name: viewed.credit ?? viewed.userName ?? "?",
                  })}
                </DialogDescription>
              </DialogHeader>
              <Image
                src={viewed.url}
                alt={viewed.caption ?? placeName}
                width={viewed.width}
                height={viewed.height}
                sizes="(min-width: 896px) 896px, 100vw"
                className="h-auto w-full rounded-lg"
              />
            </>
          )}
        </DialogContent>
      </Dialog>

      {signedIn && (
        <AddMediaDialog
          slug={slug}
          placeName={placeName}
          open={open}
          onOpenChange={setOpen}
          defaultCredit={defaultCredit}
        />
      )}
    </div>
  );
}

function PointsChip({ points }: { points: number }) {
  return (
    <span className="rounded-full border border-amber-300/55 bg-amber-300/14 px-1.5 font-mono text-[11px] font-bold text-amber-200">
      +{points}
    </span>
  );
}

function AddMediaDialog({
  slug,
  placeName,
  open,
  onOpenChange,
  defaultCredit,
}: {
  slug: string;
  placeName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCredit?: string;
}) {
  const t = useTranslations("Contributions.Gallery");
  const tErrors = useTranslations("Contributions.errors");
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [credit, setCredit] = useState(defaultCredit ?? "");
  const [gameVersion, setGameVersion] = useState("");
  const [sending, setSending] = useState(false);
  // Le temps de lire les dimensions : une seconde sélection compterait sur
  // des brouillons pas encore ajoutés et dépasserait le maximum.
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les aperçus sont des URL d'objets : elles se libèrent quand l'image quitte
  // le brouillon, sinon chacune resterait en mémoire jusqu'au rechargement.
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  useEffect(
    () => () =>
      draftsRef.current.forEach((draft) => URL.revokeObjectURL(draft.preview)),
    [],
  );

  function reset() {
    drafts.forEach((draft) => URL.revokeObjectURL(draft.preview));
    setDrafts([]);
    setError(null);
  }

  function remove(draft: Draft) {
    URL.revokeObjectURL(draft.preview);
    setDrafts((current) => current.filter((entry) => entry.key !== draft.key));
  }

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    setError(null);

    const room = MAX_MEDIA_PER_CONTRIBUTION - drafts.length;
    if (files.length > room) setError(tErrors("tooManyMedia"));

    setPicking(true);
    const added: Draft[] = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      if (!ACCEPTED.includes(file.type) || file.size > MAX_BYTES) {
        setError(t("constraints"));
        continue;
      }
      const preview = URL.createObjectURL(file);
      try {
        const size = await readSize(preview);
        added.push({
          key: crypto.randomUUID(),
          file,
          preview,
          caption: "",
          ...size,
        });
      } catch {
        URL.revokeObjectURL(preview);
        setError(t("constraints"));
      }
    }
    setDrafts((current) => [...current, ...added]);
    setPicking(false);
  }

  async function send() {
    if (drafts.length === 0) return;
    setSending(true);
    setError(null);

    try {
      const images = [];
      for (const draft of drafts) {
        const blob = await upload(
          `lieux/${slug}/media/${blobName(draft.file)}`,
          draft.file,
          { access: "public", handleUploadUrl: "/api/lieux/upload" },
        );
        images.push({
          url: blob.url,
          width: draft.width,
          height: draft.height,
          caption: draft.caption,
          credit,
        });
      }

      const response = await fetch("/api/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "media",
          placeSlug: slug,
          images,
          gameVersion,
        }),
      });
      const body = (await response.json()) as
        | SubmitContributionResult
        | { error: ContributionErrorCode };

      if (!response.ok || "error" in body) {
        const code = "error" in body ? body.error : undefined;
        setError(code && tErrors.has(code) ? tErrors(code) : t("sendFailed"));
        return;
      }

      if (body.contribution.status === "published") {
        toast.success(
          t("published", {
            count: images.length,
            points: body.contribution.points,
          }),
        );
      } else {
        toast.success(t("sentForReview", { count: images.length }));
      }
      reset();
      onOpenChange(false);
      router.refresh();
    } catch (uploadError) {
      setError((uploadError as Error).message || t("sendFailed"));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (sending) return;
        if (!value) reset();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("dialogDescription", {
              name: placeName,
              max: MAX_MEDIA_PER_CONTRIBUTION,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {drafts.map((draft) => (
            <div key={draft.key} className="relative aspect-video">
              {/* Un aperçu local : next/image n'optimise pas une URL d'objet. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.preview}
                alt=""
                className="size-full rounded-md border border-[#9ED0FF]/20 object-cover"
              />
              <button
                type="button"
                disabled={sending}
                onClick={() => remove(draft)}
                className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                aria-label={t("remove")}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          {drafts.length < MAX_MEDIA_PER_CONTRIBUTION && (
            <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-[#9ED0FF]/30 text-xs text-nexus hover:border-[#9ED0FF]/60 hover:bg-white/5">
              <ImagePlus className="size-5" />
              {t("pick")}
              <input
                type="file"
                multiple
                accept={ACCEPTED.join(",")}
                className="sr-only"
                disabled={sending || picking}
                onChange={pick}
              />
            </label>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("constraints")}</p>

        {drafts.map((draft, index) => (
          <label key={draft.key} className="block space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t("captionFor", { index: index + 1 })}
            </span>
            <Input
              value={draft.caption}
              maxLength={MAX_MEDIA_CAPTION_LENGTH}
              placeholder={t("captionPlaceholder")}
              disabled={sending}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((entry) =>
                    entry.key === draft.key
                      ? { ...entry, caption: event.target.value }
                      : entry,
                  ),
                )
              }
            />
          </label>
        ))}

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t("credit")}</span>
            <Input
              value={credit}
              maxLength={MAX_MEDIA_CREDIT_LENGTH}
              disabled={sending}
              onChange={(event) => setCredit(event.target.value)}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t("gameVersion")}</span>
            <Input
              value={gameVersion}
              maxLength={MAX_GAME_VERSION_LENGTH}
              placeholder="4.3"
              disabled={sending}
              onChange={(event) => setGameVersion(event.target.value)}
            />
          </label>
        </div>

        <p className="rounded-md bg-[#9ED0FF]/8 p-3 text-xs leading-relaxed text-nexus">
          {t("rules")}
        </p>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="outline" disabled={sending}>
              {t("cancel")}
            </Button>
          </DialogClose>
          <Button onClick={send} disabled={sending || drafts.length === 0}>
            {sending && <Loader2 className="animate-spin" />}
            {t("send", { count: drafts.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
