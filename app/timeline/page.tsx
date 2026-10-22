import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MagnifyingGlassIcon, PlusIcon } from "@heroicons/react/24/outline";
import { RememberListUrl } from "@/components/remember-list-url";
import { listTimelineEvents } from "@/lib/timeline-events";
import {
  TIMELINE_EVENT_TYPES,
  TIMELINE_SYSTEMS,
  matchesTimelineSearch,
  type TimelineEventSummary,
  type TimelineSearch,
} from "@/types/timeline-events";
import {
  BannerArt,
  StatusBadge,
  Tag,
  TimelineShell,
  dateRange,
  remaining,
  timelinePath,
} from "./components";
import { Frieze } from "./frieze";

export const metadata: Metadata = {
  title: "Évènements officiels",
  description:
    "Les évènements en jeu de Star Citizen : celui en cours, ceux à venir, tout l'historique et les guides de la communauté.",
  openGraph: {
    title: "Évènements officiels — Nexus Tools",
    description:
      "Les évènements en jeu de Star Citizen et les guides de la communauté.",
    url: "https://tools.services.nexus/timeline",
  },
};

type Search = TimelineSearch;

function href(search: Search, change: Partial<Search>): string {
  const next = { ...search, ...change };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/timeline?${query}` : "/timeline";
}

async function GuideState({ sections }: { sections: number }) {
  const t = await getTranslations("Timeline");
  return sections > 0 ? (
    <span className="text-xs text-[#7FF0D0]">● {t("guideCount", { count: sections })}</span>
  ) : (
    <span className="text-xs text-muted-foreground">○ {t("guideMissing")}</span>
  );
}

async function LiveHero({ event }: { event: TimelineEventSummary }) {
  const t = await getTranslations("Timeline");
  const [range, left] = await Promise.all([dateRange(event), remaining(event)]);
  return (
    <div className="grid overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <BannerArt
        banner={event.banner}
        alt=""
        sizes="(min-width: 1024px) 640px, 100vw"
        priority
        className="min-h-56 lg:min-h-80"
      >
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          <StatusBadge status="live" />
          {event.patch && <Tag>{event.patch}</Tag>}
        </div>
      </BannerArt>
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        <div className="space-y-1">
          {range && (
            <p className="font-mono text-xs text-muted-foreground">{range}</p>
          )}
          <h3 className="text-2xl font-bold text-[#E3F1FF]">{event.name}</h3>
          <p className="text-nexus">{event.summary}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {left && (
            <div className="rounded-lg border border-[#9ED0FF]/12 bg-[#030912]/30 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t("endsIn")}</dt>
              <dd className="font-mono text-lg font-semibold text-[#E3F1FF]">{left}</dd>
            </div>
          )}
          <div className="rounded-lg border border-[#9ED0FF]/12 bg-[#030912]/30 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{t("rewards")}</dt>
            <dd className="font-mono text-lg font-semibold text-[#E3F1FF]">
              {event.rewardCount}
            </dd>
          </div>
        </dl>
        <GuideState sections={event.guideSections} />
        <div className="mt-auto flex flex-wrap gap-2">
          <Link
            href={timelinePath(event.slug)}
            className="inline-flex h-10 items-center rounded-lg bg-[#2C7BE5] px-4 text-sm font-semibold text-white hover:bg-[#2569C4]"
          >
            {t("open")}
          </Link>
          <Link
            href={`${timelinePath(event.slug)}?tab=rewards`}
            className="inline-flex h-10 items-center rounded-lg border border-[#9ED0FF]/28 bg-[#0B3A5A]/60 px-4 text-sm font-semibold text-[#CCE7FF] hover:bg-[#0B3A5A]"
          >
            {t("rewardsAndMissions")}
          </Link>
        </div>
      </div>
    </div>
  );
}

async function EventCard({ event }: { event: TimelineEventSummary }) {
  const tType = await getTranslations("Timeline.types");
  const range = await dateRange(event);
  return (
    <Link
      href={timelinePath(event.slug)}
      className="flex items-center gap-3.5 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-3.5 transition-colors hover:border-[#9ED0FF]/35"
    >
      <BannerArt
        banner={event.banner}
        alt=""
        sizes="72px"
        className="h-11 w-18 shrink-0 rounded-lg border border-[#9ED0FF]/20"
      />
      <span className="min-w-0 space-y-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={event.status} />
          {range && (
            <span className="font-mono text-xs text-muted-foreground">{range}</span>
          )}
        </span>
        <span className="block font-semibold text-[#E3F1FF]">{event.name}</span>
        <span className="block text-xs text-muted-foreground">
          {tType(event.type)}
        </span>
      </span>
    </Link>
  );
}

async function HistoryRow({ event }: { event: TimelineEventSummary }) {
  const tType = await getTranslations("Timeline.types");
  const tSystem = await getTranslations("Timeline.systems");
  const range = await dateRange(event, { year: false });
  return (
    <li>
      <Link
        href={timelinePath(event.slug)}
        className="grid gap-x-4 gap-y-1 border-t border-[#9ED0FF]/12 px-4 py-3.5 transition-colors hover:bg-[#9ED0FF]/5 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center"
      >
        <span className="font-mono text-xs text-muted-foreground">{range}</span>
        <span className="flex min-w-0 items-center gap-3.5">
          <BannerArt
            banner={event.banner}
            alt=""
            sizes="72px"
            className="hidden h-11 w-18 shrink-0 rounded-lg border border-[#9ED0FF]/20 sm:block"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#E3F1FF]">{event.name}</span>
              <StatusBadge status={event.status} />
              {event.patch && <Tag>{event.patch}</Tag>}
            </span>
            <span className="block text-xs text-muted-foreground">
              {[tType(event.type), ...event.systems.map((system) => tSystem(system))].join(
                " · ",
              )}
            </span>
          </span>
        </span>
        <GuideState sections={event.guideSections} />
      </Link>
    </li>
  );
}

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const t = await getTranslations("Timeline");
  const tType = await getTranslations("Timeline.types");
  const tSystem = await getTranslations("Timeline.systems");
  const search = await searchParams;
  const events = await listTimelineEvents();

  const live = events.filter((event) => event.status === "live");
  const upcoming = events
    .filter((event) => event.status === "upcoming" || event.status === "announced")
    .reverse();
  const filtered = events.filter(
    (event) => event.startAt && matchesTimelineSearch(event, search),
  );
  const years = new Map<number, TimelineEventSummary[]>();
  for (const event of filtered) {
    const year = new Date(event.startAt!).getUTCFullYear();
    years.set(year, [...(years.get(year) ?? []), event]);
  }
  const filtering = !!(search.q || search.type || search.system || search.guide);
  const chip = (active: boolean) =>
    `inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] ${
      active
        ? "border-[#CCE7FF] bg-[#CCE7FF] font-semibold text-[#062338]"
        : "border-[#9ED0FF]/28 text-nexus hover:border-[#9ED0FF]/50"
    }`;

  return (
    <TimelineShell>
      <RememberListUrl />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl space-y-1.5">
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-nexus">{t("header")}</p>
        </div>
        <Link
          href="/timeline/nouveau"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#9ED0FF]/28 bg-[#0B3A5A]/60 px-4 text-sm font-semibold text-[#CCE7FF] hover:bg-[#0B3A5A]"
        >
          <PlusIcon className="size-4" />
          {t("add")}
        </Link>
      </div>

      <section aria-labelledby="timeline-live" className="space-y-3">
        <h2 id="timeline-live" className="text-lg font-semibold">
          {t("live")}
        </h2>
        {live.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noLive")}</p>
        ) : (
          <>
            <LiveHero event={live[0]} />
            {live.length > 1 && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {live.slice(1).map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="timeline-upcoming" className="space-y-3">
          <h2 id="timeline-upcoming" className="text-lg font-semibold">
            {t("upcoming")}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}

      {events.some((event) => event.startAt) && (
        <section aria-labelledby="timeline-frieze" className="space-y-3">
          <h2 id="timeline-frieze" className="text-lg font-semibold">
            {t("frieze")}
          </h2>
          <Frieze events={filtered} />
        </section>
      )}

      <section aria-labelledby="timeline-history" className="space-y-3">
        <h2 id="timeline-history" className="text-lg font-semibold">
          {t("history")}
        </h2>
        <form action="/timeline" className="flex flex-wrap items-center gap-2">
          {search.type && <input type="hidden" name="type" value={search.type} />}
          {search.system && (
            <input type="hidden" name="system" value={search.system} />
          )}
          {search.guide && <input type="hidden" name="guide" value={search.guide} />}
          <div className="relative min-w-56 flex-1 sm:max-w-xs">
            <label htmlFor="timeline-q" className="sr-only">
              {t("searchLabel")}
            </label>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              id="timeline-q"
              name="q"
              type="search"
              defaultValue={search.q}
              placeholder={t("searchPlaceholder")}
              className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-md bg-[#2C7BE5] px-4 text-sm font-medium text-white hover:bg-[#2C7BE5]/85"
          >
            {t("searchButton")}
          </button>
        </form>
        <nav aria-label={t("filters")} className="flex flex-wrap gap-1.5">
          <Link href={href(search, { type: undefined })} className={chip(!search.type)}>
            {t("allTypes")}
          </Link>
          {TIMELINE_EVENT_TYPES.map((type) => (
            <Link
              key={type}
              href={href(search, { type: search.type === type ? undefined : type })}
              className={chip(search.type === type)}
              aria-current={search.type === type ? "true" : undefined}
            >
              {tType(type)}
            </Link>
          ))}
          <span className="mx-1 w-px self-stretch bg-[#9ED0FF]/15" aria-hidden="true" />
          {TIMELINE_SYSTEMS.map((system) => (
            <Link
              key={system}
              href={href(search, {
                system: search.system === system ? undefined : system,
              })}
              className={chip(search.system === system)}
              aria-current={search.system === system ? "true" : undefined}
            >
              {tSystem(system)}
            </Link>
          ))}
          <Link
            href={href(search, {
              guide: search.guide === "missing" ? undefined : "missing",
            })}
            className={chip(search.guide === "missing")}
            aria-current={search.guide === "missing" ? "true" : undefined}
          >
            {t("withoutGuide")}
          </Link>
        </nav>

        {years.size === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            {filtering ? t("noResults") : t("empty")}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45]">
            {[...years.entries()].map(([year, list]) => (
              <div key={year}>
                <div className="flex items-baseline gap-3 px-4 pb-2 pt-5">
                  <h3 className="font-mono text-xl font-semibold text-[#E3F1FF]">
                    {year}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {t("yearCount", { year: year + 930, count: list.length })}
                  </span>
                </div>
                <ul>
                  {list.map((event) => (
                    <HistoryRow key={event.id} event={event} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </TimelineShell>
  );
}
