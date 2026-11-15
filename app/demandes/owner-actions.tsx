"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { REQUEST_EXPIRY_DAYS, type PlayerRequest } from "@/types/requests";
import { GHOST_BUTTON_SM } from "@/app/demandes/ui";

/** Ce que l'auteur fait de sa demande : modifier, prolonger, clôturer. */
export function OwnerActions({ request }: { request: PlayerRequest }) {
  const t = useTranslations("Requests");
  const router = useRouter();
  const [extending, setExtending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/requests/${encodeURIComponent(request.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(t.has(`errors.${data.error}`) ? t(`errors.${data.error}`) : t("errors.generic"));
        return;
      }
      setExtending(false);
      setConfirmClose(false);
      router.refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  const open = request.status === "OPEN" || request.status === "EXPIRED";
  const closed = request.status === "CLOSED";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!closed && (
          <Link href={`/demandes/${request.id}/edit`} className={GHOST_BUTTON_SM}>
            {t("owner.edit")}
          </Link>
        )}
        {open && (
          <button type="button" className={GHOST_BUTTON_SM} onClick={() => setExtending(!extending)}>
            {t("owner.extend")}
          </button>
        )}
        {!closed &&
          (confirmClose ? (
            <span className="flex items-center gap-2 text-xs text-[#A9CDEE]">
              {t("owner.closeConfirm")}
              <button
                type="button"
                className="font-semibold text-red-200 hover:underline"
                disabled={busy}
                onClick={() => void patch({ action: "close" })}
              >
                {t("owner.closeYes")}
              </button>
              <button type="button" className="hover:underline" onClick={() => setConfirmClose(false)}>
                {t("cancel")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              className="px-1 text-xs font-medium text-[#A9CDEE] hover:text-[#E3F1FF]"
              onClick={() => setConfirmClose(true)}
            >
              {t("owner.close")}
            </button>
          ))}
      </div>
      {extending && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#A9CDEE]">
          {t("owner.extendBy")}
          {REQUEST_EXPIRY_DAYS.map((days) => (
            <button
              key={days}
              type="button"
              disabled={busy}
              className={GHOST_BUTTON_SM}
              onClick={() => void patch({ action: "extend", days })}
            >
              {t("form.days", { count: days })}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}
