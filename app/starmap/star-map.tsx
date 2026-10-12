"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useUrlFilters } from "@/lib/list-url";
import {
  BODY_TYPES,
  MARKER_COLOR,
  STAR_MAP_SYSTEMS,
  SYSTEM_LOOK,
  isStarMapSystem,
  markerShape,
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

/** Objets par page dans « Vos objets ici ». */
const LOTS_PER_PAGE = 20;

/** Les lots d'un même objet (même nom, même unité) sous le lieu regardé. */
type LotGroup = {
  key: string;
  name: string;
  unit?: string;
  total: number;
  /** La meilleure qualité ; absente pour l'équipement. */
  best?: number;
  lots: { lot: StarMapLot; place: LaidOutPlace }[];
};

/** Ce que l'infobulle d'un trait dit du lot, et où la poser à l'écran. */
type LotTip = { x: number; y: number; text: string };

/** Précédent, la page, suivant. Rien quand tout tient sur une page. */
function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("StarMap");
  if (pages <= 1) return null;
  const button =
    "rounded-md border border-[#9ED0FF]/30 px-2 py-0.5 hover:bg-[#9ED0FF]/15 disabled:opacity-35 disabled:hover:bg-transparent";
  return (
    <nav
      aria-label={t("pager.label")}
      className="mt-2 flex items-center justify-between gap-2 text-xs"
    >
      <button
        type="button"
        className={button}
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
      >
        {t("pager.previous")}
      </button>
      <span className="font-mono text-[11.5px] text-[#86a9c8] tabular-nums">
        {t("pager.page", { page: page + 1, pages })}
      </span>
      <button
        type="button"
        className={button}
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
      >
        {t("pager.next")}
      </button>
    </nav>
  );
}

