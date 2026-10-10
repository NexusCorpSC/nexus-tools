import { MICROS_PER_USD } from "@/types/chat";

/**
 * Un montant en microdollars, en dollars lisibles : deux décimales, quatre
 * sous le dollar (une réponse de Haiku coûte quelques dixièmes de centime).
 */
export function formatUsd(micros: number, locale: string): string {
  const usd = micros / MICROS_PER_USD;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.abs(usd) < 1 && usd !== 0 ? 4 : 2,
  }).format(usd);
}
