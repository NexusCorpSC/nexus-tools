"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  MAX_RADAR_READING,
  RADAR_CATEGORIES,
  identifyRadarSignature,
  type RadarMatch,
  type RadarSignature,
} from "@/lib/radar";

/** Les chiffres seuls : « 12 680 », « 12,680 » et « 12680 » se valent. */
function parseReading(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return value > 0 && value <= MAX_RADAR_READING ? value : null;
}

function MatchRow({
  match,
  format,
}: {
  match: RadarMatch;
  format: (value: number) => string;
}) {
  const t = useTranslations("Radar");
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium text-[#CCE7FF]">
          {match.signature.name}
        </p>
        <p className="text-xs text-[#9ED0FF]/60">
          {t(`categories.${match.signature.category}`)} ·{" "}
          {t("base", { value: format(match.signature.value) })}
          {!match.exact &&
            ` · ${t("difference", {
              value: `${match.difference > 0 ? "+" : ""}${format(match.difference)}`,
            })}`}
        </p>
      </div>
      <span className="shrink-0 rounded-md bg-[#9ED0FF]/10 px-2 py-1 font-mono text-sm text-[#CCE7FF]">
        {t("count", { count: match.count })}
      </span>
    </li>
  );
}

export default function RadarScanner({
  signatures,
}: {
  signatures: RadarSignature[];
}) {
  const t = useTranslations("Radar");
  const locale = useLocale();
  const [text, setText] = useState("");

  const format = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale);
    return (value: number) => formatter.format(value);
  }, [locale]);

  const reading = parseReading(text);
  const result =
    reading === null ? null : identifyRadarSignature(reading, signatures);

  const grouped = RADAR_CATEGORIES.map((category) => ({
    category,
    signatures: signatures.filter(
      (signature) => signature.category === category,
    ),
  })).filter((group) => group.signatures.length > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-[#CCE7FF]">
            {t("inputLabel")}
          </span>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            inputMode="numeric"
            placeholder="12 680"
            className="h-12 font-mono text-2xl"
            autoFocus
          />
        </label>

        {text.trim() !== "" && reading === null && (
          <p className="text-sm text-amber-300">{t("invalid")}</p>
        )}

        {result && result.matches.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-[#CCE7FF]">
              {t("matches", { value: format(result.value) })}
            </h2>
            <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/15">
              {result.matches.map((match) => (
                <MatchRow
                  key={match.signature.id}
                  match={match}
                  format={format}
                />
              ))}
            </ul>
          </div>
        )}

        {result && result.matches.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-[#9ED0FF]/80">{t("noMatch")}</p>
            {result.approximate.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-[#CCE7FF]">
                  {t("approximate")}
                </h2>
                <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/15">
                  {result.approximate.map((match) => (
                    <MatchRow
                      key={match.signature.id}
                      match={match}
                      format={format}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <p className="text-xs text-[#9ED0FF]/60">{t("howItWorks")}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#CCE7FF]">
          {t("reference")}
        </h2>
        {grouped.map((group) => (
          <div key={group.category} className="space-y-1">
            <h3 className="text-sm font-semibold text-[#9ED0FF]">
              {t(`categories.${group.category}`)}
            </h3>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-3">
              {group.signatures.map((signature) => (
                <li
                  key={signature.id}
                  className="flex justify-between gap-2 text-[#F2F7FC]/80"
                >
                  <span className="truncate">{signature.name}</span>
                  <span className="font-mono text-[#CCE7FF]">
                    {format(signature.value)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
