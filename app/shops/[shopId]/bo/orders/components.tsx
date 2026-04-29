"use client";

import { useState, useTransition } from "react";
import { respondToOrderAction } from "@/app/shops/[shopId]/bo/actions";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function RespondForm({
  orderId,
  shopId,
  initialResponse,
  initialQuote,
}: {
  orderId: string;
  shopId: string;
  initialResponse?: string;
  initialQuote?: number;
}) {
  const t = useTranslations("BoOrders");
  const [message, setMessage] = useState(initialResponse ?? "");
  const [quote, setQuote] = useState(
    initialQuote !== undefined ? String(initialQuote) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("message", message);
    if (quote.trim()) formData.set("quote", quote);

    startTransition(async () => {
      const result = await respondToOrderAction(orderId, shopId, null, formData);
      if (result?.error) {
        setError(t(`errors.${result.error}` as Parameters<typeof t>[0]));
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {t("responseLabel")}
        </label>
        <textarea
          rows={5}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
          placeholder={t("responsePlaceholder")}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {t("quoteLabel")}
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            disabled={isPending}
            className="w-40 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
            placeholder="0"
          />
          <span className="text-sm text-gray-500">aUEC</span>
        </div>
      </div>

      <Button type="submit" disabled={isPending || !message.trim()}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
