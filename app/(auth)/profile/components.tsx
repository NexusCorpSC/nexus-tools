"use client";

import { upload } from "@vercel/blob/client";

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
