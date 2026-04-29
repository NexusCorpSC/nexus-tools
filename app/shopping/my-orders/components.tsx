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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canCancel = status === "PENDING" || status === "QUOTED";
  const canActOnQuote = status === "QUOTED" && hasQuote;

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction(orderId);
      if (result.error) {
        setError(t("processing"));
      } else {
        router.refresh();
      }
    });
  }

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const result = await acceptQuoteAction(orderId);
      if (result.error) {
        setError(t("processing"));
      } else {
        router.refresh();
      }
    });
  }

  function handleRefuse() {
    setError(null);
    startTransition(async () => {
      const result = await refuseQuoteAction(orderId);
      if (result.error) {
        setError(t("processing"));
      } else {
        router.refresh();
      }
    });
  }

  if (!canCancel && !canActOnQuote) return null;

  return (
    <div className="space-y-3 pt-4 border-t">
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
