"use client";

import { useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";

function noSubscription() {
  return () => {};
}

/**
 * L'heure d'une session prévue, dans le fuseau du lecteur : « 21:00 » le jour
 * même, « demain 21:00 », puis « sam. 21:00 ».
 *
 * Rien n'est écrit avant que le navigateur ne prenne la main : le serveur ne
 * connaît pas le fuseau, et l'hydratation ne corrige pas un texte qui diffère.
 */
export function PlannedTime({
  at,
  className,
}: {
  at: string;
  className?: string;
}) {
  const t = useTranslations("PlannedSession");
  const locale = useLocale();
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  if (!inBrowser) return <span className={className}>&nbsp;</span>;

  const date = new Date(at);
  const today = new Date();
  const days = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() -
      new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      ).getTime()) /
      86_400_000,
  );
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return (
    <span className={className}>
      {days <= 0
        ? time
        : days === 1
          ? t("tomorrow", { time })
          : t("onDay", {
              day: new Intl.DateTimeFormat(locale, {
                weekday: "short",
              }).format(date),
              time,
            })}
    </span>
  );
}
