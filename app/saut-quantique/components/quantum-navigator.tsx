"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { useUrlFilters } from "@/lib/list-url";
import { parseShowLocation } from "@/lib/nps-geometry";
import {
  CUT_ERROR_MAX,
  CUT_ERROR_SHARE,
  findQtBeacon,
  planQuantumRoute,
  qtTarget,
  qtUnits,
  quantumSystem,
  type QtCandidate,
  type QtVector,
} from "@/lib/quantum-route";
import type { NpsResponse } from "@/types/places";
import QuantumMap from "./quantum-map";

const SELECT =
  "h-10 w-full rounded-md border border-[#9ED0FF]/20 bg-[#0B1D2E] px-3 text-sm text-[#F2F7FC] focus:border-[#9ED0FF]/60 focus:outline-none";

/** Les lieux en orbite tournent avec leur corps : on recalcule de temps en temps. */
const REFRESH_MS = 60 * 1000;

type Mode = "marker" | "place" | "coordinates";

export type QuantumInitial = {
  marker?: string;
  place?: string;
  system?: string;
  coordinates?: QtVector;
  from?: string;
};

function initialMode(initial: QuantumInitial): Mode {
  if (initial.marker) return "marker";
  if (initial.place) return "place";
  return "coordinates";
}

/** `x y z`, `x, y, z` ou la ligne de /showlocation. */
function parseCoordinates(text: string): QtVector | null {
  const shown = parseShowLocation(text);
  if (shown) return shown;
  const numbers = text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (numbers.length !== 3 || !numbers.every(Number.isFinite)) return null;
  const [x, y, z] = numbers;
  return { x, y, z };
}

function candidateKey(candidate: QtCandidate) {
  return `${candidate.from?.id ?? ""}>${candidate.to.id}>${candidate.cut}`;
}

