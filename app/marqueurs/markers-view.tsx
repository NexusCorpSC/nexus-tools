"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import {
  MapIcon,
  MapPinIcon,
  PencilSquareIcon,
  PlusIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { SharePanel } from "@/components/share-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listNpsBodiesAction } from "@/app/lieux/nps-actions";
import { geoOf } from "@/lib/nps-geometry";
import {
  DEFAULT_MARKER_COLOR,
  MARKER_KINDS,
  type Marker,
  type MarkerCollection,
  type MarkerListResponse,
} from "@/types/markers";
import type { NpsBody } from "@/types/places";
import { CollectionDialog, MarkerDialog } from "./marker-dialogs";
import { MarkerPin } from "./marker-pin";

/** La teinte des marqueurs sur le site. */
const MARKER_TINT = DEFAULT_MARKER_COLOR;

type Filter = "all" | "none" | string;
type Sort = "recent" | "name";

/**
 * La page « Mes marqueurs » : les collections à gauche, le tableau à droite,
 * les dialogues pour ajouter, modifier et partager. Tout est chargé d'un coup
 * (1 000 marqueurs au plus) et filtré ici ; chaque écriture recharge la liste.
 */
export function MarkersView({
  initial,
  systems,
  initialFilter,
}: {
  initial: MarkerListResponse;
  systems: { slug: string; name: string }[];
  /** La collection à ouvrir, depuis une invitation. */
  initialFilter?: string;
}) {
  const t = useTranslations("Markers");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [data, setData] = useState(initial);
  const [bodies, setBodies] = useState<NpsBody[]>([]);
  const [filter, setFilter] = useState<Filter>(initialFilter ?? "all");
  const [kind, setKind] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Marker | "new" | null>(null);
  const [editingCollection, setEditingCollection] = useState<
    MarkerCollection | "new" | null
  >(null);
  const [moveError, setMoveError] = useState(false);
  const [sharing, setSharing] = useState<MarkerCollection | null>(null);
  const [leaveError, setLeaveError] = useState(false);

  useEffect(() => {
    listNpsBodiesAction()
      .then(setBodies)
      .catch(() => setBodies([]));
  }, []);

  const reload = useCallback(async () => {
    const response = await fetch("/api/marqueurs").catch(() => null);
    if (response?.ok) setData((await response.json()) as MarkerListResponse);
    setSelected(new Set());
  }, []);

  const bodyBySlug = useMemo(
    () => new Map(bodies.map((one) => [one.slug, one])),
    [bodies],
  );
  const noneCount = data.markers.filter((m) => !m.collectionId).length;

  const bodyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const marker of data.markers) {
      if (marker.bodySlug)
        seen.set(marker.bodySlug, marker.bodyName ?? marker.bodySlug);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.markers]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = data.markers.filter(
      (marker) =>
        (filter === "all" ||
          (filter === "none"
            ? !marker.collectionId
            : marker.collectionId === filter)) &&
        (!kind || marker.kind === kind) &&
        (!body || marker.bodySlug === body) &&
        (!needle ||
          marker.name.toLowerCase().includes(needle) ||
          (marker.note ?? "").toLowerCase().includes(needle)),
    );
    if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [data.markers, filter, kind, body, query, sort]);

  const ownCollections = data.collections.filter((c) => c.isOwner);
  const current =
    filter !== "all" && filter !== "none"
      ? data.collections.find((c) => c.id === filter)
      : undefined;

  function where(marker: Marker): { place: string; coords?: string } {
    const place =
      marker.bodyName ??
      t("inSpaceOf", { system: marker.systemName ?? marker.systemSlug });
    if (!marker.bodySlug) return { place };
    const found = bodyBySlug.get(marker.bodySlug);
    const geo = geoOf(marker.position, found ?? ({ radius: 0 } as NpsBody));
    const degrees = (value: number) =>
      format.number(value, { maximumFractionDigits: 2 });
    const coords = `${degrees(geo.latitude)}° / ${degrees(geo.longitude)}°`;
    return {
      place,
      coords: found
        ? `${coords} · ${format.number(Math.max(0, Math.round(geo.altitude)))} m`
        : coords,
    };
  }

  async function move(collectionId: string) {
    setMoveError(false);
    const response = await fetch("/api/marqueurs/deplacer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: [...selected],
        collectionId: collectionId === "none" ? null : collectionId,
      }),
    }).catch(() => null);
    if (!response?.ok) {
      setMoveError(true);
      return;
    }
    await reload();
  }

  /** L'invité qui ne veut plus voir une collection retire son accès. */
  async function leave(collection: MarkerCollection) {
    setLeaveError(false);
    const response = await fetch(
      `/api/me/shares/markerCollection/${encodeURIComponent(collection.id)}`,
      { method: "DELETE" },
    ).catch(() => null);
    if (!response?.ok) {
      setLeaveError(true);
      return;
    }
    if (filter === collection.id) setFilter("all");
    await reload();
  }

  const collectionItem = (
    key: Filter,
    label: string,
    color: string,
    count: number,
    sub?: React.ReactNode,
    collection?: MarkerCollection,
  ) => (
    <li key={key} className="group flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          setFilter(key);
          setSelected(new Set());
        }}
        aria-pressed={filter === key}
        className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
          filter === key ? "bg-white/10 text-foreground" : "hover:bg-white/5"
        }`}
      >
        <i
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {sub}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {count}
        </span>
      </button>
      {collection?.isOwner && (
        <button
          type="button"
          onClick={() => setSharing(collection)}
          aria-label={t("shareCollection", { name: collection.name })}
          className="rounded-md p-1.5 text-muted-foreground opacity-60 hover:bg-white/5 hover:opacity-100 focus-visible:opacity-100"
        >
          <UserPlusIcon className="size-4" />
        </button>
      )}
      {collection?.sharedWithMe && (
        <button
          type="button"
          onClick={() => void leave(collection)}
          aria-label={t("leaveCollection", { name: collection.name })}
          title={t("leaveCollection", { name: collection.name })}
          className="rounded-md p-1.5 text-muted-foreground opacity-60 hover:bg-white/5 hover:opacity-100 focus-visible:opacity-100"
        >
          <XMarkIcon className="size-4" />
        </button>
      )}
      {collection?.isOwner && (
        <button
          type="button"
          onClick={() => setEditingCollection(collection)}
          aria-label={t("editCollection", { name: collection.name })}
          className="rounded-md p-1.5 text-muted-foreground opacity-60 hover:bg-white/5 hover:opacity-100 focus-visible:opacity-100"
        >
          <PencilSquareIcon className="size-4" />
        </button>
      )}
    </li>
  );

  return (
    <div className="m-2 mx-auto max-w-6xl space-y-5 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("summary", {
              markers: data.markers.length,
              collections: data.collections.length,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/starmap">
              <MapIcon className="size-4" />
              {t("openStarMap")}
            </Link>
          </Button>
          <Button
            size="sm"
            onClick={() => setEditing("new")}
            className="bg-[#7ff0d0] font-semibold text-[#04261d] hover:bg-[#7ff0d0]/90"
          >
            <PlusIcon className="size-4" />
            {t("add")}
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav
          aria-label={t("collections")}
          className="h-fit rounded-xl border border-[#9ED0FF]/15 bg-[#092f49]/50 p-2"
        >
          <p className="px-2.5 pt-1 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            {t("collections")}
          </p>
          <ul className="space-y-0.5">
            {collectionItem("all", t("all"), "#a9cdee", data.markers.length)}
            {data.collections.map((collection) =>
              collectionItem(
                collection.id,
                collection.name,
                collection.color,
                collection.count,
                <span
                  className={`block truncate text-[11px] ${collection.org || collection.sharedWithMe || collection.guestCount ? "text-[#c4b2ff]" : "text-muted-foreground"}`}
                >
                  {[
                    collection.org
                      ? collection.isOwner
                        ? t("sharedWith", { org: collection.org.name })
                        : t("sharedBy", {
                            owner: collection.ownerName ?? "?",
                            org: collection.org.name,
                          })
                      : collection.sharedWithMe
                        ? t("sharedByPlayer", {
                            owner: collection.ownerName ?? "?",
                          })
                        : collection.guestCount
                          ? null
                          : t("onlyMe"),
                    collection.guestCount
                      ? t("guests", { count: collection.guestCount })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>,
                collection,
              ),
            )}
            {collectionItem("none", t("none"), MARKER_TINT, noneCount)}
          </ul>
          {leaveError && (
            <p role="alert" className="px-2.5 pt-1 text-xs text-red-300">
              {t("leaveError")}
            </p>
          )}
          <button
            type="button"
            onClick={() => setEditingCollection("new")}
            className="mt-1.5 flex w-full items-center gap-2 border-t border-[#9ED0FF]/15 px-2.5 pt-2.5 pb-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <PlusIcon className="size-4" />
            {t("newCollection")}
          </button>
        </nav>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#9ED0FF]/25 bg-[#163f5e]/50 p-3">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="min-w-0 flex-[1_1_200px]"
            />
            <select
              value={kind}
              onChange={(event) => setKind(event.target.value)}
              aria-label={t("kindFilter")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t("allKinds")}</option>
              {MARKER_KINDS.map((one) => (
                <option key={one} value={one}>
                  {t(`kinds.${one}`)}
                </option>
              ))}
            </select>
            <select
              value={body}
              onChange={(event) => setBody(event.target.value)}
              aria-label={t("bodyFilter")}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t("allBodies")}</option>
              {bodyOptions.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
            <div
              role="radiogroup"
              aria-label={t("sort")}
              className="inline-flex rounded-lg border border-input p-0.5"
            >
              {(["recent", "name"] as const).map((one) => (
                <button
                  key={one}
                  type="button"
                  role="radio"
                  aria-checked={sort === one}
                  onClick={() => setSort(one)}
                  className={`rounded-md px-2.5 py-1 text-xs ${sort === one ? "bg-white/15 text-foreground" : "text-muted-foreground"}`}
                >
                  {t(`sorts.${one}`)}
                </button>
              ))}
            </div>
          </div>

          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#7ff0d0]/40 bg-[#7ff0d0]/10 px-3 py-2 text-sm">
              <span>{t("selectedCount", { count: selected.size })}</span>
              <select
                aria-label={t("moveTo")}
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) void move(event.target.value);
                  event.target.value = "";
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="" disabled>
                  {t("moveTo")}
                </option>
                {ownCollections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
                <option value="none">{t("none")}</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                {t("clearSelection")}
              </Button>
              {moveError && (
                <span className="text-red-400">{t("errors.unknown")}</span>
              )}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#7ff0d0]/40 p-6 text-center text-sm text-muted-foreground">
              <MapPinIcon className="mx-auto mb-2 size-6 text-[#7ff0d0]" />
              {data.markers.length === 0 ? t("empty") : t("noMatch")}
            </div>
          ) : (
            <ul className="divide-y divide-[#9ED0FF]/15 overflow-hidden rounded-xl border border-[#9ED0FF]/15">
              {shown.map((marker) => {
                const place = where(marker);
                return (
                  <li
                    key={marker.id}
                    className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-sm sm:flex-nowrap ${selected.has(marker.id) ? "bg-[#7ff0d0]/5" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(marker.id)}
                      disabled={!marker.isOwner}
                      aria-label={t("select", { name: marker.name })}
                      onChange={(event) => {
                        const next = new Set(selected);
                        if (event.target.checked) next.add(marker.id);
                        else next.delete(marker.id);
                        setSelected(next);
                      }}
                      className="size-4 accent-[#7ff0d0] disabled:opacity-30"
                    />
                    <MarkerPin color={marker.color} />
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="truncate font-semibold">{marker.name}</p>
                      {marker.note && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {marker.note}
                        </p>
                      )}
                      {!marker.isOwner && (
                        <p className="flex items-center gap-1 text-[11px] text-[#c4b2ff]">
                          <UserGroupIcon className="size-3" />
                          {t("by", { owner: marker.ownerName ?? "?" })}
                        </p>
                      )}
                    </div>
                    <div className="min-w-0 basis-44 text-muted-foreground max-sm:order-last max-sm:basis-full max-sm:pl-7">
                      <p className="truncate text-foreground/80">
                        {place.place}
                      </p>
                      {place.coords && (
                        <p className="font-mono text-[11px] whitespace-nowrap">
                          {place.coords}
                        </p>
                      )}
                    </div>
                    <span className="hidden w-24 shrink-0 md:block">
                      <span className="rounded bg-[#9ED0FF]/10 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-[#a9cdee] uppercase">
                        {t(`kinds.${marker.kind}`)}
                      </span>
                    </span>
                    <time
                      // L'heure du serveur et celle du navigateur diffèrent de
                      // quelques secondes : « il y a 17 s » contre « 23 s ».
                      suppressHydrationWarning
                      dateTime={marker.createdAt}
                      title={format.dateTime(new Date(marker.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      className="hidden w-24 shrink-0 text-xs text-muted-foreground md:block"
                    >
                      {format.relativeTime(new Date(marker.createdAt), now)}
                    </time>
                    <span className="ml-auto flex w-[4.625rem] shrink-0 justify-end gap-1.5">
                      <Button asChild variant="outline" size="icon-sm">
                        <Link
                          href={`/starmap?place=${encodeURIComponent(`marqueur-${marker.id}`)}`}
                          aria-label={t("showOnMap", { name: marker.name })}
                        >
                          <MapIcon className="size-4" />
                        </Link>
                      </Button>
                      {marker.isOwner && (
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={t("edit", { name: marker.name })}
                          onClick={() => setEditing(marker)}
                        >
                          <PencilSquareIcon className="size-4" />
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {current && !current.isOwner && (
            <p className="text-xs text-muted-foreground">
              {t("sharedReadOnly")}
            </p>
          )}
        </div>
      </div>

      {editing && (
        <MarkerDialog
          marker={editing === "new" ? undefined : editing}
          collections={ownCollections}
          defaultCollectionId={current?.isOwner ? current.id : undefined}
          systems={systems}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
      {sharing && (
        <SharePanel
          kind="markerCollection"
          id={sharing.id}
          open
          onOpenChange={(open) => {
            if (open) return;
            setSharing(null);
            // Le nombre d'invités de la colonne suit.
            void reload();
          }}
        />
      )}
      {editingCollection && (
        <CollectionDialog
          collection={
            editingCollection === "new" ? undefined : editingCollection
          }
          orgs={data.orgs}
          onClose={() => setEditingCollection(null)}
          onSaved={async (removedId) => {
            if (removedId && filter === removedId) setFilter("all");
            await reload();
          }}
        />
      )}
    </div>
  );
}
