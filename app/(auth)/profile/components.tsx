"use client";

import { upload } from "@vercel/blob/client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export function AvatarUpdateComponent({ userId }: { userId: string }) {
  async function handleFileSelection(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const ext = file.name.split(".").pop();

    await upload(`users/${userId}/avatar.${ext}`, file, {
      access: "public",
      handleUploadUrl: `/api/users/${userId}/avatar`,
    });
  }

  return (
    <input
      type="file"
      accept=".png,.jpg,.jpeg"
      className="rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500"
      onChange={handleFileSelection}
    />
  );
}

export function NameUpdateComponent({
  currentName,
}: {
  currentName: string;
}) {
  const t = useTranslations("Profile");
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
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500"
        >
          {t("edit")}
        </button>
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
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {t("nameUpdateCancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {loading ? "..." : t("nameUpdateSave")}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
