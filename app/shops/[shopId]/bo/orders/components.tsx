"use client";

import { useState, useTransition } from "react";
import { respondToOrderAction } from "@/app/shops/[shopId]/bo/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="space-y-1">
        <label htmlFor="order-response" className="block text-sm font-medium">
          {t("responseLabel")}
        </label>
        <Textarea
          id="order-response"
          rows={5}
          required
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={isPending}
          placeholder={t("responsePlaceholder")}
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="order-quote" className="block text-sm font-medium">
          {t("quoteLabel")}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id="order-quote"
            type="number"
            min={0}
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            disabled={isPending}
            className="w-40"
            placeholder="0"
          />
          <span className="text-sm text-[#9ED0FF]/70">aUEC</span>
        </div>
      </div>

      <Button type="submit" disabled={isPending || !message.trim()}>
        {isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
