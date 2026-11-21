"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  altitudeAt,
  decodeAltitude,
  formatDistance,
  formatLatLon,
  groundDistance,
  headingTo,
  planetMapUrl,
  pointOfGeo,
  wrapLon,
  type AltitudeGrid,
  type LatLon,
} from "@/lib/planet-map-geometry";
import { MARKER_KINDS, type MarkerKind } from "@/types/markers";
import type {
  PlanetMap as PlanetMapData,
  PlanetMapPoint,
} from "@/types/planet-maps";

type Layers = {
  places: boolean;
  private: boolean;
  markers: boolean;
  contours: boolean;
  grid: boolean;
};

type Spot = LatLon & { alt: number | null };

/** Un clic droit : où, et où ouvrir le menu dans la carte. */
type Menu = Spot & { x: number; y: number };

const PANEL =
  "rounded-xl border border-[#9ED0FF]/20 bg-[#092f49]/85 backdrop-blur-md";

/**
 * La carte de surface d'une planète ou d'une lune : le relief extrait des
 * fichiers du jeu, en tuiles, et par-dessus les lieux du catalogue, les lieux
 * privés et les marqueurs du joueur.
 *
 * Leaflet en `CRS.EPSG4326` : la carte est équirectangulaire, longitude −180°
 * à gauche, et une position s'y pose telle quelle en latitude et longitude.
 * Leaflet touche à `window` dès son import : il se charge dans l'effet.
 */
