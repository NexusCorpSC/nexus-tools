"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { orderTransitionAction } from "@/app/shopping/order-actions";
import type { OrderAction } from "@/lib/shop-orders";

/** Le geste suivant d'une commande, sans ouvrir sa fiche : prête, remise. */
export function BoardAction({
  orderId,
  action,
}: {
  orderId: string;
  action: OrderAction;
}) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 px-2.5 text-xs"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await orderTransitionAction(orderId, action, "seller");
            if (result.error) setError(t(`errors.${result.error}`));
            else router.refresh();
          });
        }}
      >
        {t(`actions.${action}`)}
      </Button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
