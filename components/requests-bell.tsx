"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { ClipboardDocumentListIcon } from "@heroicons/react/24/outline";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { RequestNotice } from "@/types/requests";

type NoticesResponse = {
  notices: RequestNotice[];
  unseen: number;
  alertsOff: boolean;
};

/**
 * La cloche du tableau des demandes : une offre ou un message reçu, un prix
 * proposé, une étape franchie, et les nouvelles demandes des amis et des orgas.
 * L'ouvrir marque tout comme vu ; la case du bas coupe les nouvelles demandes.
 */
export function RequestsBell({
  initialUnseen,
  className,
}: {
  initialUnseen: number;
  className: string;
}) {
  const t = useTranslations("Requests.bell");
  const format = useFormatter();
  const [unseen, setUnseen] = useState(initialUnseen);
  const [data, setData] = useState<NoticesResponse | null>(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    const response = await fetch("/api/me/request-notices").catch(() => null);
    if (!response?.ok) {
      setFailed(true);
      return;
    }
    const body = (await response.json()) as NoticesResponse;
    setData(body);
    if (body.unseen > 0) {
      void fetch("/api/me/request-notices", { method: "POST" });
    }
    setUnseen(0);
  }

  async function toggleAlerts(off: boolean) {
    setData((current) => (current ? { ...current, alertsOff: off } : current));
    const response = await fetch("/api/me/request-notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alertsOff: off }),
    }).catch(() => null);
    if (!response?.ok) {
      setData((current) => (current ? { ...current, alertsOff: !off } : current));
    }
  }

  function line(notice: RequestNotice) {
    const values = {
      name: notice.actorName,
      summary: notice.summary,
      org: notice.orgName ?? "",
      price: notice.unitPrice !== undefined ? format.number(notice.unitPrice) : "",
      b: (chunks: React.ReactNode) => <b className="font-semibold">{chunks}</b>,
    };
    if (notice.type === "request") {
      return t.rich(notice.orgName ? "requestOrg" : "request", values);
    }
    if (notice.type === "status") {
      return t.rich(`status.${notice.status ?? "NEW"}`, values);
    }
    return t.rich(notice.type, values);
  }

  return (
    <Popover onOpenChange={(open) => open && void load()}>
      <PopoverTrigger asChild>
        <button type="button" className={className}>
          <span className="sr-only">
            {unseen > 0 ? t("labelUnseen", { count: unseen }) : t("label")}
          </span>
          <ClipboardDocumentListIcon aria-hidden="true" className="size-5.5" />
          {unseen > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#FFB98A] px-1 text-xs font-bold text-[#062338]">
              {unseen > 9 ? "9+" : unseen}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b border-[#9ED0FF]/15 px-4 py-2.5">
          <span className="text-sm font-semibold">{t("title")}</span>
          <Link href="/demandes" className="text-xs text-[#CCE7FF] hover:underline">
            {t("openBoard")}
          </Link>
        </div>
        {failed ? (
          <p className="px-4 py-3 text-sm text-red-300">{t("error")}</p>
        ) : data === null ? (
          <p className="px-4 py-3 text-sm text-white/60">{t("loading")}</p>
        ) : data.notices.length === 0 ? (
          <p className="px-4 py-3 text-sm text-white/60">{t("empty")}</p>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-[#9ED0FF]/10 overflow-y-auto">
            {data.notices.map((notice) => (
              <li key={notice.id}>
                <Link
                  href={notice.path}
                  className={cn(
                    "block space-y-1 px-4 py-3 text-sm hover:bg-[#9ED0FF]/8",
                    !notice.seen && "bg-[#FFB98A]/8",
                  )}
                >
                  <p>{line(notice)}</p>
                  {notice.excerpt && (
                    <p className="line-clamp-2 text-xs text-white/60">« {notice.excerpt} »</p>
                  )}
                  <p className="text-xs text-white/45">
                    {format.relativeTime(new Date(notice.at), new Date())}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {data && (
          <label className="flex cursor-pointer items-start gap-2 border-t border-[#9ED0FF]/15 px-4 py-2.5 text-xs text-[#A9CDEE]">
            <input
              type="checkbox"
              checked={!data.alertsOff}
              onChange={(event) => void toggleAlerts(!event.target.checked)}
              className="mt-0.5 size-3.5 accent-[#FFB98A]"
            />
            {t("alerts")}
          </label>
        )}
      </PopoverContent>
    </Popover>
  );
}
