"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Retirer un évènement de la vue publique, ou l'y remettre (modération). Rien
 * n'est effacé : guide, bugs et historique restent.
 */
export function RemoveEventButton({
  slug,
  removed,
}: {
  slug: string;
  removed: boolean;
}) {
  const t = useTranslations("Timeline.Event");
  const router = useRouter();
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-2 rounded-xl border border-[#FFA08C]/30 bg-[#0E2C45] p-5">
      <p className="text-sm">
        <b className="font-semibold text-[#E3F1FF]">
          {removed ? t("restoreTitle") : t("removeTitle")}
        </b>
        <span className="block text-xs text-muted-foreground">{t("removeHint")}</span>
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!removed && !window.confirm(t("removeConfirm"))) return;
          setError(false);
          startTransition(async () => {
            const response = await fetch(
              `/api/timeline-events/${slug}${removed ? "?restore=1" : ""}`,
              { method: "DELETE" },
            );
            if (!response.ok) {
              setError(true);
              return;
            }
            router.refresh();
          });
        }}
        className="h-8 rounded-lg border border-[#FFA08C]/45 px-3 text-[13px] font-semibold text-[#FFB4A8] disabled:opacity-50"
      >
        {removed ? t("restore") : t("remove")}
      </button>
      {error && <p className="text-xs text-red-400">{t("removeError")}</p>}
    </section>
  );
}
