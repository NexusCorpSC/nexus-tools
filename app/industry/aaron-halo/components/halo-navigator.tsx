"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeftRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useUrlFilters } from "@/lib/list-url";
import { parseShowLocation } from "@/lib/nps-geometry";
import {
  DEFAULT_HALO_BANDS,
  HALO_POINTS,
  findHaloPoint,
  haloBandRoutes,
  haloGigametres,
  haloMegametres,
  haloPlacement,
  haloRoute,
  haloWindowSize,
  type HaloBand,
  type HaloPass,
  type HaloPoint,
} from "@/lib/aaron-halo";
import HaloMap from "./halo-map";

const SELECT =
  "h-10 w-full rounded-md border border-[#9ED0FF]/20 bg-[#0B1D2E] px-3 text-sm text-[#F2F7FC] focus:border-[#9ED0FF]/60 focus:outline-none";

const WINDOW_TONE = {
  narrow: "border-amber-300/40 bg-amber-300/10 text-amber-100",
  normal: "border-[#9ED0FF]/30 bg-[#9ED0FF]/10 text-[#CCE7FF]",
  wide: "border-emerald-300/40 bg-emerald-300/10 text-emerald-100",
} as const;

/** Les points regroupés par planète, dans l'ordre du système. */
function groupedPoints(points: HaloPoint[]) {
  const bodies = [...new Set(points.map((point) => point.body))];
  return bodies.map((body) => ({
    body,
    points: points.filter((point) => point.body === body),
  }));
}

function pointName(point: HaloPoint) {
  return point.station ? `${point.label} · ${point.station}` : point.label;
}

