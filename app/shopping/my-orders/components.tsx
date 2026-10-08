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
import { Textarea } from "@/components/ui/textarea";

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
    <div className="space-y-4 border-t border-[#9ED0FF]/15 pt-4">
      <div className="space-y-1">
        <label htmlFor="order-comment" className="block text-sm font-medium">
          {t("commentLabel")}
        </label>
        <Textarea
          id="order-comment"
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={isPending}
          placeholder={t("commentPlaceholder")}
        />
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {canActOnQuote && (
          <>
            <Button onClick={handleAccept} disabled={isPending}>
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
