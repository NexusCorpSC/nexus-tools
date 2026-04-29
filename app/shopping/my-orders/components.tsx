"use client";

import { useState, useTransition } from "react";
import {
  cancelOrderAction,
  acceptQuoteAction,
  refuseQuoteAction,
} from "@/app/shopping/my-orders/actions";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

export function OrderActions({
  orderId,
  status,
  hasQuote,
}: {
  orderId: string;
  status: string;
  hasQuote: boolean;
}) {
  const t = useTranslations("MyOrders");
  const router = useRouter();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCancel = status === "PENDING" || status === "QUOTED";
  const canActOnQuote = status === "QUOTED" && hasQuote;

  if (!canCancel && !canActOnQuote) return null;

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction(
        orderId,
        comment.trim() || undefined,
      );
      if (result.error) {
        setError(t("errors.CANNOT_CANCEL"));
      } else {
        router.refresh();
      }
    });
  }

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuoteAction(
        orderId,
        comment.trim() || undefined,
      );
      if (result.error) {
        setError(t("errors.CANNOT_ACCEPT"));
      } else {
        router.refresh();
      }
    });
  }

  function handleRefuse() {
    setError(null);
    startTransition(async () => {
      const result = await refuseQuoteAction(
        orderId,
        comment.trim() || undefined,
      );
      if (result.error) {
        setError(t("errors.CANNOT_REFUSE"));
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 pt-4 border-t">
      <div className="space-y-1">
        <label className="block text-sm font-medium text-gray-700">
          {t("commentLabel")}
        </label>
        <textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isPending}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50"
          placeholder={t("commentPlaceholder")}
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {canActOnQuote && (
          <>
            <Button
              onClick={handleAccept}
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {isPending ? t("processing") : t("acceptQuote")}
            </Button>
            <Button
              onClick={handleRefuse}
              disabled={isPending}
              variant="destructive"
            >
              {isPending ? t("processing") : t("refuseQuote")}
            </Button>
          </>
        )}
        {canCancel && (
          <Button onClick={handleCancel} disabled={isPending} variant="outline">
            {isPending ? t("processing") : t("cancelOrder")}
          </Button>
        )}
      </div>
    </div>
  );
}