function Marker({ place }: { place: LaidOutPlace }) {
  const color = isStarMapSystem(place.slug)
    ? SYSTEM_LOOK[place.slug].color
    : (MARKER_COLOR[place.type] ?? MARKER_COLOR.planet);
  return (
    <i
      aria-hidden
      className={`star-map-marker ${markerShape(place.type)}`}
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
  // La page de « Vos objets ici », pour le lieu regardé : en changer revient
  // à la première.
  const [lotPage, setLotPage] = useState({ slug: initialPlace, page: 0 });
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
  // Un objet par ligne : les ressources (qui ont une qualité) d'abord, de la
  // meilleure à la moins bonne, puis l'équipement par nom.
  const rows = useMemo(() => {
    const byKey = new Map<string, LotGroup>();
    for (const [place, list] of lots) {
      for (const lot of list) {
        const key = `${lot.name}|${lot.unit ?? ""}`;
        let group = byKey.get(key);
        if (!group) {
          group = { key, name: lot.name, unit: lot.unit, total: 0, lots: [] };
          byKey.set(key, group);
        }
        group.total += lot.quantity;
        group.lots.push({ lot, place });
        if (lot.quality !== undefined)
          group.best = Math.max(group.best ?? 0, lot.quality);
      }
    }
    return [...byKey.values()].sort((a, b) =>
      a.best !== undefined && b.best !== undefined
        ? b.best - a.best
        : a.best !== undefined
          ? -1
          : b.best !== undefined
            ? 1
            : a.name.localeCompare(b.name),
    );
  }, [lots]);
  // L'épaisseur d'un trait se mesure au plus gros lot de ressource.
  const biggestLot = Math.max(
    1,
    ...rows.flatMap((group) =>
      group.best === undefined ? [] : group.lots.map(({ lot }) => lot.quantity),
    ),
  );
  const [tip, setTip] = useState<LotTip | null>(null);
  const showTip = (
    element: HTMLElement,
    lot: StarMapLot,
    place: LaidOutPlace,
  ) => {
    const rect = element.getBoundingClientRect();
    const parts = [
      `${format.number(lot.quantity)}${lot.unit ? ` ${lot.unit}` : ""}`,
      t("quality", { quality: lot.quality ?? 0 }),
    ];
    if (lots.length > 1) parts.push(place.name);
    setTip({
      x: rect.left + rect.width / 2,
      y: rect.top,
      text: parts.join(" · "),
    });
  };
  const pages = Math.ceil(rows.length / LOTS_PER_PAGE);
  const page =
    lotPage.slug === current?.slug
      ? Math.max(0, Math.min(lotPage.page, pages - 1))
      : 0;
  const pageRows = rows.slice(page * LOTS_PER_PAGE, (page + 1) * LOTS_PER_PAGE);
  const setPage = (next: number) =>
    setLotPage({ slug: current?.slug, page: next });

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
    <div className="star-map-root relative h-[calc(100dvh-4rem-1px)] min-h-[520px] overflow-hidden overscroll-none bg-[#030912] text-[#c9e4ff]">
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

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3"
          onScroll={() => setTip(null)}
        >
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
            ) : (
              <div className="grid">
                {pageRows.map((group, index) =>
                  group.best !== undefined ? (
                    <div
                      key={group.key}
                      className="grid gap-1.5 border-b border-[#9ED0FF]/10 py-2"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[13.5px] font-medium">
                          {group.name}
                        </span>
                        <span className="shrink-0 font-mono text-[12.5px] tabular-nums">
                          {format.number(group.total)}
                          {group.unit ? ` ${group.unit}` : ""}
                          <span className="text-[#5c7b96]">
                            {" · "}
                            {t("bestQuality", { quality: group.best })}
                          </span>
                        </span>
                      </div>
                      {/* La qualité de 0 à 1000 ; un trait par lot, plus épais quand il pèse plus. */}
                      <div className="relative h-2.5 rounded-[3px] bg-[#9ED0FF]/[0.08]">
                        {group.lots.map(({ lot, place }) => {
                          const width =
                            2 + 8 * Math.sqrt(lot.quantity / biggestLot);
                          return (
                            <span
                              key={lot.id}
                              tabIndex={0}
                              aria-label={`${format.number(lot.quantity)}${lot.unit ? ` ${lot.unit}` : ""}, ${t("quality", { quality: lot.quality ?? 0 })}`}
                              onPointerEnter={(event) =>
                                showTip(event.currentTarget, lot, place)
                              }
                              onFocus={(event) =>
                                showTip(event.currentTarget, lot, place)
                              }
                              onPointerLeave={() => setTip(null)}
                              onBlur={() => setTip(null)}
                              className="absolute inset-y-0 cursor-default rounded-[2px] bg-[#ffc76a]/85 outline-none hover:bg-white focus-visible:bg-white"
                              style={{
                                left: `calc(${(lot.quality ?? 0) / 10}% - ${width / 2}px)`,
                                width,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div key={group.key}>
                      {/* L'équipement n'a pas de qualité : une liste simple. */}
                      {pageRows[index - 1]?.best !== undefined && (
                        <h4 className="mt-3 mb-1 text-[11px] font-semibold tracking-[0.1em] text-[#ffc76a] uppercase">
                          {t("equipment")}
                        </h4>
                      )}
                      <div className="flex items-baseline justify-between gap-2 py-1 text-[13.5px]">
                        <span className="min-w-0 truncate">{group.name}</span>
                        <span className="shrink-0 font-mono text-[12.5px] tabular-nums">
                          × {format.number(group.total)}
                          {group.unit ? ` ${group.unit}` : ""}
                        </span>
                      </div>
                    </div>
                  ),
                )}
                {pageRows.some((group) => group.best !== undefined) && (
                  <p className="mt-1.5 font-mono text-[10.5px] text-[#5c7b96]">
                    {t("qualityLegend")}
                  </p>
                )}
              </div>
            )}
            {inventory && lotCount > 0 && (
              <Pager page={page} pages={pages} onPage={setPage} />
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
      {tip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 -translate-y-full rounded-md border border-[#ffc76a]/40 bg-[#061a2b] px-2 py-1 font-mono text-[11.5px] whitespace-nowrap text-[#c9e4ff] shadow-lg"
            // Près du bord droit de l'écran, l'infobulle s'aligne à droite du
            // trait plutôt que de déborder.
            style={
              tip.x > window.innerWidth - 180
                ? { right: window.innerWidth - tip.x - 8, top: tip.y - 6 }
                : { left: tip.x, top: tip.y - 6, translate: "-50% -100%" }
            }
          >
            {tip.text}
          </div>,
          document.body,
        )}
    </div>
  );
}
