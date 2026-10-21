"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { TimelineEventSummary } from "@/types/timeline-events";

/**
 * Le bandeau d'accueil : l'évènement officiel en cours, quand il y en a un.
 * Chargé après coup, pour que l'accueil reste une page statique.
 */
export function TimelineLiveBanner() {
  const t = useTranslations("Timeline.HomeBanner");
  const [events, setEvents] = useState<TimelineEventSummary[]>([]);

  useEffect(() => {
    let current = true;
    fetch("/api/timeline-events?status=live")
      .then((response) => (response.ok ? response.json() : { events: [] }))
      .then((data: { events?: TimelineEventSummary[] }) => {
        if (current) setEvents(data.events ?? []);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, []);

  const [event, ...others] = events;
  if (!event) return null;

  return (
    <Link
      href={`/timeline/${event.slug}`}
      className="mx-auto mb-8 flex max-w-2xl flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-[#7FF0D0]/35 bg-[#7FF0D0]/8 px-4 py-2.5 text-sm no-underline backdrop-blur-sm hover:bg-[#7FF0D0]/12"
    >
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#7FF0D0]">
        <span className="size-2 rounded-full bg-[#7FF0D0]" />
        {t("live")}
      </span>
      <span className="font-semibold text-[#E3F1FF]">{event.name}</span>
      <span className="text-[#9ED0FF]/80">
        {others.length > 0 ? t("andMore", { count: others.length }) : event.summary}
      </span>
      <span className="font-semibold text-[#9ED0FF]">{t("see")} →</span>
    </Link>
  );
}
