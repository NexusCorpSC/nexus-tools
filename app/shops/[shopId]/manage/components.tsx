"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  addSeller,
  removeSeller,
  searchSellerCandidates,
  updateShopInfo,
} from "./actions";
import type { UserMatch } from "@/lib/shops";
import { ShopLogo } from "@/app/shopping/ui";
import {
  SHOP_DESCRIPTION_MAX,
  SHOP_NAME_MAX,
  SHOP_NAME_MIN,
} from "@/lib/shop-limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ─── ShopInfoEditor ──────────────────────────────────────────────────────────

export function ShopInfoEditor({
  shopId,
  initialName,
  initialDescription,
  logo,
}: {
  shopId: string;
  initialName: string;
  initialDescription: string;
  logo?: string;
}) {
  const t = useTranslations("ShopManagement");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    if (removeLogo) formData.set("removeLogo", "1");
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const result = await updateShopInfo(shopId, formData);
      if (result.success) {
        setSuccess(true);
        setRemoveLogo(false);
        router.refresh();
      } else {
        setError(
          result.message
            ? t(`errors.${result.message}` as Parameters<typeof t>[0])
            : t("errors.error"),
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="shopName">{t("shopName")}</Label>
        <Input
          id="shopName"
          name="name"
          defaultValue={initialName}
          required
          minLength={SHOP_NAME_MIN}
          maxLength={SHOP_NAME_MAX}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shopDescription">{t("shopDescription")}</Label>
        <Textarea
          id="shopDescription"
          name="description"
          defaultValue={initialDescription}
          rows={5}
          maxLength={SHOP_DESCRIPTION_MAX}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="shopLogo">{t("shopLogo")}</Label>
        <div className="flex flex-wrap items-center gap-3">
          {logo && !removeLogo && (
            <ShopLogo name={initialName} logo={logo} className="size-12" />
          )}
          <Input
            id="shopLogo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="max-w-xs"
            disabled={isPending}
          />
          {logo && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRemoveLogo((value) => !value)}
              disabled={isPending}
            >
              {removeLogo ? t("keepLogo") : t("removeLogo")}
            </Button>
          )}
        </div>
        <p className="text-xs text-[#9ED0FF]/70">{t("shopLogoHelp")}</p>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}
      {success && <p className="text-sm text-emerald-300">{t("saveSuccess")}</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

// ─── AddSeller ───────────────────────────────────────────────────────────────

/** Ajouter un vendeur en cherchant son pseudo. */
export function AddSellerSearch({ shopId }: { shopId: string }) {
  const t = useTranslations("ShopManagement");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<UserMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Les pseudos se cherchent après une courte pause dans la frappe.
  useEffect(() => {
    const text = query.trim();
    if (text.length < 3) return;
    const timer = setTimeout(() => {
      searchSellerCandidates(shopId, text).then(setMatches, () =>
        setMatches([]),
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [shopId, query]);

  return (
    <div className="space-y-2">
      <Label htmlFor="sellerSearch">{t("addSellerSearchLabel")}</Label>
      <Input
        id="sellerSearch"
        type="search"
        autoComplete="off"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("addSellerSearchPlaceholder")}
      />
      {query.trim().length >= 3 && (
        <ul className="divide-y divide-[#9ED0FF]/10 rounded-md border border-[#9ED0FF]/20">
          {matches.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="truncate text-[#CCE7FF]">{user.name}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await addSeller(shopId, user.id);
                    if (result.success) {
                      setQuery("");
                      router.refresh();
                    } else {
                      setError(
                        t(
                          `errors.${result.message ?? "error"}` as Parameters<
                            typeof t
                          >[0],
                        ),
                      );
                    }
                  });
                }}
              >
                {t("addSellerConfirm")}
              </Button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-[#9ED0FF]/70">
              {t("addSellerNone")}
            </li>
          )}
        </ul>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

// ─── RemoveSellerButton ──────────────────────────────────────────────────────

export function RemoveSellerButton({
  shopId,
  sellerId,
}: {
  shopId: string;
  sellerId: string;
}) {
  const t = useTranslations("ShopManagement");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeSeller(shopId, sellerId);
      if (result.success) {
        router.refresh();
      } else {
        setError(
          result.message
            ? t(`errors.${result.message}` as Parameters<typeof t>[0])
            : t("errors.error"),
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="destructive"
        onClick={handleRemove}
        disabled={isPending}
      >
        {isPending ? t("removing") : t("removeSeller")}
      </Button>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

