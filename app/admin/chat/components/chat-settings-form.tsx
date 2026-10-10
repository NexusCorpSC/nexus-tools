"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveChatSettingsAction } from "../actions";

const SELECT = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

/** L'interrupteur général, le modèle et le budget proposé par défaut. */
export function ChatSettingsForm({
  enabled,
  model,
  defaultBudgetUsd,
  models,
}: {
  enabled: boolean;
  model: string;
  defaultBudgetUsd: number;
  models: { id: string; label: string }[];
}) {
  const t = useTranslations("Chat.Admin");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [on, setOn] = useState(enabled);
  const [selected, setSelected] = useState(model);
  const [budget, setBudget] = useState(String(defaultBudgetUsd));

  function save(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await saveChatSettingsAction({
        enabled: on,
        model: selected,
        defaultBudgetUsd: budget,
      });
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("saved"));
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={save}
      className="space-y-4 rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75 p-4"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
        {t("settingsTitle")}
      </h2>
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
          <span className="block">{t("model")}</span>
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            className={SELECT}
          >
            {models.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm text-[#F2F7FC]/80">
          <span className="block">{t("defaultBudget")}</span>
          <Input
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            className="w-32"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
      <p className="text-xs text-[#F2F7FC]/55">{t("modelHint")}</p>
    </form>
  );
}
