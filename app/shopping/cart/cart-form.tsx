"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  BuildingStorefrontIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartGroup } from "@/lib/cart";
import { MUTED } from "@/app/shopping/ui";
import { cn } from "@/lib/utils";
import {
  checkoutCartAction,
  removeFromCartAction,
  updateCartQuantityAction,
} from "./actions";

const BOX =
  "rounded-2xl border border-[#9ED0FF]/15 bg-[#092F49]/50 p-5 space-y-4";
const RADIO =
  "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm transition-colors";
const STEP =
  "flex size-10 items-center justify-center hover:bg-[#9ED0FF]/10 disabled:opacity-40";

type Pickup = { other: boolean; proposed: string };

/**
 * Le panier groupé par magasin : quantités, lieu de remise et message pour
 * chacun, puis la validation, qui crée une commande par magasin.
 */
export function CartForm({ groups }: { groups: CartGroup[] }) {
  const t = useTranslations("Cart");
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickups, setPickups] = useState<Record<string, Pickup>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const pickupOf = (group: CartGroup): Pickup =>
    pickups[group.shopId] ?? { other: !group.location, proposed: "" };
  const setPickup = (shopId: string, pickup: Pickup) =>
    setPickups((current) => ({ ...current, [shopId]: pickup }));

  const total = groups.reduce((sum, group) => sum + group.subtotal, 0);
  const blocked = groups.some((group) =>
    group.lines.some((line) => line.problem),
  );
  const missingPickup = groups.some((group) => {
    const pickup = pickupOf(group);
    return pickup.other && !pickup.proposed.trim();
  });

  function run(task: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      await task();
      router.refresh();
    });
  }

  function checkout() {
    setError(null);
    startTransition(async () => {
      const result = await checkoutCartAction({
        shops: groups.map((group) => {
          const pickup = pickupOf(group);
          return {
            shopId: group.shopId,
            proposedPickup: pickup.other ? pickup.proposed : undefined,
            note: notes[group.shopId],
          };
        }),
      });
      // Sans erreur, l'action redirige vers les commandes créées.
      if (result?.error) {
        const shop = groups.find((group) => group.shopId === result.shopId);
        setError(t(`errors.${result.error}`, { shop: shop?.shopName ?? "" }));
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-6">
      <div className="min-w-0 flex-[999_1_560px] space-y-5">
        {groups.map((group, index) => {
          const pickup = pickupOf(group);
          return (
            <section key={group.shopId} className={BOX}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-semibold">
                  <BuildingStorefrontIcon
                    aria-hidden="true"
                    className="size-5 text-[#9ED0FF]"
                  />
                  <Link
                    href={`/shops/${group.shopId}`}
                    className="text-[#CCE7FF] hover:underline"
                  >
                    {group.shopName}
                  </Link>
                </h2>
                {groups.length > 1 && (
                  <span className={cn("text-xs", MUTED)}>
                    {t("orderOf", { n: index + 1, total: groups.length })}
                  </span>
                )}
              </div>

              <ul className="divide-y divide-[#9ED0FF]/10 border-t border-[#9ED0FF]/10">
                {group.lines.map((line) => (
                  <li
                    key={line.listingId}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3"
                  >
                    <Image
                      alt=""
                      src={line.image || "/item_empty.png"}
                      width={56}
                      height={56}
                      className="size-14 shrink-0 rounded-lg object-cover"
                    />
                    <div className="min-w-0 flex-[1_1_200px]">
                      <Link
                        href={`/shopping/i/${line.listingId}`}
                        className="font-semibold text-[#CCE7FF] hover:underline"
                      >
                        {line.name}
                      </Link>
                      <p className={cn("text-xs", MUTED)}>
                        {t("unitLine", {
                          price: format.number(line.unitPrice),
                          available: line.available,
                        })}
                      </p>
                      {line.problem && (
                        <p className="mt-1 text-sm text-amber-200">
                          {t(`problems.${line.problem}`, {
                            available: line.available,
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center overflow-hidden rounded-md border border-[#9ED0FF]/30">
                      <button
                        type="button"
                        className={STEP}
                        aria-label={t("quantityLess")}
                        disabled={isPending || line.quantity <= 1}
                        onClick={() =>
                          run(() =>
                            updateCartQuantityAction(
                              line.listingId,
                              Math.min(
                                line.quantity - 1,
                                Math.max(1, line.available),
                              ),
                            ),
                          )
                        }
                      >
                        <MinusIcon aria-hidden="true" className="size-4" />
                      </button>
                      <span className="w-10 border-x border-[#9ED0FF]/30 text-center font-mono leading-10">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        className={STEP}
                        aria-label={t("quantityMore")}
                        disabled={isPending || line.quantity >= line.available}
                        onClick={() =>
                          run(() =>
                            updateCartQuantityAction(
                              line.listingId,
                              line.quantity + 1,
                            ),
                          )
                        }
                      >
                        <PlusIcon aria-hidden="true" className="size-4" />
                      </button>
                    </div>
                    <span className="w-28 text-right font-mono font-bold">
                      {format.number(line.unitPrice * line.quantity)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove", { name: line.name })}
                      disabled={isPending}
                      onClick={() =>
                        run(() => removeFromCartAction(line.listingId))
                      }
                    >
                      <TrashIcon aria-hidden="true" className="size-5" />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-4 border-t border-[#9ED0FF]/10 pt-4">
                <fieldset className="min-w-0 flex-[1_1_300px] space-y-2">
                  <legend className="mb-2 text-sm font-semibold">
                    {t("pickup")}
                  </legend>
                  {group.location ? (
                    <>
                      <label
                        className={cn(
                          RADIO,
                          !pickup.other
                            ? "border-[#CCE7FF] bg-[#CCE7FF]/6"
                            : "border-[#9ED0FF]/20",
                        )}
                      >
                        <input
                          type="radio"
                          name={`pickup-${group.shopId}`}
                          className="mt-1"
                          checked={!pickup.other}
                          onChange={() =>
                            setPickup(group.shopId, { ...pickup, other: false })
                          }
                        />
                        <span>
                          <span className="block">
                            {group.location.name}
                            {group.location.system && (
                              <span className={MUTED}>
                                {" "}
                                · {group.location.system}
                              </span>
                            )}
                          </span>
                          <span className={cn("text-xs", MUTED)}>
                            {t("pickupListing")}
                          </span>
                        </span>
                      </label>
                      <label
                        className={cn(
                          RADIO,
                          pickup.other
                            ? "border-[#CCE7FF] bg-[#CCE7FF]/6"
                            : "border-[#9ED0FF]/20",
                        )}
                      >
                        <input
                          type="radio"
                          name={`pickup-${group.shopId}`}
                          className="mt-1"
                          checked={pickup.other}
                          onChange={() =>
                            setPickup(group.shopId, { ...pickup, other: true })
                          }
                        />
                        <span>{t("pickupOther")}</span>
                      </label>
                    </>
                  ) : (
                    <p className={cn("text-xs", MUTED)}>{t("pickupNone")}</p>
                  )}
                  {pickup.other && (
                    <Input
                      value={pickup.proposed}
                      onChange={(event) =>
                        setPickup(group.shopId, {
                          ...pickup,
                          proposed: event.target.value,
                        })
                      }
                      placeholder={t("pickupOtherPlaceholder")}
                      aria-label={t("pickupOther")}
                      maxLength={200}
                    />
                  )}
                </fieldset>
                <div className="min-w-0 flex-[1_1_220px] space-y-2">
                  <label
                    htmlFor={`note-${group.shopId}`}
                    className="block text-sm font-semibold"
                  >
                    {t("note")}
                  </label>
                  <Input
                    id={`note-${group.shopId}`}
                    value={notes[group.shopId] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [group.shopId]: event.target.value,
                      }))
                    }
                    placeholder={t("notePlaceholder")}
                    maxLength={2000}
                  />
                </div>
              </div>

              <div className="flex items-baseline justify-between text-sm">
                <span className={MUTED}>{t("subtotal")}</span>
                <span className="font-mono text-base font-bold">
                  {format.number(group.subtotal)} aUEC
                </span>
              </div>
            </section>
          );
        })}
      </div>

      <aside className={cn(BOX, "min-w-0 flex-[1_1_300px] lg:sticky lg:top-4")}>
        <h2 className="font-semibold">{t("recap")}</h2>
        <ul className="space-y-2 text-sm">
          {groups.map((group) => (
            <li key={group.shopId} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{group.shopName}</span>
              <span className="font-mono">{format.number(group.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-[#9ED0FF]/15 pt-3">
          <span className="font-semibold">{t("total")}</span>
          <span className="font-mono text-xl font-bold text-[#CFE8FF]">
            {format.number(total)} aUEC
          </span>
        </div>
        <p className="rounded-lg bg-[#9ED0FF]/8 px-3 py-2 text-sm">
          {t("explain", { count: groups.length })}
        </p>
        {blocked && <p className="text-sm text-amber-200">{t("blocked")}</p>}
        {error && <p className="text-sm text-red-300">{error}</p>}
        <Button
          type="button"
          className="h-12 w-full"
          disabled={isPending || blocked || missingPickup}
          onClick={checkout}
        >
          {isPending
            ? t("validating")
            : t("validate", { count: groups.length })}
        </Button>
        <p className={cn("text-xs", MUTED)}>{t("paymentNote")}</p>
      </aside>
    </div>
  );
}