export function PlanetMap({
  map,
  points,
  bodyName,
  signedIn,
  starMapHref,
  initialView,
}: {
  map: PlanetMapData;
  points: PlanetMapPoint[];
  bodyName: string;
  signedIn: boolean;
  /** La Star Map, regardant ce corps. */
  starMapHref: string;
  /** Depuis l'adresse (`?lat=&lon=&z=`), pour un lien partagé. */
  initialView?: { lat: number; lon: number; zoom: number };
}) {
  const t = useTranslations("PlanetMap");
  const locale = useLocale();
  const router = useRouter();
  const { manifest, baseUrl } = map;

  const container = useRef<HTMLDivElement>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const instance = useRef<Leaflet.Map | null>(null);
  const contours = useRef<Leaflet.TileLayer | null>(null);
  const grid = useRef<Leaflet.LayerGroup | null>(null);
  const pointsLayer = useRef<Leaflet.LayerGroup | null>(null);
  const measureLayer = useRef<Leaflet.LayerGroup | null>(null);
  const altitude = useRef<AltitudeGrid | null>(null);

  const [ready, setReady] = useState(false);
  const [layers, setLayers] = useState<Layers>({
    places: true,
    private: true,
    markers: true,
    contours: true,
    grid: false,
  });
  const [cursor, setCursor] = useState<Spot | null>(null);
  const [selected, setSelected] = useState<PlanetMapPoint | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [measure, setMeasure] = useState<Spot[]>([]);
  // Lu par les clics des points, posés une fois pour toutes par Leaflet.
  const measuringRef = useRef(false);
  useEffect(() => {
    measuringRef.current = measuring;
  }, [measuring]);
  const [adding, setAdding] = useState<Spot | null>(null);
  const [copied, setCopied] = useState(false);

  const counts = useMemo(
    () => ({
      places: points.filter((p) => p.kind === "place").length,
      private: points.filter((p) => p.kind === "private").length,
      markers: points.filter((p) => p.kind === "marker").length,
    }),
    [points],
  );

  const spotAt = (lat: number, lon: number): Spot => {
    const at = { lat, lon: wrapLon(lon) };
    return {
      ...at,
      alt: altitude.current ? altitudeAt(altitude.current, at) : null,
    };
  };

  // La carte, une fois : Leaflet garde son propre état, React ne fait que le piloter.
  useEffect(() => {
    let cancelled = false;
    let created: Leaflet.Map | null = null;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !container.current) return;
      leaflet.current = L;
      const { tiles } = manifest;
      const bounds = L.latLngBounds([-90, -180], [90, 180]);
      const view = initialView ?? { lat: 0, lon: 0, zoom: 1 };
      created = L.map(container.current, {
        crs: L.CRS.EPSG4326,
        minZoom: tiles.minZoom,
        maxZoom: tiles.maxNativeZoom + 3,
        maxBounds: bounds.pad(0.05),
        maxBoundsViscosity: 0.8,
        worldCopyJump: false,
        zoomControl: false,
        attributionControl: false,
        center: [view.lat, view.lon],
        zoom: view.zoom,
      });
      const tileOptions = {
        tileSize: tiles.tileSize,
        noWrap: true,
        bounds,
        maxNativeZoom: tiles.maxNativeZoom,
        minZoom: tiles.minZoom,
      };
      L.tileLayer(planetMapUrl(baseUrl, tiles.base), tileOptions).addTo(
        created,
      );
      contours.current = L.tileLayer(
        planetMapUrl(baseUrl, tiles.contours),
        tileOptions,
      );

      const lines = L.layerGroup();
      const style = {
        color: "#9ed0ff",
        weight: 1,
        opacity: 0.25,
        interactive: false,
      };
      for (let lon = -180; lon <= 180; lon += 30) {
        L.polyline(
          [
            [-90, lon],
            [90, lon],
          ],
          style,
        ).addTo(lines);
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        L.polyline(
          [
            [lat, -180],
            [lat, 180],
          ],
          style,
        ).addTo(lines);
      }
      grid.current = lines;
      pointsLayer.current = L.layerGroup().addTo(created);
      measureLayer.current = L.layerGroup().addTo(created);

      created.on("mousemove", (event) =>
        setCursor(spotAt(event.latlng.lat, event.latlng.lng)),
      );
      created.on("mouseout", () => setCursor(null));
      created.on("contextmenu", (event) => {
        // Le menu reste dans la carte, même ouvert contre un bord.
        const size = created!.getSize();
        setMenu({
          ...spotAt(event.latlng.lat, event.latlng.lng),
          x: Math.max(8, Math.min(event.containerPoint.x, size.x - 248)),
          y: Math.max(8, Math.min(event.containerPoint.y, size.y - 160)),
        });
      });
      created.on("movestart", () => setMenu(null));
      // La vue regardée vit dans l'adresse, pour la partager telle quelle.
      created.on("moveend", () => {
        const center = created!.getCenter();
        const url = new URL(window.location.href);
        url.searchParams.set("lat", center.lat.toFixed(3));
        url.searchParams.set("lon", wrapLon(center.lng).toFixed(3));
        url.searchParams.set("z", String(created!.getZoom()));
        window.history.replaceState(window.history.state, "", url);
      });

      instance.current = created;
      setReady(true);

      // L'altitude arrive après : la carte s'affiche sans l'attendre.
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = manifest.altitude.width;
        canvas.height = manifest.altitude.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, canvas.width, canvas.height);
        altitude.current = decodeAltitude(data.data, manifest);
      };
      image.src = planetMapUrl(baseUrl, manifest.altitude.url);
    })();
    return () => {
      cancelled = true;
      created?.remove();
      instance.current = null;
    };
    // La carte ne se recrée pas : un autre corps est une autre page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Les couches qu'on coche et décoche.
  useEffect(() => {
    const current = instance.current;
    if (!ready || !current) return;
    for (const [layer, shown] of [
      [contours.current, layers.contours],
      [grid.current, layers.grid],
    ] as const) {
      if (!layer) continue;
      if (shown && !current.hasLayer(layer)) layer.addTo(current);
      if (!shown && current.hasLayer(layer)) layer.remove();
    }
  }, [ready, layers.contours, layers.grid]);

  // Les points : un rond et son nom, de la couleur de leur sorte.
  useEffect(() => {
    const L = leaflet.current;
    const group = pointsLayer.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    for (const point of points) {
      if (point.kind === "place" && !layers.places) continue;
      if (point.kind === "private" && !layers.private) continue;
      if (point.kind === "marker" && !layers.markers) continue;
      const shape =
        point.kind === "marker"
          ? "width:10px;height:10px;transform:rotate(45deg);border-radius:2px"
          : point.kind === "private"
            ? "width:9px;height:9px;border-radius:2px"
            : "width:8px;height:8px;border-radius:50%";
      const icon = L.divIcon({
        className: "planet-map-point",
        iconSize: [0, 0],
        html: `<span class="planet-map-point-dot" style="${shape};background:${point.color}"></span><span class="planet-map-point-label" style="color:${point.kind === "place" ? "#e3f1ff" : point.color}"></span>`,
      });
      const marker = L.marker([point.lat, point.lon], {
        icon,
        title: point.name,
        keyboard: true,
        riseOnHover: true,
      });
      marker.on("add", () => {
        // Le nom en texte, jamais en HTML : il vient des joueurs.
        const label = marker
          .getElement()
          ?.querySelector(".planet-map-point-label");
        if (label) label.textContent = point.name;
      });
      marker.on("click", () => {
        setMenu(null);
        // En mesure, un point est une extrémité comme une autre.
        if (measuringRef.current) {
          const spot = { lat: point.lat, lon: point.lon, alt: point.alt };
          setMeasure((previous) =>
            previous.length >= 2 ? [spot] : [...previous, spot],
          );
          return;
        }
        setSelected(point);
      });
      marker.addTo(group);
    }
  }, [ready, points, layers.places, layers.private, layers.markers]);

  // Mesurer : deux clics, une ligne, sa longueur et son cap.
  useEffect(() => {
    const current = instance.current;
    if (!ready || !current) return;
    if (!measuring) return;
    const onClick = (event: Leaflet.LeafletMouseEvent) => {
      const spot = spotAt(event.latlng.lat, event.latlng.lng);
      setMeasure((previous) =>
        previous.length >= 2 ? [spot] : [...previous, spot],
      );
    };
    current.on("click", onClick);
    current.getContainer().style.cursor = "crosshair";
    return () => {
      current.off("click", onClick);
      current.getContainer().style.cursor = "";
    };
  }, [ready, measuring]);

  useEffect(() => {
    const L = leaflet.current;
    const group = measureLayer.current;
    if (!ready || !L || !group) return;
    group.clearLayers();
    const style = {
      color: "#ffc76a",
      weight: 2,
      dashArray: "6 5",
      interactive: false,
    };
    for (const spot of measure) {
      L.circleMarker([spot.lat, spot.lon], {
        radius: 4,
        color: "#ffc76a",
        fillColor: "#ffc76a",
        fillOpacity: 1,
        interactive: false,
      }).addTo(group);
    }
    if (measure.length === 2) {
      L.polyline(
        measure.map((spot) => [spot.lat, spot.lon] as [number, number]),
        style,
      ).addTo(group);
    }
  }, [ready, measure]);

  const zoomBy = (delta: number) =>
    instance.current?.setZoom(instance.current.getZoom() + delta);
  const fitBody = () => instance.current?.setView([0, 0], 1);

  const startMeasureFrom = (spot: Spot) => {
    setMeasuring(true);
    setMeasure([spot]);
    setMenu(null);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyCoordinates = async (spot: Spot) => {
    await navigator.clipboard
      .writeText(`${spot.lat.toFixed(4)}, ${spot.lon.toFixed(4)}`)
      .catch(() => null);
    setMenu(null);
  };

  const distance =
    measure.length === 2
      ? {
          metres: groundDistance(measure[0], measure[1], manifest.radius),
          heading: headingTo(measure[0], measure[1]),
        }
      : null;

  const toggle = (key: keyof Layers) =>
    setLayers((previous) => ({ ...previous, [key]: !previous[key] }));

  const chip = (
    key: "places" | "private" | "markers",
    color: string,
    count: number,
  ) => (
    <button
      type="button"
      aria-pressed={layers[key]}
      onClick={() => toggle(key)}
      className="flex items-center gap-1.5 rounded-full border border-[#9ED0FF]/20 px-2 py-0.5 text-[11.5px] text-[#c9e4ff] aria-[pressed=false]:text-[#5c7b96] aria-[pressed=false]:line-through"
    >
      <span className="size-2 rounded-full" style={{ background: color }} />
      {t(`layers.${key}`)} · {count}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label={t("show")}
        >
          {chip("places", "#c9e4ff", counts.places)}
          {signedIn && chip("markers", "#7ff0d0", counts.markers)}
          {signedIn &&
            counts.private > 0 &&
            chip("private", "#c4b2ff", counts.private)}
        </div>
        <span aria-hidden className="h-4 w-px bg-[#9ED0FF]/20" />
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#86a9c8]">
          <input
            type="checkbox"
            checked={layers.contours}
            onChange={() => toggle("contours")}
            className="size-3.5 accent-[#9ed0ff]"
          />
          {t("layers.contours")}
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#86a9c8]">
          <input
            type="checkbox"
            checked={layers.grid}
            onChange={() => toggle("grid")}
            className="size-3.5 accent-[#9ed0ff]"
          />
          {t("layers.grid")}
        </label>
        <span className="flex-1" />
        <button
          type="button"
          aria-pressed={measuring}
          onClick={() => {
            setMeasuring(!measuring);
            setMeasure([]);
          }}
          className="rounded-md border border-[#ffc76a]/45 px-2.5 py-1 text-xs font-medium text-[#ffc76a] hover:bg-[#ffc76a]/10 aria-pressed:bg-[#ffc76a]/15"
        >
          {t("measure")}
        </button>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md border border-[#9ED0FF]/20 px-2.5 py-1 text-xs font-medium text-[#86a9c8] hover:bg-[#9ED0FF]/15 hover:text-[#c9e4ff]"
        >
          {copied ? t("copied") : t("copyLink")}
        </button>
        <Link
          href={starMapHref}
          className="rounded-md border border-[#9ED0FF]/50 px-2.5 py-1 text-xs font-medium hover:bg-[#9ED0FF]/15"
        >
          {t("view3d")}
        </Link>
      </div>

      <div className="relative h-[420px] overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#030912] md:h-[560px]">
        <div
          ref={container}
          className="planet-map size-full"
          role="application"
          aria-label={t("mapLabel", { name: bodyName })}
        />

        {!ready && (
          <div className="absolute inset-0 grid place-items-center text-sm text-[#86a9c8]">
            {t("loading")}
          </div>
        )}

        <div
          className={`absolute top-3 right-3 z-[500] flex flex-col overflow-hidden ${PANEL}`}
        >
          <button
            type="button"
            aria-label={t("zoomIn")}
            onClick={() => zoomBy(1)}
            className="size-9 text-lg hover:bg-[#9ED0FF]/15"
          >
            +
          </button>
          <button
            type="button"
            aria-label={t("zoomOut")}
            onClick={() => zoomBy(-1)}
            className="size-9 border-t border-[#9ED0FF]/20 text-lg hover:bg-[#9ED0FF]/15"
          >
            −
          </button>
          <button
            type="button"
            aria-label={t("fit")}
            onClick={fitBody}
            className="grid size-9 place-items-center border-t border-[#9ED0FF]/20 hover:bg-[#9ED0FF]/15"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
            </svg>
          </button>
        </div>

        {selected && (
          <article
            className={`absolute top-3 left-3 z-[500] w-72 max-w-[calc(100%-5rem)] overflow-hidden ${PANEL}`}
          >
            <div className="grid gap-1.5 border-b border-[#9ED0FF]/20 px-4 pt-3.5 pb-3">
              <p className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.12em] text-[#86a9c8] uppercase">
                <span
                  className="size-2 rounded-full"
                  style={{ background: selected.color }}
                />
                {t(`kinds.${selected.kind}`)}
                {selected.org ? ` · ${selected.org}` : ""}
              </p>
              <h3 className="text-lg font-semibold text-balance">
                {selected.name}
              </h3>
              <p className="font-mono text-xs text-[#86a9c8]">
                {formatLatLon(selected, locale)} ·{" "}
                {formatDistance(Math.max(0, selected.alt), locale)}
              </p>
              {selected.collection && (
                <p className="text-xs text-[#86a9c8]">{selected.collection}</p>
              )}
              {selected.note && (
                <p className="text-[13px] leading-relaxed whitespace-pre-line">
                  {selected.note}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {selected.href && (
                <Link
                  href={selected.href}
                  className="rounded-md border border-[#9ED0FF]/50 px-2.5 py-1 text-xs font-medium hover:bg-[#9ED0FF]/15"
                >
                  {selected.kind === "marker"
                    ? t("openMarkers")
                    : t("openPlace")}
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  startMeasureFrom({ ...selected, alt: selected.alt });
                  setSelected(null);
                }}
                className="rounded-md border border-[#9ED0FF]/20 px-2.5 py-1 text-xs font-medium text-[#86a9c8] hover:bg-[#9ED0FF]/15 hover:text-[#c9e4ff]"
              >
                {t("measureFrom")}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="ml-auto rounded-md px-2 py-1 text-xs text-[#86a9c8] hover:text-[#c9e4ff]"
              >
                {t("close")}
              </button>
            </div>
          </article>
        )}

        {menu && (
          <div
            role="menu"
            aria-label={t("menuLabel")}
            className={`absolute z-[600] flex w-60 flex-col gap-0.5 p-1.5 ${PANEL}`}
            style={{ left: menu.x, top: menu.y }}
          >
            <span className="px-2.5 py-1.5 font-mono text-[11px] text-[#86a9c8]">
              {formatLatLon(menu, locale)}
              {menu.alt !== null &&
                ` · ${formatDistance(Math.max(0, menu.alt), locale)}`}
            </span>
            {signedIn && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAdding(menu);
                  setMenu(null);
                }}
                className="rounded-md bg-[#7ff0d0]/12 px-2.5 py-1.5 text-left text-[13px] font-medium text-[#7ff0d0] hover:bg-[#7ff0d0]/20"
              >
                {t("addMarker")}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => startMeasureFrom(menu)}
              className="rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-[#9ED0FF]/12"
            >
              {t("measureFrom")}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => copyCoordinates(menu)}
              className="rounded-md px-2.5 py-1.5 text-left text-[13px] hover:bg-[#9ED0FF]/12"
            >
              {t("copyCoordinates")}
            </button>
          </div>
        )}

        {adding && (
          <AddMarkerForm
            spot={adding}
            slug={manifest.slug}
            radius={manifest.radius}
            onClose={() => setAdding(null)}
            onSaved={() => {
              setAdding(null);
              router.refresh();
            }}
          />
        )}

        <div
          className={`absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[11.5px] text-[#86a9c8] ${PANEL}`}
        >
          {distance ? (
            <span className="font-mono text-[#ffc76a]">
              {t("distance", {
                distance: formatDistance(distance.metres, locale),
                heading: Math.round(distance.heading),
              })}
            </span>
          ) : measuring ? (
            <span className="text-[#ffc76a]">
              {t(measure.length ? "measureSecond" : "measureFirst")}
            </span>
          ) : cursor ? (
            <span className="font-mono text-[#c9e4ff]">
              {formatLatLon(cursor, locale)}
              {cursor.alt !== null &&
                ` · ${formatDistance(Math.max(0, cursor.alt), locale)}`}
            </span>
          ) : (
            <span>{signedIn ? t("hintSignedIn") : t("hint")}</span>
          )}
        </div>
        <p className="pointer-events-none absolute right-3 bottom-3 z-[500] hidden rounded-md bg-[#030912]/60 px-2 py-0.5 text-[10.5px] text-[#86a9c8] md:block">
          {manifest.attribution}
        </p>
      </div>
    </div>
  );
}

