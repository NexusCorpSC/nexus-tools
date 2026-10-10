import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  getChatSettings,
  hasCustomChatPricing,
  hasCustomVoicePricing,
  hasVoiceKey,
  listChatAccess,
} from "@/lib/chat/access";
import { CHAT_MODEL_IDS, CHAT_MODEL_LABELS } from "@/types/chat";
import { ChatSettingsForm } from "./components/chat-settings-form";
import { ChatAccessManager } from "./components/chat-access-manager";
import { ChatPricingForm } from "./components/chat-pricing-form";
import { ChatVoiceForm } from "./components/chat-voice-form";

export const metadata: Metadata = {
  title: "Admin — Nexus Chat",
  description: "Accès des joueurs à Nexus Chat et budgets mensuels.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Nexus Chat côté admin : l'interrupteur général et le modèle, puis les
 * joueurs — demandes en attente, accès ouverts avec leur budget du mois et ce
 * qu'ils en ont consommé, accès retirés.
 */
export default async function AdminChatPage() {
  const t = await getTranslations("Chat.Admin");
  const [settings, rows, customPricing, customVoicePricing] = await Promise.all(
    [
      getChatSettings(),
      listChatAccess(),
      hasCustomChatPricing(),
      hasCustomVoicePricing(),
    ],
  );

  return (
    <div className="flex min-h-screen justify-center px-4 py-12">
      <div className="w-full max-w-5xl space-y-8 rounded-2xl border border-[#9ED0FF]/20 bg-[#0B3A5A]/70 p-6 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-8">
        <div>
          <h1 className="text-2xl font-bold text-[#CCE7FF]">{t("title")}</h1>
          <p className="mt-1 text-[#9ED0FF]/70">{t("intro")}</p>
        </div>

        <ChatSettingsForm
          enabled={settings.enabled}
          model={settings.model}
          defaultBudgetUsd={settings.defaultMonthlyBudgetMicros / 1_000_000}
          models={CHAT_MODEL_IDS.map((id) => ({
            id,
            label: CHAT_MODEL_LABELS[id],
          }))}
        />

        <ChatPricingForm
          pricing={settings.pricing}
          customized={customPricing}
        />

        <ChatVoiceForm
          enabled={settings.voice.enabled}
          speechModel={settings.voice.speechModel}
          voice={settings.voice.voice}
          pricing={settings.voice.pricing}
          customized={customVoicePricing}
          hasKey={hasVoiceKey()}
        />

        <ChatAccessManager
          rows={rows}
          defaultBudgetUsd={settings.defaultMonthlyBudgetMicros / 1_000_000}
        />

        <div className="border-t border-[#9ED0FF]/15 pt-4">
          <Button asChild variant="outline">
            <Link href="/admin">{t("backToAdmin")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
