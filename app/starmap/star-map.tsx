"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useUrlFilters } from "@/lib/list-url";
import {
  BODY_TYPES,
  STAR_MAP_SYSTEMS,
  SYSTEM_LOOK,
  isStarMapSystem,
  layoutStarMap,
  type LaidOutPlace,
  type StarMapPlace,
} from "@/lib/star-map-layout";
import type { StarMapInventory, StarMapLot } from "@/lib/star-map";
import type { StarMapScene } from "./scene";
import "./star-map.css";

/** L'ordre des groupes dans « Contient ». */
const GROUP_ORDER = [
  "planet",
  "moon",
  "city",
  "spaceport",
  "station",
  "outpost",
  "district",
  "building",
  "shop",
];

/** Au-delà, un groupe se replie derrière « Afficher les N autres ». */
const GROUP_PREVIEW = 8;

const MARKER_COLOR: Record<string, string> = {
  planet: "#c9e4ff",
  moon: "#a9c0d4",
  station: "#9ed0ff",
  city: "#7ff0d0",
  spaceport: "#7ff0d0",
  outpost: "#a4b8c8",
  district: "#7ff0d0",
  building: "#a4b8c8",
  shop: "#ffc76a",
};

function Marker({ place }: { place: LaidOutPlace }) {
  const shape =
    place.type === "station"
      ? "station"
      : place.type === "city" || place.type === "spaceport"
        ? "city"
        : ["outpost", "building", "shop", "district"].includes(place.type)
          ? "outpost"
          : "";
  const color = isStarMapSystem(place.slug)
    ? SYSTEM_LOOK[place.slug].color
    : (MARKER_COLOR[place.type] ?? "#c9e4ff");
  return (
    <i
      aria-hidden
      className={`star-map-marker ${shape}`}
      style={{ "--c": color } as React.CSSProperties}
    />
  );
}

function Chip({ count }: { count: number }) {
  return (
    <span className="rounded-full bg-[#ffc76a] px-1.5 font-mono text-[10.5px] font-semibold text-[#2a1a00] tabular-nums">
      {count}
    </span>
  );
}