function PointSelect({
  label,
  value,
  onChange,
  exclude,
  empty,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  exclude?: string;
  empty?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-[#CCE7FF]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={SELECT}
      >
        {empty !== undefined && <option value="">{empty}</option>}
        {groupedPoints(HALO_POINTS).map((group) => (
          <optgroup key={group.body} label={group.body}>
            {group.points
              .filter((point) => point.id !== exclude)
              .map((point) => (
                <option key={point.id} value={point.id}>
                  {pointName(point)}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function BandPicker({
  bands,
  value,
  onChange,
}: {
  bands: HaloBand[];
  value: number;
  onChange: (id: number) => void;
}) {
  const t = useTranslations("AaronHalo");
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium text-[#CCE7FF]">
        {t("bandLabel")}
      </span>
      <div
        role="radiogroup"
        aria-label={t("bandLabel")}
        className="grid grid-cols-5 gap-1 sm:grid-cols-10"
      >
        {bands.map((band) => (
          <button
            key={band.id}
            type="button"
            role="radio"
            aria-checked={value === band.id}
            title={t("bandDensity", {
              density: Math.round(band.density * 100),
            })}
            onClick={() => onChange(band.id)}
            className={`flex flex-col items-center gap-1 rounded-md border px-1 pt-1.5 pb-1 text-sm transition-colors ${
              value === band.id
                ? "border-[#9ED0FF]/60 bg-[#9ED0FF]/20 text-[#F2F7FC]"
                : "border-[#9ED0FF]/15 text-[#9ED0FF]/80 hover:bg-[#9ED0FF]/10"
            }`}
          >
            <span className="font-mono">{band.id}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-[#9ED0FF]/10">
              <span
                className="block h-full rounded-full bg-[#9ED0FF]"
                style={{ width: `${Math.max(4, band.density * 100)}%` }}
              />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HaloNavigator({
  initialFrom,
  initialTo,
  initialBand,
}: {
  initialFrom: string;
  initialTo: string | null;
  initialBand: number;
}) {
  const t = useTranslations("AaronHalo");
  const locale = useLocale();
  const bands = DEFAULT_HALO_BANDS;

  const [fromId, setFromId] = useState(initialFrom);
  const [toId, setToId] = useState<string | null>(initialTo);
  const [bandId, setBandId] = useState(initialBand);
  const [located, setLocated] = useState("");

  useUrlFilters({ from: fromId, to: toId, band: String(bandId) });

  const gm = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return (meters: number) => `${formatter.format(haloGigametres(meters))} Gm`;
  }, [locale]);
  const mm = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale);
    return (meters: number) => `${formatter.format(haloMegametres(meters))} Mm`;
  }, [locale]);

  const from = findHaloPoint(fromId) ?? HALO_POINTS[0];
  const band = bands.find((one) => one.id === bandId) ?? bands[0];
  const candidates = useMemo(
    () => haloBandRoutes(from, band.id, HALO_POINTS, bands),
    [from, band, bands],
  );
  // Sans arrivée choisie, la plus large fenêtre vers la bande voulue.
  const to =
    findHaloPoint(toId && toId !== from.id ? toId : null) ??
    candidates[0]?.to ??
    null;
  const route = useMemo(
    () => (to ? haloRoute(from, to, bands) : null),
    [from, to, bands],
  );
  const passes = route?.passes.filter((pass) => pass.band.id === band.id) ?? [];
  const pass = passes.reduce<HaloPass | null>(
    (best, one) => (!best || one.width > best.width ? one : best),
    null,
  );

  const position = located.trim() ? parseShowLocation(located) : null;
  const placement = position ? haloPlacement(position, bands) : null;

  function swap() {
    if (!to) return;
    setFromId(to.id);
    setToId(from.id);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="space-y-4">
        <PointSelect
          label={t("from")}
          value={from.id}
          onChange={(id) => {
            setFromId(id);
            if (id === toId) setToId(null);
          }}
        />

        <BandPicker bands={bands} value={band.id} onChange={setBandId} />

        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <PointSelect
              label={t("to")}
              value={toId && toId !== from.id ? toId : ""}
              onChange={(id) => setToId(id || null)}
              exclude={from.id}
              empty={t("bestTo")}
            />
          </div>
          <button
            type="button"
            onClick={swap}
            disabled={!to}
            title={t("swap")}
            className="flex h-10 shrink-0 items-center justify-center rounded-md border border-[#9ED0FF]/20 px-3 text-[#CCE7FF] transition-colors hover:bg-[#9ED0FF]/10 disabled:opacity-40"
          >
            <span className="sr-only">{t("swap")}</span>
            <ArrowLeftRight className="size-4" />
          </button>
        </div>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[#CCE7FF]">
            {t("candidates", { band: band.id, from: from.label })}
          </h2>
          {candidates.length > 0 ? (
            <ul className="max-h-80 divide-y divide-[#9ED0FF]/10 overflow-y-auto rounded-lg border border-[#9ED0FF]/15">
              {candidates.map((candidate) => {
                const size = haloWindowSize(candidate.pass.width);
                const selected = candidate.to.id === to?.id;
                return (
                  <li key={candidate.to.id}>
                    <button
                      type="button"
                      onClick={() => setToId(candidate.to.id)}
                      aria-pressed={selected}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                        selected ? "bg-[#9ED0FF]/15" : "hover:bg-[#9ED0FF]/5"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#F2F7FC]">
                          {candidate.to.label}
                        </span>
                        <span className="block text-xs text-[#9ED0FF]/70">
                          {t("cutAtShort", {
                            distance: gm(candidate.pass.targetRemaining),
                          })}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 font-mono text-xs ${WINDOW_TONE[size]}`}
                      >
                        {mm(candidate.pass.width)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[#9ED0FF]/70">
              {t("noCandidate", { band: band.id, from: from.label })}
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        {route && to ? (
          pass ? (
            <div className="space-y-3 rounded-xl border border-[#9ED0FF]/25 bg-[#0B1D2E]/70 p-4">
              <p className="text-sm text-[#9ED0FF]/80">
                {t("routeLine", {
                  from: from.label,
                  to: to.label,
                  length: gm(route.length),
                })}
              </p>
              <div>
                <p className="text-sm text-[#CCE7FF]">
                  {t("cutAt", { band: band.id, to: to.label })}
                </p>
                <p className="font-mono text-5xl font-semibold tracking-wide text-[#F2F7FC]">
                  {gm(pass.targetRemaining)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span
                  className={`rounded border px-2 py-0.5 font-mono ${WINDOW_TONE[haloWindowSize(pass.width)]}`}
                >
                  {t(`window.${haloWindowSize(pass.width)}`, {
                    width: mm(pass.width),
                  })}
                </span>
                <span className="text-[#9ED0FF]/80">
                  {t("between", {
                    enter: gm(pass.enterRemaining),
                    exit: gm(pass.exitRemaining),
                  })}
                </span>
              </div>
              {passes.length > 1 && (
                <p className="text-xs text-[#9ED0FF]/70">{t("twice")}</p>
              )}
              <p className="text-xs text-[#9ED0FF]/60">
                {t("travelled", { distance: gm(pass.targetTravelled) })}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 text-sm text-amber-100">
              {t("noCrossing", {
                from: from.label,
                to: to.label,
                band: band.id,
              })}
            </div>
          )
        ) : null}

        <HaloMap
          bands={bands}
          points={HALO_POINTS}
          from={from}
          to={to}
          band={band}
          target={pass?.target ?? null}
          position={position}
        />

        {route && route.passes.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[#CCE7FF]">
              {t("allBands")}
            </h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[#9ED0FF]/70">
                  <th className="py-1 font-normal">{t("table.band")}</th>
                  <th className="py-1 font-normal">{t("table.cut")}</th>
                  <th className="py-1 font-normal">{t("table.window")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#9ED0FF]/10">
                {route.passes.map((one, index) => (
                  <tr
                    key={`${one.band.id}-${index}`}
                    onClick={() => setBandId(one.band.id)}
                    className={`cursor-pointer ${
                      one.band.id === band.id
                        ? "bg-[#9ED0FF]/10 text-[#F2F7FC]"
                        : "text-[#F2F7FC]/80 hover:bg-[#9ED0FF]/5"
                    }`}
                  >
                    <td className="py-1.5 font-mono">{one.band.id}</td>
                    <td className="py-1.5 font-mono">
                      {gm(one.targetRemaining)}
                    </td>
                    <td className="py-1.5 font-mono">{mm(one.width)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="space-y-2 rounded-lg border border-[#9ED0FF]/15 p-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#CCE7FF]">
              {t("whereAmI")}
            </span>
            <Textarea
              value={located}
              onChange={(event) => setLocated(event.target.value)}
              placeholder="Coordinates: x:20214112346.000 y:-7356422124.000 z:0.000"
              rows={2}
              className="font-mono text-xs"
            />
          </label>
          {located.trim() !== "" && !position && (
            <p className="text-sm text-amber-300">{t("whereInvalid")}</p>
          )}
          {placement &&
            (placement.inside ? (
              <p className="text-sm text-emerald-200">
                {t("inBand", {
                  band: placement.band.id,
                  distance: gm(placement.distance),
                })}
              </p>
            ) : (
              <p className="text-sm text-[#CCE7FF]">
                {t(placement.towards === "out" ? "beforeBand" : "afterBand", {
                  band: placement.nearest.id,
                  gap: mm(placement.gap),
                  distance: gm(placement.distance),
                })}
              </p>
            ))}
        </div>

        <div className="space-y-1 text-xs text-[#9ED0FF]/70">
          <p className="font-semibold text-[#CCE7FF]">{t("howTitle")}</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>{t("how1", { to: to?.label ?? "…" })}</li>
            <li>{t("how2")}</li>
            <li>{t("how3")}</li>
          </ol>
          <p>{t("source")}</p>
        </div>
      </section>
    </div>
  );
}
