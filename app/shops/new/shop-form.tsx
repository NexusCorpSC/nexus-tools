"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MUTED } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import {
  SHOP_DESCRIPTION_MAX,
  SHOP_NAME_MAX,
  SHOP_NAME_MIN,
} from "@/lib/shop-limits";
import { createShopAction } from "./actions";

/** Le formulaire d'ouverture : nom, description et logo facultatif. */
export function NewShopForm() {
  const t = useTranslations("ShopCreate");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          // Sans erreur, l'action redirige vers le back-office du magasin.
          const result = await createShopAction(data);
          if (result?.error) setError(t(`errors.${result.error}`));
        });
      }}
    >
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium">
          {t("name")}
        </label>
        <Input
          id="name"
          name="name"
          required
          minLength={SHOP_NAME_MIN}
          maxLength={SHOP_NAME_MAX}
          placeholder={t("namePlaceholder")}
          disabled={isPending}
        />
        <p className={cn("text-xs", MUTED)}>{t("nameHelp")}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="description" className="block text-sm font-medium">
          {t("description")}
        </label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          maxLength={SHOP_DESCRIPTION_MAX}
          placeholder={t("descriptionPlaceholder")}
          disabled={isPending}
        />
        <p className={cn("text-xs", MUTED)}>{t("descriptionHelp")}</p>
      </div>

      <div className="space-y-2">
        <label htmlFor="logo" className="block text-sm font-medium">
          {t("logo")}
        </label>
        <Input
          id="logo"
          name="logo"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={isPending}
        />
        <p className={cn("text-xs", MUTED)}>{t("logoHelp")}</p>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
