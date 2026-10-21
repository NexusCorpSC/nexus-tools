import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ObjectId } from "mongodb";
import {
  ArrowTopRightOnSquareIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { MarkdownContent } from "@/components/markdown-content";
import {
  countTimelineBugs,
  getTimelineEvent,
  getTimelineProgress,
  listTimelineAuthors,
  listTimelineBugs,
  resolveTimelineRefs,
} from "@/lib/timeline-events";
import { CONTRIBUTIONS_REVIEW_PERMISSION } from "@/types/contributions";
import {
  countRewards,
  timelineStatus,
  type TimelineEvent,
} from "@/types/timeline-events";
import {
  BannerArt,
  StatusBadge,
  Tag,
  TimelineShell,
  dateRange,
  remaining,
  timelinePath,
} from "../components";
import { RewardTracks } from "./reward-tracks";
import { BugsPanel } from "./bugs-panel";
import { RemoveEventButton } from "./remove-button";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const TABS = ["guide", "rewards", "missions", "bugs"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const event = await getTimelineEvent(slug);
  if (!event) return { title: "Évènements officiels" };
  return {
    title: `${event.name} — Évènements officiels`,
    description: event.summary,
    openGraph: {
      title: `${event.name} — Nexus Tools`,
      description: event.summary,
      url: `https://tools.services.nexus${timelinePath(event.slug)}`,
      images: event.banner ? [{ url: event.banner.url }] : [],
    },
  };
}

async function Presentation({
  event,
  place,
}: {
  event: TimelineEvent;
  place?: { slug: string; name: string };
}) {
  const t = await getTranslations("Timeline.Event");
  const tSystem = await getTranslations("Timeline.systems");
  const facts = [
    { label: t("access"), value: t(`accessValues.${event.access}`) },
    {
      label: t("where"),
      value:
        event.systems.map((system) => tSystem(system)).join(", ") || "—",
      extra: place ? (
        <Link href={`/lieux/${place.slug}`} className="text-xs hover:underline">
          {place.name}
        </Link>
      ) : null,
    },
    {
      label: t("rewardsLabel"),
      value: event.permanentRewards ? t("permanent") : t("temporary"),
    },
  ];
  return (
    <section
      aria-labelledby="event-presentation"
      className="space-y-4 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <h2 id="event-presentation" className="text-lg font-semibold">
          {t("presentation")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("fromOfficial")}</span>
      </div>
      {event.description ? (
        <MarkdownContent content={event.description} />
      ) : (
        <p className="text-nexus">{event.summary}</p>
      )}
      <dl className="grid gap-2.5 sm:grid-cols-3">
        {facts.map((fact) => (
          <div
            key={fact.label}
            className="flex flex-col rounded-lg border border-[#9ED0FF]/12 bg-[#030912]/30 px-3 py-2"
          >
            <dt className="text-xs text-muted-foreground">{fact.label}</dt>
            <dd className="font-semibold text-[#E3F1FF]">{fact.value}</dd>
            {fact.extra}
          </div>
        ))}
      </dl>
    </section>
  );
}

async function Guide({
  event,
  authors,
}: {
  event: TimelineEvent;
  authors: number;
}) {
  const t = await getTranslations("Timeline.Event");
  const guidePath = `${timelinePath(event.slug)}/guide`;
  return (
    <section
      aria-labelledby="event-guide"
      className="space-y-5 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1 space-y-0.5">
          <h2 id="event-guide" className="text-lg font-semibold">
            {t("guide")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("guideByline", { count: authors })}
          </p>
        </div>
        <Link
          href={`${guidePath}?section=new`}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2C7BE5] px-3 text-[13px] font-semibold text-white hover:bg-[#2569C4]"
        >
          <PencilSquareIcon className="size-4" />
          {t("addSection")}
        </Link>
      </div>

      {event.guide.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[#9ED0FF]/28 p-4 text-sm text-nexus">
          {t("guideEmpty")}
        </p>
      ) : (
        <>
          {event.guide.length > 1 && (
            <nav aria-label={t("guideToc")} className="flex flex-wrap gap-1.5">
              {event.guide.map((section) => (
                <a
                  key={section.id}
                  href={`#g-${section.id}`}
                  className="rounded-full border border-[#9ED0FF]/28 px-3 py-1 text-[12.5px] text-nexus no-underline hover:border-[#9ED0FF]/50"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          )}
          {event.guide.map((section) => (
            <article
              key={section.id}
              id={`g-${section.id}`}
              className="scroll-mt-4 space-y-2 border-t border-[#9ED0FF]/12 pt-4"
            >
              <div className="flex flex-wrap items-baseline gap-2.5">
                <h3 className="font-semibold text-[#E3F1FF]">{section.title}</h3>
                <Link
                  href={`${guidePath}?section=${section.id}`}
                  className="ml-auto text-xs"
                >
                  {t("editSection")}
                </Link>
              </div>
              <MarkdownContent content={section.body} />
            </article>
          ))}
        </>
      )}
    </section>
  );
}

async function Missions({
  event,
  titles,
}: {
  event: TimelineEvent;
  titles: Record<string, string>;
}) {
  const t = await getTranslations("Timeline.Event");
  const format = await getFormatter();
  const missions = [...event.missions].sort(
    (a, b) => (b.points ?? -1) - (a.points ?? -1),
  );
  return (
    <section
      aria-labelledby="event-missions"
      className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="event-missions" className="text-lg font-semibold">
          {t("missions")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("missionsHint")}</span>
        <Link
          href={`${timelinePath(event.slug)}/modifier#missions`}
          className="ml-auto inline-flex h-8 items-center rounded-lg border border-[#9ED0FF]/28 px-3 text-[13px] font-semibold text-[#CCE7FF] hover:bg-[#0B3A5A]"
        >
          {t("addMission")}
        </Link>
      </div>
      {missions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noMissions")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead className="text-muted-foreground">
              <tr className="border-b border-[#9ED0FF]/20">
                <th className="px-2.5 py-2 font-medium">{t("contract")}</th>
                <th className="px-2.5 py-2 font-medium">{t("track")}</th>
                <th className="px-2.5 py-2 font-medium">{t("conditions")}</th>
                <th className="px-2.5 py-2 text-right font-medium">{t("points")}</th>
                <th className="px-2.5 py-2 text-right font-medium">aUEC</th>
              </tr>
            </thead>
            <tbody>
              {missions.map((mission, index) => (
                <tr key={index} className="border-b border-[#9ED0FF]/10 align-top">
                  <td className="px-2.5 py-2.5">
                    {mission.missionId && titles[mission.missionId] ? (
                      <Link href={`/missions/${mission.missionId}`}>
                        {titles[mission.missionId]}
                      </Link>
                    ) : (
                      <span className="text-[#E3F1FF]">{mission.name ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-2.5 py-2.5">{mission.track ?? "—"}</td>
                  <td className="px-2.5 py-2.5 text-muted-foreground">
                    {mission.conditions ?? "—"}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono text-[#E3F1FF]">
                    {mission.points !== undefined ? format.number(mission.points) : "—"}
                  </td>
                  <td className="px-2.5 py-2.5 text-right font-mono text-[#E3F1FF]">
                    {mission.auec !== undefined ? format.number(mission.auec) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function TimelineEventPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { tab: rawTab } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? "")
    ? (rawTab as Tab)
    : "guide";
  const moderator = await hasPermission(CONTRIBUTIONS_REVIEW_PERMISSION);
  // Un évènement retiré reste lisible par la modération, qui peut le remettre.
  const event = await getTimelineEvent(slug, { includeRemoved: moderator });
  if (!event) notFound();

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user ? new ObjectId(session.user.id) : undefined;
  const t = await getTranslations("Timeline.Event");
  const tTimeline = await getTranslations("Timeline");
  const tType = await getTranslations("Timeline.types");
  const tSource = await getTranslations("Timeline.sources");
  const tSystem = await getTranslations("Timeline.systems");

  const [refs, authors, bugCount, bugs, progress, range, left] =
    await Promise.all([
      resolveTimelineRefs(event),
      listTimelineAuthors(event.slug),
      countTimelineBugs(event.slug),
      tab === "bugs" ? listTimelineBugs(event.slug, userId) : Promise.resolve([]),
      tab === "rewards" && userId
        ? getTimelineProgress(userId, event.slug)
        : Promise.resolve(null),
      dateRange(event),
      remaining(event),
    ]);
  const status = timelineStatus(event);
  const base = timelinePath(event.slug);
  const tabHref = (target: Tab) => (target === "guide" ? base : `${base}?tab=${target}`);
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "guide", label: t("tabGuide") },
    { id: "rewards", label: t("tabRewards"), count: countRewards(event.tracks) },
    { id: "missions", label: t("tabMissions"), count: event.missions.length },
    { id: "bugs", label: t("tabBugs"), count: bugCount },
  ];
  const format = await getFormatter();
  const day = (iso: string) =>
    format.dateTime(new Date(iso), {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });

  return (
    <TimelineShell current={event.name}>
      <BannerArt
        banner={event.banner}
        alt=""
        sizes="(min-width: 1280px) 1230px, 100vw"
        priority
        className="flex min-h-64 flex-col justify-end rounded-2xl sm:min-h-72"
      >
        <div className="relative z-10 flex flex-col gap-2.5 bg-gradient-to-t from-[#030912]/85 to-transparent p-5 sm:p-7">
          <div className="flex flex-wrap gap-2">
            <StatusBadge
              status={status}
              label={
                status === "live" && left
                  ? t("liveFor", { left })
                  : undefined
              }
            />
            {event.patch && <Tag>{event.patch}</Tag>}
            {event.systems.map((system) => (
              <Tag key={system}>{tSystem(system)}</Tag>
            ))}
            <Tag>{tType(event.type)}</Tag>
          </div>
          <h1 className="text-3xl font-bold leading-tight text-[#E3F1FF] sm:text-4xl">
            {event.name}
          </h1>
          {event.startAt && (
            <p className="font-mono text-sm text-[#CCE7FF]">
              {range} ·{" "}
              {tTimeline("verseYear", {
                year: new Date(event.startAt).getUTCFullYear() + 930,
              })}
            </p>
          )}
        </div>
      </BannerArt>

      {event.removedAt && (
        <p className="rounded-lg border border-[#F5C46B]/30 bg-[#F5C46B]/6 px-3 py-2 text-sm">
          {t("removed")}
        </p>
      )}

      <nav
        aria-label={t("sections")}
        className="flex gap-0.5 overflow-x-auto border-b border-[#9ED0FF]/18"
      >
        {tabs.map((entry) => (
          <Link
            key={entry.id}
            href={tabHref(entry.id)}
            scroll={false}
            aria-current={tab === entry.id ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 font-medium no-underline ${
              tab === entry.id
                ? "border-[#9ED0FF] text-[#E3F1FF]"
                : "border-transparent text-nexus hover:text-[#E3F1FF]"
            }`}
          >
            {entry.label}
            {entry.count !== undefined && entry.count > 0 && (
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                {entry.count}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[999_1_600px] space-y-5">
          {tab === "guide" && (
            <>
              <Presentation event={event} place={refs.place} />
              <Guide event={event} authors={authors.length} />
            </>
          )}
          {tab === "rewards" && (
            <RewardTracks
              slug={event.slug}
              tracks={event.tracks}
              missions={event.missions.map((mission) => ({
                name:
                  (mission.missionId && refs.missions[mission.missionId]) ||
                  mission.name ||
                  "",
                track: mission.track,
                points: mission.points,
              }))}
              items={refs.items}
              initialProgress={progress?.points ?? {}}
              signedIn={!!userId}
            />
          )}
          {tab === "missions" && <Missions event={event} titles={refs.missions} />}
          {tab === "bugs" && (
            <BugsPanel
              slug={event.slug}
              initialBugs={bugs}
              signedIn={!!userId}
              viewerId={userId ? String(userId) : undefined}
              moderator={moderator}
            />
          )}
        </div>

        <aside className="flex flex-[1_1_300px] flex-col gap-4">
          <section
            aria-labelledby="event-dates"
            className="space-y-2.5 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
          >
            <h2 id="event-dates" className="text-[15px] font-semibold">
              {t("dates")}
            </h2>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{t("start")}</span>
              <span className="text-right font-mono">
                {event.startAt ? day(event.startAt) : t("notAnnounced")}
                {event.patch ? ` · ${event.patch}` : ""}
              </span>
            </div>
            <div className="flex justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{t("end")}</span>
              <span className="font-mono">
                {event.endAt ? day(event.endAt) : t("notAnnounced")}
              </span>
            </div>
            {event.endTimeUnknown && (
              <p className="text-xs text-muted-foreground">{t("endTimeUnknown")}</p>
            )}
            <Link
              href={`${base}/modifier`}
              className="inline-flex items-center gap-1.5 pt-1 text-xs"
            >
              <PencilSquareIcon className="size-3.5" />
              {t("editEvent")}
            </Link>
          </section>

          {event.sources.length > 0 && (
            <section
              aria-labelledby="event-sources"
              className="rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
            >
              <h2 id="event-sources" className="mb-1.5 text-[15px] font-semibold">
                {t("sources")}
              </h2>
              <ul>
                {event.sources.map((source) => (
                  <li key={source.url} className="border-t border-[#9ED0FF]/10 first:border-t-0">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2.5 py-2.5 no-underline"
                    >
                      <Tag>{tSource(source.kind)}</Tag>
                      <span className="min-w-0">
                        <span className="block font-medium text-[#E3F1FF]">
                          {source.title}
                          <ArrowTopRightOnSquareIcon className="ml-1 inline size-3.5 align-[-2px] text-muted-foreground" />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {new URL(source.url).hostname.replace(/^www\./, "")}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section
            aria-labelledby="event-authors"
            className="space-y-2.5 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
          >
            <h2 id="event-authors" className="text-[15px] font-semibold">
              {t("authors")}
            </h2>
            {authors.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("noAuthors")}</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {authors.map((author) => (
                  <li
                    key={author.userId}
                    className="rounded-full border border-[#9ED0FF]/25 px-2.5 py-0.5 text-xs"
                  >
                    {author.name}
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`${base}/guide?section=new`}
              className="flex h-8 items-center justify-center rounded-lg bg-[#2C7BE5] px-3 text-[13px] font-semibold text-white no-underline hover:bg-[#2569C4]"
            >
              {t("contribute")}
            </Link>
            <p className="text-xs text-muted-foreground">{t("contributeHint")}</p>
          </section>

          {Object.keys(refs.related).length > 0 && (
            <section
              aria-labelledby="event-related"
              className="space-y-2 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
            >
              <h2 id="event-related" className="text-[15px] font-semibold">
                {t("related")}
              </h2>
              <ul className="space-y-1.5">
                {Object.entries(refs.related).map(([relatedSlug, related]) => (
                  <li key={relatedSlug} className="flex items-center justify-between gap-2">
                    <Link href={timelinePath(relatedSlug)} className="font-medium">
                      {related.name}
                    </Link>
                    <StatusBadge status={related.status} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {moderator && (
            <RemoveEventButton slug={event.slug} removed={!!event.removedAt} />
          )}
        </aside>
      </div>
    </TimelineShell>
  );
}
