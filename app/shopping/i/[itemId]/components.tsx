"use client";

import { MinusIcon, PlusIcon } from "@heroicons/react/24/solid";
import { useState, useTransition } from "react";
import { incrementShopItemStock } from "@/app/shopping/actions";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function StockModificationForm({ itemId }: { itemId: string }) {
  const t = useTranslations("ShopItemManagement");

  // Texte brut : un champ vide ou « - » en cours de saisie reste possible.
  const [value, setValue] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const change = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(change) && change !== 0;

  function step(delta: number) {
    setError(null);
    setValue(String((Number.isInteger(change) ? change : 0) + delta));
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) {
          setError(t("invalidChange"));
          return;
        }
        setError(null);
        startTransition(async () => {
          const result = await incrementShopItemStock(itemId, change);
          if (result.error === "NOT_ENOUGH_STOCK") {
            setError(t("notEnoughStock"));
          } else if (result.error) {
            setError(t("invalidChange"));
          } else {
            setValue("0");
          }
        });
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="isolate inline-flex overflow-hidden rounded-md border border-[#9ED0FF]/30">
          <button
            type="button"
            className="inline-flex items-center px-2 py-2 hover:bg-[#9ED0FF]/10"
            onClick={() => step(-1)}
            disabled={isPending}
          >
            <span className="sr-only">{t("removeOne")}</span>
            <MinusIcon aria-hidden="true" className="size-5" />
          </button>
          <input
            type="number"
            step={1}
            name="stockModification"
            id="stockModification"
            className="w-20 border-x border-[#9ED0FF]/30 bg-transparent px-2 py-2 text-center font-mono"
            value={value}
            onChange={(event) => {
              setError(null);
              setValue(event.target.value);
            }}
            disabled={isPending}
          />
          <button
            type="button"
            className="inline-flex items-center px-2 py-2 hover:bg-[#9ED0FF]/10"
            onClick={() => step(1)}
            disabled={isPending}
          >
            <span className="sr-only">{t("addOne")}</span>
            <PlusIcon aria-hidden="true" className="size-5" />
          </button>
        </span>
        <Button type="submit" variant="outline" disabled={isPending || !valid}>
          {change < 0 ? t("removeFromStock") : t("addToStock")}
        </Button>
      </div>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </form>
  );
}
