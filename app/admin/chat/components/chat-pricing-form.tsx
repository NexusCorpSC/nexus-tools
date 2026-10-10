"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatPricing, Rates } from "@/lib/chat/pricing";
import {
  CHAT_MODEL_IDS,
  CHAT_MODEL_LABELS,
  type ChatModelId,
} from "@/types/chat";
import { saveChatPricingAction } from "../actions";

const RATE_KEYS = ["input", "output", "cacheRead", "cacheWrite"] as const;

type RatesDraft = Record<(typeof RATE_KEYS)[number], string>;
type Draft = Record<
  ChatModelId,
  RatesDraft & { longContext?: RatesDraft & { threshold: string } }
>;

function ratesDraft(rates: Rates): RatesDraft {
  return {
    input: String(rates.input),
    output: String(rates.output),
    cacheRead: String(rates.cacheRead),
    cacheWrite: String(rates.cacheWrite),
  };
}

function toDraft(pricing: ChatPricing): Draft {
  const draft = {} as Draft;
  for (const model of CHAT_MODEL_IDS) {
    const entry = pricing[model];
    draft[model] = {
      ...ratesDraft(entry),
      ...(entry.longContext && {
        longContext: {
          ...ratesDraft(entry.longContext),
          threshold: String(entry.longContext.threshold),
        },
      }),
    };
  }
  return draft;
}

/**
 * Les tarifs des modèles, en dollars par million de jetons : ce sur quoi le
 * coût de chaque réponse est calculé. Pré-remplis avec ceux d'Anthropic tant
 * qu'ils n'ont pas été changés ; « Rétablir » y revient.
 */
export function ChatPricingForm({
  pricing,
  customized,
}: {
  pricing: ChatPricing;
  /** Des tarifs ont été enregistrés (sinon, ceux du code s'appliquent). */
  customized: boolean;
}) {
  const t = useTranslations("Chat.Admin.pricing");
  const errors = useTranslations("Chat.Admin.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(() => toDraft(pricing));

  function run(input: Draft | null, done: string) {
    startTransition(async () => {
      const result = await saveChatPricingAction(input);
      if (!result.ok) {
        toast.error(errors(result.error));
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  function cell(
    value: string,
    label: string,
    onChange: (value: string) => void,
  ) {
    return (
      <td key={label} className="px-2 py-1.5">
        <Input
          inputMode="decimal"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-24 font-mono"
        />
      </td>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(draft, t("saved"));
      }}
      className="space-y-4 rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75 p-4"
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
          {t("title")}
        </h2>
        <p className="mt-1 text-xs text-[#F2F7FC]/55">{t("intro")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-[#F2F7FC]/60">
            <tr>
              <th className="px-2 py-1.5 font-semibold">{t("model")}</th>
              {RATE_KEYS.map((key) => (
                <th key={key} className="px-2 py-1.5 font-semibold">
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHAT_MODEL_IDS.map((model) => {
              const entry = draft[model];
              const long = entry.longContext;
              const set = (key: (typeof RATE_KEYS)[number], value: string) =>
                setDraft((current) => ({
                  ...current,
                  [model]: { ...current[model], [key]: value },
                }));
              const setLong = (
                key: (typeof RATE_KEYS)[number] | "threshold",
                value: string,
              ) =>
                setDraft((current) => ({
                  ...current,
                  [model]: {
                    ...current[model],
                    longContext: {
                      ...current[model].longContext!,
                      [key]: value,
                    },
                  },
                }));
              return (
                <Fragment key={model}>
                  <tr className="border-t border-[#9ED0FF]/8">
                    <td className="px-2 py-1.5 text-[#F2F7FC]">
                      {CHAT_MODEL_LABELS[model]}
                    </td>
                    {RATE_KEYS.map((key) =>
                      cell(
                        entry[key],
                        `${CHAT_MODEL_LABELS[model]} · ${t(key)}`,
                        (value) => set(key, value),
                      ),
                    )}
                  </tr>
                  {long && (
                    <tr>
                      <td className="px-2 py-1.5 text-xs text-[#F2F7FC]/70">
                        <span className="flex items-center gap-1.5">
                          {t("longContext")}
                          <Input
                            inputMode="numeric"
                            aria-label={t("threshold")}
                            value={long.threshold}
                            onChange={(event) =>
                              setLong("threshold", event.target.value)
                            }
                            className="h-8 w-24 font-mono"
                          />
                        </span>
                      </td>
                      {RATE_KEYS.map((key) =>
                        cell(
                          long[key],
                          `${CHAT_MODEL_LABELS[model]} · ${t("longContext")} · ${t(key)}`,
                          (value) => setLong(key, value),
                        ),
                      )}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
        {customized && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(null, t("resetDone"))}
          >
            {t("reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
