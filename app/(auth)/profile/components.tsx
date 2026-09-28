"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { CameraIcon, CheckIcon, CopyIcon, PencilIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { outlineButton } from "@/app/(auth)/profile/styles";

/** Round placeholder with the name's first letter, when there is no avatar. */
export function Initial({
  name,
  className,
}: {
  name: string;
  className: string;
}) {
  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-[#1F5A86] font-semibold text-[#E3F1FF] ${className}`}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

/**
 * The avatar, with a camera button to replace it.
 *
 * The blob keeps the same path from one upload to the next, so its URL does
 * not change: the new picture is shown from the local file rather than waiting
 * for a cache that still holds the old one.
 */
export function AvatarUpdateComponent({
  userId,
  avatar,
  name,
}: {
  userId: string;
  avatar: string | null;
  name: string;
}) {
  const t = useTranslations("Profile");
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleFileSelection(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const ext = file.name.split(".").pop();

    setPending(true);
    try {
      await upload(`users/${userId}/avatar.${ext}`, file, {
        access: "public",
        handleUploadUrl: `/api/users/${userId}/avatar`,
      });
      setPreview(URL.createObjectURL(file));
      toast.success(t("avatarUpdated"));
    } catch {
      toast.error(t("avatarError"));
    } finally {
      setPending(false);
      event.target.value = "";
    }
  }

  const src = preview ?? avatar;

  return (
    <div className="relative shrink-0">
      {src ? (
        <Image
          src={src}
          alt=""
          width={88}
          height={88}
          unoptimized={Boolean(preview)}
          className="size-20 rounded-full object-cover sm:size-22"
        />
      ) : (
        <Initial name={name} className="size-20 text-3xl sm:size-22" />
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={pending}
        aria-label={t("changeAvatar")}
        title={t("changeAvatar")}
        className="absolute -right-1 -bottom-1 flex size-9 items-center justify-center rounded-full border-3 border-[#0B3A5A] bg-[#CCE7FF] text-[#092F49] hover:bg-white disabled:opacity-60"
      >
        <CameraIcon className="size-4" />
      </button>
      <input
        ref={input}
        type="file"
        accept=".png,.jpg,.jpeg"
        className="hidden"
        onChange={handleFileSelection}
      />
    </div>
  );
}

export function NameUpdateComponent({ currentName }: { currentName: string }) {
  const t = useTranslations("Profile");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.updateUser({ name });
    setLoading(false);
    if (error) {
      toast.error(t("nameUpdateError"));
    } else {
      toast.success(t("nameUpdateSuccess"));
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("edit")}
          title={t("edit")}
          className="text-[#A9CDEE] hover:bg-[#9ED0FF]/10 hover:text-[#E3F1FF]"
        >
          <PencilIcon />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("nameUpdateTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("nameUpdateLabel")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("nameUpdatePlaceholder")}
              required
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              className={outlineButton}
              onClick={() => setOpen(false)}
            >
              {t("nameUpdateCancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "…" : t("nameUpdateSave")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Copies `value`, and says so for a moment. Icon only with `label` as its
 * accessible name, or with the visible «Copier» when `withText`.
 */
export function CopyButton({
  value,
  label,
  withText = false,
  className = "",
}: {
  value: string;
  label: string;
  withText?: boolean;
  className?: string;
}) {
  const t = useTranslations("Profile");
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const Icon = copied ? CheckIcon : CopyIcon;

  return withText ? (
    <Button
      type="button"
      onClick={() => void copy()}
      className={`h-11 ${outlineButton} ${className}`}
    >
      <Icon />
      {copied ? t("copied") : t("copy")}
    </Button>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => void copy()}
      aria-label={label}
      title={copied ? t("copied") : label}
      className={`text-[#A9CDEE] hover:bg-[#9ED0FF]/10 hover:text-[#E3F1FF] ${className}`}
    >
      <Icon />
    </Button>
  );
}
