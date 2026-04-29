"use client";

import { useState, useTransition } from "react";
import { placeOrderAction } from "@/app/shopping/my-orders/actions";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

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
    <form onSubmit={handleSubmit} className="space-y-4 bg-gray-50 rounded-lg border p-6">
      <h2 className="text-xl font-bold">{t("formTitle")}</h2>
      <p className="text-sm text-gray-600">{t("formDescription")}</p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {t("messageLabel")}
        </label>
        <textarea
          name="message"
          rows={4}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
          placeholder={t("messagePlaceholder")}
        />
      </div>

      <Button type="submit" disabled={isPending || !message.trim()}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}

export function OrdersNavLink({ shopId }: { shopId: string }) {
  const t = useTranslations("BoOrders");
  return (
    <a
      href={`/shops/${shopId}/bo/orders`}
      className="text-sm text-blue-600 hover:underline"
    >
      {t("navLink")}
    </a>
  );
}
