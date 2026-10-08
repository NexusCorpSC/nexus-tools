"use client";

import { useState, useTransition } from "react";
import { placeOrderAction } from "@/app/shopping/my-orders/actions";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";

export function PlaceOrderForm({ shopId }: { shopId: string }) {
  const t = useTranslations("ShopOrders");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("message", message);

    startTransition(async () => {
      const result = await placeOrderAction(shopId, null, formData);
      if (result?.error) {
        setError(t(`errors.${result.error}` as Parameters<typeof t>[0]));
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-[#9ED0FF]/25 bg-[#092F49]/50 p-4"
    >
      <p className="text-sm text-[#9ED0FF]/70">{t("formDescription")}</p>

      <div className="space-y-1">
        <label htmlFor="order-message" className="block text-sm font-medium">
          {t("messageLabel")}
        </label>
        <Textarea
          id="order-message"
          name="message"
          rows={4}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
          placeholder={t("messagePlaceholder")}
        />
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <Button type="submit" disabled={isPending || !message.trim()}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
