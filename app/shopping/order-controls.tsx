"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  orderTransitionAction,
  postOrderMessageAction,
} from "@/app/shopping/order-actions";
import type { OrderAction, OrderKind, OrderRole } from "@/lib/shop-orders";

/** Les actions qui terminent ou font reculer la commande : en second plan. */
const SECONDARY: OrderAction[] = ["cancel", "refuse", "decline"];

/**
 * Le champ de message commun au fil et aux actions : écrire puis envoyer,
 * ou écrire puis confirmer, refuser… le texte accompagne alors l'action.
 */
export function OrderControls({
  orderId,
  role,
  actions,
  kind,
}: {
  orderId: string;
  role: OrderRole;
  actions: OrderAction[];
  kind: OrderKind;
}) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Annuler ou refuser se confirme d'un second clic.
  const [confirming, setConfirming] = useState<OrderAction | null>(null);
  const [isPending, startTransition] = useTransition();
  const canQuote = actions.includes("quote");
  const primary = actions.filter(
    (action) => action !== "quote" && !SECONDARY.includes(action),
  );
  const secondary = actions.filter((action) => SECONDARY.includes(action));

  function run(task: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await task();
      if (result.error) {
        setError(t(`errors.${result.error}`));
      } else {
        setMessage("");
        setQuote("");
        router.refresh();
      }
    });
  }

  function act(action: OrderAction) {
    setConfirming(null);
    run(() =>
      orderTransitionAction(orderId, action, role, {
        message,
        quote: action === "quote" ? Number(quote) : undefined,
      }),
    );
  }

  const quoteValue = Number(quote);
  const quoteValid =
    quote.trim() !== "" && Number.isInteger(quoteValue) && quoteValue >= 0;

  return (
    <div className="space-y-3 border-t border-[#9ED0FF]/15 pt-4">
      <label htmlFor="order-message" className="sr-only">
        {t("messageLabel")}
      </label>
      <Textarea
        id="order-message"
        rows={3}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder={
          role === "buyer"
            ? t("messagePlaceholderBuyer")
            : t("messagePlaceholderSeller")
        }
        maxLength={2000}
        disabled={isPending}
      />

      {canQuote && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="order-quote" className="text-sm">
            {t("quoteLabel")}
          </label>
          <Input
            id="order-quote"
            type="number"
            min={0}
            step={1}
            className="w-40"
            value={quote}
            onChange={(event) => setQuote(event.target.value)}
            disabled={isPending}
          />
          <span className="text-sm text-[#9ED0FF]/70">aUEC</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => act("quote")}
            disabled={isPending || !quoteValid}
          >
            {t("actions.quote")}
          </Button>
          {kind === "DIRECT" && (
            <p className="w-full text-xs text-[#9ED0FF]/70">
              {t("quoteHelpDirect")}
            </p>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={primary.length > 0 ? "outline" : "default"}
          onClick={() =>
            run(() => postOrderMessageAction(orderId, role, message))
          }
          disabled={isPending || !message.trim()}
        >
          {t("send")}
        </Button>
        {primary.map((action) => (
          <Button
            key={action}
            type="button"
            onClick={() => act(action)}
            disabled={isPending}
          >
            {t(`actions.${action}`)}
          </Button>
        ))}
        {secondary.map((action) => (
          <Button
            key={action}
            type="button"
            variant={confirming === action ? "destructive" : "ghost"}
            onClick={() =>
              confirming === action ? act(action) : setConfirming(action)
            }
            onBlur={() => setConfirming(null)}
            disabled={isPending}
          >
            {confirming === action
              ? t(`confirm.${action}`)
              : t(`actions.${action}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