export function StarMap({
  places: input,
  inventory,
  initialPlace,
}: {
  places: StarMapPlace[];
  /** `null` : personne n'est connecté. */
  inventory: StarMapInventory | null;
  initialPlace?: string;
}) {
  const t = useTranslations("StarMap");
  const tPlaces = useTranslations("Places");
  const format = useFormatter();
  const places = useMemo(() => layoutStarMap(input), [input]);
  const [focus, setFocus] = useState<string | null>(
    initialPlace && places.has(initialPlace) ? initialPlace : null,
  );
  const [outposts, setOutposts] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const scene = useRef<StarMapScene | null>(null);

  useUrlFilters({ place: focus });

  const get = useCallback(
    (slug?: string) => (slug ? places.get(slug) : undefined),
    [places],
  );
  const typeLabel = useCallback(
    (place: LaidOutPlace) => tPlaces(`types.${place.type}`),
    [tPlaces],
  );

  // Les lots sous chaque lieu, ancêtres compris : ce que disent les pastilles.
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    if (!inventory) return result;
    for (const [slug, lots] of Object.entries(inventory.byPlace)) {
      let current = places.get(slug);
      for (let depth = 0; current && depth < 12; depth++) {
        result.set(current.slug, (result.get(current.slug) ?? 0) + lots.length);
        current = current.parentSlug
          ? places.get(current.parentSlug)
          : undefined;
      }
    }
    return result;
  }, [inventory, places]);

  /** Les lots rangés hors des trois systèmes, ou dans un lieu à soi. */
  const offMap = useMemo(() => {
    if (!inventory) return 0;
    let count = inventory.elsewhere;
    for (const [slug, lots] of Object.entries(inventory.byPlace)) {
      if (!places.has(slug)) count += lots.length;
    }
    return count;
  }, [inventory, places]);

  const select = useCallback((slug: string | null) => setFocus(slug), []);

  // La scène, chargée à la demande avec Three.js.
  useEffect(() => {
    let disposed = false;
    import("./scene")
      .then(({ createStarMap }) => {
        if (disposed || !canvas.current || !labels.current) return;
        scene.current = createStarMap({
          canvas: canvas.current,
          labels: labels.current,
          places,
          typeLabel,
          onSelect: select,
        });
        setReady(true);
      })
      .catch(() => setFailed(true));
    return () => {
      disposed = true;
      scene.current?.dispose();
      scene.current = null;
      setReady(false);
    };
  }, [places, typeLabel, select]);

  const first = useRef(true);
  useEffect(() => {
    if (!ready) return;
    scene.current?.focus(focus, first.current);
    first.current = false;
  }, [focus, ready]);

  useEffect(() => {
    if (ready) scene.current?.setCounts(counts);
  }, [counts, ready]);

  useEffect(() => {
    scene.current?.setOutposts(outposts);
  }, [outposts, ready]);

  // Le panneau couvre la droite (le bas sur mobile) : la vue se recentre.
  useEffect(() => {
    if (!ready || !panel.current) return;
    const element = panel.current;
    const update = () => {
      const wide = window.matchMedia("(min-width: 768px)").matches;
      const box = element.getBoundingClientRect();
      scene.current?.setInset(
        wide ? box.width + 16 : 0,
        wide ? 0 : box.height * 0.6,
      );
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [ready]);

  const current = focus ? places.get(focus) : undefined;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && current)
        setFocus(
          current.parentSlug && places.has(current.parentSlug)
            ? current.parentSlug
            : null,
        );
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, places]);

  const trail = useMemo(() => {
    const chain: LaidOutPlace[] = [];
    let place = current;
    while (place && chain.length < 12) {
      chain.unshift(place);
      place = get(place.parentSlug);
    }
    return chain;
  }, [current, get]);

  const children = (
    current
      ? current.children
      : STAR_MAP_SYSTEMS.filter((slug) => places.has(slug))
  )
    .map((slug) => places.get(slug)!)
    .filter(Boolean);

  // Les lots du sous-arbre, lieu par lieu.
  const lots = useMemo(() => {
    if (!inventory) return [] as [LaidOutPlace, StarMapLot[]][];
    const found: [LaidOutPlace, StarMapLot[]][] = [];
    const walk = (place: LaidOutPlace) => {
      const here = inventory.byPlace[place.slug];
      if (here) found.push([place, here]);
      place.children.forEach((slug) => {
        const child = places.get(slug);
        if (child) walk(child);
      });
    };
    if (current) walk(current);
    else
      STAR_MAP_SYSTEMS.forEach(
        (slug) => places.has(slug) && walk(places.get(slug)!),
      );
    return found;
  }, [current, inventory, places]);
  const lotCount = lots.reduce((sum, [, list]) => sum + list.length, 0);
  const compact =
    lots.length > 2 ||
    (lots.length === 2 && !(current && BODY_TYPES.has(current.type)));

  const facts: [string, string][] = [];
  if (current && isStarMapSystem(current.slug)) {
    let stations = 0;
    const walk = (place: LaidOutPlace) => {
      if (place.type === "station") stations++;
      place.children.forEach(
        (slug) => places.has(slug) && walk(places.get(slug)!),
      );
    };
    walk(current);
    facts.push([
      String(
        current.children.filter((slug) => get(slug)?.type === "planet").length,
      ),
      t("factPlanets"),
    ]);
    facts.push([String(stations), t("factStations")]);
  }
  if (current?.radius && BODY_TYPES.has(current.type)) {
    facts.push([
      `${format.number(Math.round(current.radius / 1000))} km`,
      t("factRadius"),
    ]);
  }
  if (current?.type === "planet") {
    facts.push([
      String(
        current.children.filter((slug) => get(slug)?.type === "moon").length,
      ),
      t("factMoons"),
    ]);
  }

  const parent = get(current?.parentSlug);
  const systemColor = current?.system
    ? SYSTEM_LOOK[current.system].color
    : "#9ed0ff";

  return (
    <div className="relative h-[calc(100dvh-4rem)] min-h-[520px] overflow-hidden bg-[#030912] text-[#c9e4ff]">
      <canvas
        ref={canvas}
        className="absolute inset-0 block size-full touch-none"
        aria-label={t("canvasLabel")}
      />
      <div
        ref={labels}
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />

      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-sm text-[#86a9c8]">
          {failed ? t("failed") : t("loading")}
        </div>
      )}

      {/* En-tête : où l'on est, les systèmes, les avant-postes */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex flex-col gap-2 md:right-auto md:max-w-[calc(100%-24rem)]">
        <div className="pointer-events-auto rounded-xl border border-[#9ED0FF]/20 bg-[#092f49]/75 px-3 py-2.5 backdrop-blur-md">
          <h1 className="text-[15px] font-semibold tracking-wide">
            {t("title")}
          </h1>
          <nav
            aria-label={t("trail")}
            className="mt-1 flex flex-wrap items-center gap-0.5 text-[13px] text-[#86a9c8]"
          >
            <button
              type="button"
              onClick={() => setFocus(null)}
              aria-current={!current || undefined}
              className="rounded px-1.5 py-0.5 hover:bg-[#9ED0FF]/10 hover:text-[#c9e4ff] aria-[current]:font-semibold aria-[current]:text-[#c9e4ff]"
            >
              {t("verse")}
            </button>
            {trail.map((place, index) => (
              <span key={place.slug} className="flex items-center gap-0.5">
                <span aria-hidden className="text-[11px] text-[#5c7b96]">
                  ›
                </span>
                <button
                  type="button"
                  onClick={() => setFocus(place.slug)}
                  aria-current={index === trail.length - 1 || undefined}
                  className="rounded px-1.5 py-0.5 hover:bg-[#9ED0FF]/10 hover:text-[#c9e4ff] aria-[current]:font-semibold aria-[current]:text-[#c9e4ff]"
                >
                  {place.name}
                </button>
              </span>
            ))}
          </nav>
        </div>
        <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 self-start rounded-xl border border-[#9ED0FF]/20 bg-[#092f49]/75 px-2.5 py-2 backdrop-blur-md">
          <div className="flex gap-1" role="group" aria-label={t("systems")}>
            {STAR_MAP_SYSTEMS.filter((slug) => places.has(slug)).map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => setFocus(slug)}
                aria-pressed={current?.system === slug}
                className="flex items-center gap-1.5 rounded-md border border-transparent px-2.5 py-1 text-[12.5px] font-medium text-[#86a9c8] hover:border-[#9ED0FF]/20 hover:text-[#c9e4ff] aria-pressed:border-[#9ED0FF]/50 aria-pressed:bg-[#9ED0FF]/15 aria-pressed:text-[#c9e4ff]"
              >
                <i
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{
                    background: SYSTEM_LOOK[slug].color,
                    boxShadow: `0 0 8px ${SYSTEM_LOOK[slug].color}`,
                  }}
                />
                {places.get(slug)!.name}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#86a9c8]">
            <input
              type="checkbox"
              checked={outposts}
              onChange={(event) => setOutposts(event.target.checked)}
              className="size-3.5 accent-[#9ed0ff]"
            />
            {t("showOutposts")}
          </label>
        </div>
      </div>

      {/* Panneau du lieu regardé */}
      <aside
        ref={panel}
        aria-live="polite"
        className="absolute inset-x-3 bottom-3 flex max-h-[42%] flex-col overflow-hidden rounded-xl border border-[#9ED0FF]/20 bg-[#092f49]/80 backdrop-blur-md md:inset-x-auto md:top-3 md:right-3 md:max-h-none md:w-80"
      >
        <div className="grid gap-1.5 border-b border-[#9ED0FF]/20 px-4 pt-4 pb-3">
          <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-[#86a9c8] uppercase">
            <i
              aria-hidden
              className="size-2 rounded-full"
              style={{
                background: systemColor,
                boxShadow: `0 0 8px ${systemColor}`,
              }}
            />
            {current ? typeLabel(current) : t("verseType")}
            {parent ? ` · ${parent.name}` : ""}
          </p>
          <h2 className="text-2xl font-semibold text-balance">
            {current ? current.name : t("verse")}
          </h2>
          {facts.length > 0 && (
            <dl className="flex flex-wrap gap-x-4 gap-y-1">
              {facts.map(([value, label]) => (
                <div key={label} className="grid">
                  <dt className="order-2 text-[10.5px] tracking-[0.08em] text-[#5c7b96] uppercase">
                    {label}
                  </dt>
                  <dd className="font-mono text-[13px] tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {current?.approx && (
            <p className="text-xs text-[#86a9c8]">{t("approx")}</p>
          )}
          {current && !current.world && (
            <p className="text-xs text-[#86a9c8]">{t("unplaced")}</p>
          )}
          {current && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setFocus(
                    current.parentSlug && places.has(current.parentSlug)
                      ? current.parentSlug
                      : null,
                  )
                }
                className="rounded-md border border-[#9ED0FF]/50 px-2.5 py-1 text-xs font-medium hover:bg-[#9ED0FF]/15"
              >
                {t("up")}
              </button>
              <Link
                href={`/lieux/${current.slug}`}
                className="rounded-md border border-[#9ED0FF]/20 px-2.5 py-1 text-xs font-medium text-[#86a9c8] hover:bg-[#9ED0FF]/15 hover:text-[#c9e4ff]"
              >
                {t("openPlace")}
              </Link>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-3">
          <section className="px-4 pt-3">
            <h3 className="mb-2 flex items-baseline justify-between text-[11px] font-semibold tracking-[0.1em] text-[#ffc76a] uppercase">
              {t("yourItems")}
              {inventory && lotCount > 0 && (
                <small className="font-mono text-[11px] font-normal tracking-normal text-[#5c7b96] normal-case">
                  {t("lotsSummary", { lots: lotCount, places: lots.length })}
                </small>
              )}
            </h3>
            {!inventory ? (
              <div className="grid gap-2.5 rounded-lg border border-dashed border-[#9ED0FF]/40 p-3 text-[13px] leading-relaxed text-[#86a9c8]">
                {t("signInHint")}
                <Link
                  href="/login"
                  className="justify-self-start rounded-md border border-[#9ED0FF]/50 px-2.5 py-1 text-xs font-medium text-[#c9e4ff] hover:bg-[#9ED0FF]/15"
                >
                  {t("signIn")}
                </Link>
              </div>
            ) : lotCount === 0 ? (
              <p className="text-[13px] text-[#86a9c8]">
                {current
                  ? t("noItemsHere", { place: current.name })
                  : t("noItems")}
              </p>
            ) : compact ? (
              <div className="grid gap-px">
                {lots.map(([place, list]) => (
                  <button
                    key={place.slug}
                    type="button"
                    onClick={() => setFocus(place.slug)}
                    className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-[#9ED0FF]/10"
                  >
                    <Marker place={place} />
                    <span className="min-w-0 flex-1 truncate">
                      {place.name}
                    </span>
                    <span className="truncate font-mono text-[11.5px] text-[#5c7b96]">
                      {get(place.parentSlug)?.name}
                    </span>
                    <Chip count={list.length} />
                  </button>
                ))}
              </div>
            ) : (
              lots.map(([place, list]) => (
                <div key={place.slug}>
                  {place.slug !== current?.slug && (
                    <button
                      type="button"
                      onClick={() => setFocus(place.slug)}
                      className="mt-2 mb-1 flex items-center gap-1.5 text-xs font-medium hover:underline"
                    >
                      <Marker place={place} />
                      {place.name}
                    </button>
                  )}
                  {list.map((lot) => (
                    <div
                      key={lot.id}
                      className="mb-1 grid grid-cols-[1fr_auto] gap-x-2.5 rounded-lg border border-[#ffc76a]/20 bg-[#ffc76a]/[0.07] px-2.5 py-1.5"
                    >
                      <span className="min-w-0 text-[13.5px]">{lot.name}</span>
                      <span className="text-right font-mono text-[12.5px] tabular-nums">
                        {format.number(lot.quantity)}
                        {lot.unit ? ` ${lot.unit}` : ""}
                      </span>
                      {lot.quality !== undefined && (
                        <span className="col-span-2 font-mono text-[11px] text-[#5c7b96]">
                          {t("quality", { quality: lot.quality })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))
            )}
            {inventory && !current && offMap > 0 && (
              <p className="mt-2 text-xs text-[#5c7b96]">
                {t("offMap", { count: offMap })}{" "}
                <Link
                  href="/inventory"
                  className="underline hover:text-[#c9e4ff]"
                >
                  {t("openInventory")}
                </Link>
              </p>
            )}
          </section>

          <section className="px-4 pt-4">
            <h3 className="mb-1 flex items-baseline justify-between text-[11px] font-semibold tracking-[0.1em] text-[#86a9c8] uppercase">
              {t("contains")}
              <small className="font-mono font-normal text-[#5c7b96]">
                {children.length}
              </small>
            </h3>
            {children.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-[#86a9c8]">
                {t("nothingInside")}
              </p>
            ) : (
              [...GROUP_ORDER, "star"].map((type) => {
                const group = children
                  .filter((child) => child.type === type)
                  .sort(
                    (a, b) =>
                      (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0) ||
                      a.name.localeCompare(b.name),
                  );
                if (group.length === 0) return null;
                const key = `${current?.slug ?? ""}:${type}`;
                const shown = expanded.has(key)
                  ? group
                  : group.slice(0, GROUP_PREVIEW);
                return (
                  <div key={type}>
                    <p className="mt-2.5 mb-1 flex justify-between text-[11.5px] text-[#5c7b96]">
                      <span>{t(`groups.${type}`)}</span>
                      <span>{group.length}</span>
                    </p>
                    <div className="grid gap-px">
                      {shown.map((child) => {
                        const count = counts.get(child.slug) ?? 0;
                        return (
                          <button
                            key={child.slug}
                            type="button"
                            onClick={() => setFocus(child.slug)}
                            className="-mx-2 flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13.5px] hover:bg-[#9ED0FF]/10"
                          >
                            <Marker place={child} />
                            <span className="min-w-0 flex-1 truncate">
                              {child.name}
                            </span>
                            {count > 0 && <Chip count={count} />}
                            {child.children.length > 0 && (
                              <span className="font-mono text-[11.5px] text-[#5c7b96]">
                                {t("placesCount", {
                                  count: child.children.length,
                                })}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {group.length > shown.length && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((previous) => new Set(previous).add(key))
                        }
                        className="py-1 text-xs text-[#9ed0ff] hover:underline"
                      >
                        {t("showMore", { count: group.length - shown.length })}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </aside>

      {/* Légende */}
      <div className="pointer-events-none absolute bottom-3 left-3 hidden gap-1.5 rounded-xl border border-[#9ED0FF]/20 bg-[#092f49]/75 px-3 py-2.5 text-xs text-[#86a9c8] backdrop-blur-md md:grid">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <i
              className="star-map-marker"
              style={{ "--c": "#c9e4ff" } as React.CSSProperties}
            />
            {t("legend.bodies")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i
              className="star-map-marker city"
              style={{ "--c": "#7ff0d0" } as React.CSSProperties}
            />
            {t("legend.cities")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i
              className="star-map-marker station"
              style={{ "--c": "#9ed0ff" } as React.CSSProperties}
            />
            {t("legend.stations")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <i
              className="star-map-marker outpost"
              style={{ "--c": "#a4b8c8" } as React.CSSProperties}
            />
            {t("legend.outposts")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Chip count={3} />
            {t("legend.items")}
          </span>
        </div>
        <p className="text-[11.5px] text-[#5c7b96]">{t("legend.hint")}</p>
      </div>
    </div>
  );
}
