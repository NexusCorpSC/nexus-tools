"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_ORG_DESCRIPTION_LENGTH,
  MAX_ORG_LOGO_BYTES,
  MAX_ORG_NAME_LENGTH,
  MAX_ORG_TAG_LENGTH,
} from "@/types/contributions";
import { createOrgAction } from "./actions";

export function NewOrgForm({ remaining }: { remaining: number }) {
  const t = useTranslations("NewOrganization");
  const tErrors = useTranslations("Contributions.errors");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const logo = formData.get("logo");
    if (logo instanceof File && logo.size > MAX_ORG_LOGO_BYTES) {
      setError(t("logoTooLarge"));
      return;
    }

    startTransition(async () => {
      const result = await createOrgAction(formData);
      if (!result.ok) {
        setError(
          result.detail ??
            (tErrors.has(result.error) ? tErrors(result.error) : t("failed")),
        );
        return;
      }
      router.push(`/orgs/${result.orgId}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">{t("name")}</Label>
          <Input
            id="org-name"
            name="name"
            required
            minLength={2}
            maxLength={MAX_ORG_NAME_LENGTH}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="org-tag">{t("tag")}</Label>
          <Input
            id="org-tag"
            name="tag"
            required
            pattern="[A-Za-z0-9]{2,10}"
            maxLength={MAX_ORG_TAG_LENGTH}
            className="uppercase"
          />
        </div>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">{t("tagHint")}</p>

      <div className="space-y-1.5">
        <Label htmlFor="org-description">{t("description")}</Label>
        <Textarea
          id="org-description"
          name="description"
          rows={5}
          maxLength={MAX_ORG_DESCRIPTION_LENGTH}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-logo">{t("logo")}</Label>
        <Input
          id="org-logo"
          name="logo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
        />
        <p className="text-xs text-muted-foreground">{t("logoHint")}</p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap items-center gap-3 border-t border-[#9ED0FF]/15 pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? t("creating") : t("create")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("remaining", { count: remaining })}
        </span>
      </div>
    </form>
  );
}
