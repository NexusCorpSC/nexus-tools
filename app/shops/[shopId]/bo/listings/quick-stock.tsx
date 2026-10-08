"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { incrementShopItemStock } from "@/app/shopping/actions";

/** Le stock saisi à la main, corrigé d'une unité depuis le tableau. */
export function QuickStock({
  itemId,
  stock,
  reserved,
}: {
  itemId: string;
  stock: number;
  reserved: number;
}) {
  const t = useTranslations("ShopBo.listings");
  const router = useRouter();
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function change(delta: number) {
    setError(false);
    startTransition(async () => {
      const result = await incrementShopItemStock(itemId, delta);
      if (result.error) setError(true);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <span className="inline-flex items-center overflow-hidden rounded-md border border-[#9ED0FF]/30 text-xs">
        <button
          type="button"
          aria-label={t("stockLess")}
          className="flex size-7 items-center justify-center hover:bg-[#9ED0FF]/10 disabled:opacity-40"
          disabled={isPending || stock <= reserved}
          onClick={() => change(-1)}
        >
          <MinusIcon aria-hidden="true" className="size-3.5" />
        </button>
        <span className="min-w-8 border-x border-[#9ED0FF]/30 px-1.5 text-center leading-7">
          {stock}
        </span>
        <button
          type="button"
          aria-label={t("stockMore")}
          className="flex size-7 items-center justify-center hover:bg-[#9ED0FF]/10 disabled:opacity-40"
          disabled={isPending}
          onClick={() => change(1)}
        >
          <PlusIcon aria-hidden="true" className="size-3.5" />
        </button>
      </span>
      {error && (
        <span className="text-[11px] text-red-300">{t("stockError")}</span>
      )}
    </span>
  );
}
