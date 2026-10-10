"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { VoicePricing } from "@/lib/chat/pricing";
import {
  CHAT_SPEECH_MODEL_IDS,
  CHAT_SPEECH_MODEL_LABELS,
  CHAT_VOICES,
  type ChatSpeechModelId,
} from "@/types/chat";
import { saveChatVoiceAction } from "../actions";

const SELECT = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

type RatesDraft = { input: string; output: string };

type PricingDraft = {
  transcription: RatesDraft;
  speech: Record<ChatSpeechModelId, RatesDraft>;
};

function toDraft(pricing: VoicePricing): PricingDraft {
  const rates = (entry: { input: number; output: number }) => ({
    input: String(entry.input),
    output: String(entry.output),
  });
  return {
    transcription: rates(pricing.transcription),
    speech: Object.fromEntries(
      CHAT_SPEECH_MODEL_IDS.map((model) => [
        model,
        rates(pricing.speech[model]),
      ]),
    ) as Record<ChatSpeechModelId, RatesDraft>,
  };
}

/**
 * La voix de Nexus Chat (Google) : ouverte ou non, le modèle et la voix de
 * la lecture, et les tarifs de la transcription et de la synthèse.
 */
export function ChatVoiceForm({
  enabled,
  speechModel,
  voice,
  pricing,
  customized,
  hasKey,
}: {
  enabled: boolean;
  speechModel: ChatSpeechModelId;
  voice: string;
  pricing: VoicePricing;
  /** Des tarifs ont été enregistrés (sinon, ceux du code s'appliquent). */
  customized: boolean;
  /** La clé de l'API de Google est configurée sur le serveur. */
  hasKey: boolean;
}) {
  const t = useTranslations("Chat.Admin.voice");
  const errors = useTranslations("Chat.Admin.errors");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const [model, setModel] = useState(speechModel);
  const [selectedVoice, setSelectedVoice] = useState(voice);
  const [draft, setDraft] = useState(() => toDraft(pricing));

  function run(resetPricing: boolean) {
    startTransition(async () => {
      const result = await saveChatVoiceAction({
        enabled: on,
        speechModel: model,
        voice: selectedVoice,
        pricing: resetPricing ? null : draft,
      });
      if (!result.ok) {
        toast.error(errors(result.error));
        return;
      }
      toast.success(resetPricing ? t("resetDone") : t("saved"));
      router.refresh();
    });
  }

  function rateInputs(
    label: string,
    rates: RatesDraft,
    onChange: (rates: RatesDraft) => void,
  ) {
    return (
      <tr className="border-t border-[#9ED0FF]/8">
        <td className="px-2 py-1.5 text-[#F2F7FC]">{label}</td>
        {(["input", "output"] as const).map((key) => (
          <td key={key} className="px-2 py-1.5">
            <Input
              inputMode="decimal"
              aria-label={`${label} · ${t(key)}`}
              value={rates[key]}
              onChange={(event) =>
                onChange({ ...rates, [key]: event.target.value })
              }
              className="h-8 w-24 font-mono"
            />
          </td>
        ))}
      </tr>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        run(false);
      }}
      className="space-y-4 rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75 p-4"
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
          {t("title")}
        </h2>
        <p className="mt-1 text-xs text-[#F2F7FC]/55">{t("intro")}</p>
        {!hasKey && <p className="mt-2 text-xs text-[#F7D2AE]">{t("noKey")}</p>}
      </div>
      <label className="flex items-center gap-2 text-sm text-[#F2F7FC]">
        <input
          type="checkbox"
          checked={on}
          onChange={(event) => setOn(event.target.checked)}
          className="size-4 rounded"
        />
        {t("enabled")}
      </label>
      <div className="flex flex-wrap items-end gap-4">
        <label className="space-y-1 text-sm text-[#F2F7FC]/80">
          <span className="block">{t("speechModel")}</span>
          <select
            value={model}
            onChange={(event) =>
              setModel(event.target.value as ChatSpeechModelId)
            }
            className={SELECT}
          >
            {CHAT_SPEECH_MODEL_IDS.map((id) => (
              <option key={id} value={id}>
                {CHAT_SPEECH_MODEL_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-[#F2F7FC]/80">
          <span className="block">{t("voice")}</span>
          <select
            value={selectedVoice}
            onChange={(event) => setSelectedVoice(event.target.value)}
            className={SELECT}
          >
            {CHAT_VOICES.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="overflow-x-auto">
        <p className="mb-1 text-xs text-[#F2F7FC]/55">{t("pricingIntro")}</p>
        <table className="text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-[#F2F7FC]/60">
            <tr>
              <th className="px-2 py-1.5 font-semibold">{t("model")}</th>
              <th className="px-2 py-1.5 font-semibold">{t("input")}</th>
              <th className="px-2 py-1.5 font-semibold">{t("output")}</th>
            </tr>
          </thead>
          <tbody>
            {rateInputs(t("transcription"), draft.transcription, (rates) =>
              setDraft((current) => ({ ...current, transcription: rates })),
            )}
            {CHAT_SPEECH_MODEL_IDS.map((id) => (
              <Fragment key={id}>
                {rateInputs(
                  CHAT_SPEECH_MODEL_LABELS[id],
                  draft.speech[id],
                  (rates) =>
                    setDraft((current) => ({
                      ...current,
                      speech: { ...current.speech, [id]: rates },
                    })),
                )}
              </Fragment>
            ))}
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
            onClick={() => run(true)}
          >
            {t("reset")}
          </Button>
        )}
      </div>
    </form>
  );
}