export default function QuantumNavigator({
  initial,
}: {
  initial: QuantumInitial;
}) {
  const t = useTranslations("QuantumRoute");
  const locale = useLocale();

  const [data, setData] = useState<NpsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const [mode, setMode] = useState<Mode>(initialMode(initial));
  const [markerId, setMarkerId] = useState(initial.marker ?? "");
  const [placeSlug, setPlaceSlug] = useState(initial.place ?? "");
  const [system, setSystem] = useState(initial.system ?? "stanton");
  const [coordinatesText, setCoordinatesText] = useState(
    initial.coordinates
      ? `${initial.coordinates.x} ${initial.coordinates.y} ${initial.coordinates.z}`
      : "",
  );
  const [fromId, setFromId] = useState(initial.from ?? "");
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/lieux/nps")
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<NpsResponse>;
      })
      .then((json) => alive && setData(json))
      .catch(() => alive && setFailed(true));
    const timer = window.setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const coordinates = useMemo(
    () => parseCoordinates(coordinatesText),
    [coordinatesText],
  );
  useUrlFilters({
    marker: mode === "marker" ? markerId || null : null,
    place: mode === "place" ? placeSlug || null : null,
    system: mode === "coordinates" ? system : null,
    x: mode === "coordinates" && coordinates ? String(coordinates.x) : null,
    y: mode === "coordinates" && coordinates ? String(coordinates.y) : null,
    z: mode === "coordinates" && coordinates ? String(coordinates.z) : null,
    from: fromId || null,
  });

  const format = useMemo(() => {
    const formatters = [0, 1, 2].map(
      (digits) =>
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }),
    );
    return (meters: number) => {
      const { value, unit, digits } = qtUnits(meters);
      return `${formatters[digits].format(value)} ${unit}`;
    };
  }, [locale]);

  const bodies = useMemo(() => data?.bodies ?? [], [data]);
  const markers = useMemo(() => data?.markers ?? [], [data]);
  const places = useMemo(() => data?.places ?? [], [data]);

  const systems = useMemo(() => {
    const found = new Map<string, string>();
    for (const body of bodies)
      if (body.systemSlug)
        found.set(body.systemSlug, body.systemName ?? body.systemSlug);
    return [...found].map(([slug, name]) => ({ slug, name }));
  }, [bodies]);

  // Ce que l'on vise, et dans quel système.
  const aim = useMemo(() => {
    if (mode === "marker") {
      const marker = markers.find((one) => one.id === markerId);
      return marker
        ? {
            name: marker.name,
            systemSlug: marker.systemSlug,
            position: marker.position,
          }
        : null;
    }
    if (mode === "place") {
      const place = places.find((one) => one.slug === placeSlug);
      if (!place) return null;
      const systemSlug =
        place.systemSlug ??
        bodies.find((body) => body.slug === place.position.body)?.systemSlug;
      return systemSlug
        ? { name: place.name, systemSlug, position: place.position }
        : null;
    }
    return coordinates
      ? { name: undefined, systemSlug: system, position: coordinates }
      : null;
  }, [mode, markers, markerId, places, placeSlug, bodies, coordinates, system]);

  const targetSystem = aim?.systemSlug ?? system;
  const qtSystem = useMemo(
    () => quantumSystem(bodies, places, targetSystem, now),
    [bodies, places, targetSystem, now],
  );
  const target = useMemo(
    () => (aim ? qtTarget(aim.position, qtSystem, aim.name) : null),
    [aim, qtSystem],
  );
  const from = findQtBeacon(qtSystem, fromId);
  const plan = useMemo(
    () => (target ? planQuantumRoute(target, qtSystem, { from }) : null),
    [target, qtSystem, from],
  );

  const candidates = plan?.kind === "space" ? plan.candidates : [];
  const selected =
    candidates.find((one) => candidateKey(one) === chosen) ?? candidates[0];

  const modes: Mode[] = ["marker", "place", "coordinates"];
  const groupedPlaces = useMemo(() => {
    const groups = new Map<string, typeof places>();
    for (const place of places) {
      const key =
        place.bodyName ??
        place.systemName ??
        bodies.find((body) => body.slug === place.position.body)?.name ??
        "—";
      groups.set(key, [...(groups.get(key) ?? []), place]);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b));
  }, [places, bodies]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="space-y-4">
        <div className="space-y-1">
          <span className="text-sm font-medium text-[#CCE7FF]">
            {t("targetLabel")}
          </span>
          <div role="tablist" className="grid grid-cols-3 gap-1">
            {modes.map((one) => (
              <button
                key={one}
                type="button"
                role="tab"
                aria-selected={mode === one}
                onClick={() => {
                  setMode(one);
                  setChosen(null);
                }}
                className={`rounded-md border px-2 py-1.5 text-sm transition-colors ${
                  mode === one
                    ? "border-[#9ED0FF]/60 bg-[#9ED0FF]/20 text-[#F2F7FC]"
                    : "border-[#9ED0FF]/15 text-[#9ED0FF]/80 hover:bg-[#9ED0FF]/10"
                }`}
              >
                {t(`modes.${one}`)}
              </button>
            ))}
          </div>
        </div>

        {mode === "marker" &&
          (data && !data.markers ? (
            <p className="text-sm text-[#9ED0FF]/70">{t("markersSignIn")}</p>
          ) : (
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[#CCE7FF]">
                {t("marker")}
              </span>
              <select
                value={markerId}
                onChange={(event) => {
                  setMarkerId(event.target.value);
                  setChosen(null);
                }}
                className={SELECT}
              >
                <option value="">{t("pickMarker")}</option>
                {markers.map((marker) => (
                  <option key={marker.id} value={marker.id}>
                    {marker.name}
                    {marker.bodyName ? ` · ${marker.bodyName}` : ""}
                    {marker.systemName ? ` · ${marker.systemName}` : ""}
                  </option>
                ))}
              </select>
              {data?.markers && markers.length === 0 && (
                <span className="block text-xs text-[#9ED0FF]/70">
                  {t("noMarkers")}
                </span>
              )}
            </label>
          ))}

        {mode === "place" && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#CCE7FF]">
              {t("place")}
            </span>
            <select
              value={placeSlug}
              onChange={(event) => {
                setPlaceSlug(event.target.value);
                setChosen(null);
              }}
              className={SELECT}
            >
              <option value="">{t("pickPlace")}</option>
              {groupedPlaces.map(([group, entries]) => (
                <optgroup key={group} label={group}>
                  {entries.map((place) => (
                    <option key={place.slug} value={place.slug}>
                      {place.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        {mode === "coordinates" && (
          <div className="space-y-2">
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[#CCE7FF]">
                {t("system")}
              </span>
              <select
                value={system}
                onChange={(event) => setSystem(event.target.value)}
                className={SELECT}
              >
                {(systems.length > 0
                  ? systems
                  : [{ slug: system, name: system }]
                ).map((one) => (
                  <option key={one.slug} value={one.slug}>
                    {one.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium text-[#CCE7FF]">
                {t("coordinates")}
              </span>
              <Textarea
                value={coordinatesText}
                onChange={(event) => {
                  setCoordinatesText(event.target.value);
                  setChosen(null);
                }}
                placeholder="Coordinates: x:5000000000 y:20000000000 z:0"
                rows={2}
                className="font-mono text-xs"
              />
              <span className="block text-xs text-[#9ED0FF]/70">
                {coordinatesText.trim() !== "" && !coordinates
                  ? t("coordinatesInvalid")
                  : t("coordinatesHint")}
              </span>
            </label>
          </div>
        )}

        {plan?.kind !== "surface" && (
          <label className="block space-y-1">
            <span className="text-sm font-medium text-[#CCE7FF]">
              {t("from")}
            </span>
            <select
              value={from ? from.id : ""}
              onChange={(event) => {
                setFromId(event.target.value);
                setChosen(null);
              }}
              className={SELECT}
            >
              <option value="">{t("anyFrom")}</option>
              {qtSystem.beacons.map((beacon) => (
                <option key={beacon.id} value={beacon.id}>
                  {beacon.name}
                  {beacon.bodyName ? ` · ${beacon.bodyName}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {candidates.length > 1 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-[#CCE7FF]">
              {t("candidates")}
            </h2>
            <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/15">
              {candidates.map((candidate) => {
                const key = candidateKey(candidate);
                const active = selected && candidateKey(selected) === key;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onClick={() => setChosen(key)}
                      aria-pressed={active}
                      className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                        active ? "bg-[#9ED0FF]/15" : "hover:bg-[#9ED0FF]/5"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-[#F2F7FC]">
                          {candidate.cut && candidate.from
                            ? `${candidate.from.name} → ${candidate.to.name}`
                            : candidate.to.name}
                        </span>
                        <span className="block text-xs text-[#9ED0FF]/70">
                          {candidate.cut
                            ? t("cutAtShort", {
                                distance: format(candidate.remaining),
                              })
                            : t("fullJump")}
                        </span>
                      </span>
                      <span className="shrink-0 rounded border border-[#9ED0FF]/30 bg-[#9ED0FF]/10 px-2 py-0.5 font-mono text-xs text-[#CCE7FF]">
                        ± {format(candidate.error)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4">
        {failed && <p className="text-sm text-amber-300">{t("loadFailed")}</p>}
        {!data && !failed && (
          <p className="text-sm text-[#9ED0FF]/70">{t("loading")}</p>
        )}
        {data && !target && (
          <p className="text-sm text-[#9ED0FF]/70">{t("noTarget")}</p>
        )}

        {plan?.kind === "surface" && (
          <div className="space-y-3 rounded-xl border border-[#9ED0FF]/25 bg-[#0B1D2E]/70 p-4">
            <p className="text-sm text-[#CCE7FF]">
              {t("surface.intro", {
                body: plan.surface.body.name,
                altitude: format(Math.max(0, plan.surface.altitude)),
              })}
            </p>
            {plan.surface.places.length > 0 ? (
              <>
                <p className="text-sm text-[#F2F7FC]">
                  {t("surface.jumpTo", {
                    place: plan.surface.places[0].place.name,
                    distance: format(plan.surface.places[0].distance),
                  })}
                </p>
                {plan.surface.places.length > 1 && (
                  <ul className="space-y-1 text-xs text-[#9ED0FF]/80">
                    {plan.surface.places.slice(1).map(({ place, distance }) => (
                      <li key={place.slug}>
                        {t("surface.other", {
                          place: place.name,
                          distance: format(distance),
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-[#F2F7FC]">
                {t("surface.jumpToBody", {
                  body: plan.surface.body.name,
                  distance: format(plan.surface.fromOrbit),
                })}
              </p>
            )}
            <p className="text-xs text-[#9ED0FF]/70">{t("surface.finish")}</p>
          </div>
        )}

        {plan?.kind === "space" &&
          (selected ? (
            <div className="space-y-3 rounded-xl border border-[#9ED0FF]/25 bg-[#0B1D2E]/70 p-4">
              {selected.from && (selected.cut || from) && (
                <p className="text-sm text-[#9ED0FF]/80">
                  {t("routeLine", {
                    from: selected.from.name,
                    to: selected.to.name,
                    length: format(selected.length),
                  })}
                </p>
              )}
              {selected.cut ? (
                <div>
                  <p className="text-sm text-[#CCE7FF]">
                    {t("cutAt", { to: selected.to.name })}
                  </p>
                  <p className="font-mono text-5xl font-semibold tracking-wide text-[#F2F7FC]">
                    {format(selected.remaining)}
                  </p>
                </div>
              ) : (
                <p className="text-lg font-semibold text-[#F2F7FC]">
                  {t("goToEnd", { to: selected.to.name })}
                </p>
              )}
              <p className="text-sm text-[#CCE7FF]">
                {t("expected", {
                  error: format(selected.error),
                  offset: format(selected.offset),
                })}
              </p>
              {selected.from && selected.cut && !from && (
                <p className="text-xs text-[#9ED0FF]/70">
                  {t("goFirst", { from: selected.from.name })}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 text-sm text-amber-100">
              {from ? t("noRouteFrom", { from: from.name }) : t("noRoute")}
            </div>
          ))}

        {target && (
          <QuantumMap
            system={qtSystem}
            target={target}
            candidate={plan?.kind === "space" ? (selected ?? null) : null}
          />
        )}

        <div className="space-y-1 text-xs text-[#9ED0FF]/70">
          <p className="font-semibold text-[#CCE7FF]">{t("howTitle")}</p>
          <ol className="list-decimal space-y-0.5 pl-4">
            <li>{t("how1")}</li>
            <li>{t("how2")}</li>
            <li>{t("how3")}</li>
          </ol>
          <p>
            {t("precision", {
              share: Math.round(CUT_ERROR_SHARE * 100),
              max: format(CUT_ERROR_MAX),
            })}
          </p>
          <p>{t("obstacles")}</p>
        </div>
      </section>
    </div>
  );
}