/** Poser un marqueur au point cliqué, à l'altitude du sol lue sur la carte. */
function AddMarkerForm({
  spot,
  slug,
  radius,
  onClose,
  onSaved,
}: {
  spot: Spot;
  slug: string;
  radius: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("PlanetMap");
  const tm = useTranslations("Markers");
  const locale = useLocale();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MarkerKind>("poi");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const position = {
        body: slug,
        ...pointOfGeo(spot, spot.alt ?? 0, radius),
      };
      const response = await fetch("/api/marqueurs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind, position, source: "map" }),
      }).catch(() => null);
      if (!response?.ok) {
        const data = (await response?.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          tm.has(`errors.${data?.error}`)
            ? tm(`errors.${data?.error}` as "errors.unknown")
            : tm("errors.unknown"),
        );
        return;
      }
      onSaved();
    });
  };

  return (
    <form
      onSubmit={submit}
      className={`absolute top-3 left-3 z-[600] grid w-72 max-w-[calc(100%-5rem)] gap-3 p-4 ${PANEL}`}
    >
      <div className="grid gap-1">
        <h3 className="text-[15px] font-semibold">{t("addMarker")}</h3>
        <p className="font-mono text-[11px] text-[#86a9c8]">
          {formatLatLon(spot, locale)}
          {spot.alt !== null &&
            ` · ${formatDistance(Math.max(0, spot.alt), locale)}`}
        </p>
      </div>
      <label className="grid gap-1 text-xs text-[#86a9c8]">
        {tm("fieldName")}
        <input
          required
          autoFocus
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="h-9 rounded-md border border-[#9ED0FF]/20 bg-[#0B3A5A]/60 px-3 text-sm text-[#cce7ff]"
        />
      </label>
      <label className="grid gap-1 text-xs text-[#86a9c8]">
        {tm("fieldKind")}
        <select
          value={kind}
          onChange={(event) => setKind(event.target.value as MarkerKind)}
          className="h-9 rounded-md border border-[#9ED0FF]/20 bg-[#0B3A5A] px-3 text-sm text-[#cce7ff]"
        >
          {MARKER_KINDS.map((one) => (
            <option key={one} value={one}>
              {tm(`kinds.${one}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] leading-relaxed text-[#86a9c8]">
        {t("addMarkerHint")}
      </p>
      {error && <p className="text-xs text-red-300">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs text-[#86a9c8] hover:text-[#c9e4ff]"
        >
          {t("cancel")}
        </button>
        <button
          type="submit"
          disabled={isPending || !name.trim()}
          className="rounded-md border border-[#7ff0d0]/50 bg-[#7ff0d0]/15 px-3 py-1.5 text-xs font-semibold text-[#7ff0d0] disabled:opacity-50"
        >
          {t("save")}
        </button>
      </div>
    </form>
  );
}
