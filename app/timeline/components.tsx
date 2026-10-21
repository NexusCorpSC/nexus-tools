import Image from "next/image";
import { getFormatter, getTranslations } from "next-intl/server";
import { ListLink } from "@/components/list-link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  timelineEndTime,
  type TimelineBanner,
  type TimelineEventInput,
  type TimelineStatus,
} from "@/types/timeline-events";

export const timelinePath = (slug: string) => `/timeline/${slug}`;

/** Le cadre des pages des évènements officiels, avec le fil d'Ariane. */
export async function TimelineShell({
  current,
  currentHref,
  last,
  children,
}: {
  /** L'évènement en cours de lecture ; absent sur `/timeline`. */
  current?: string;
  /** Son adresse, quand la page est un de ses formulaires. */
  currentHref?: string;
  /** Le formulaire ouvert, après l'évènement. */
  last?: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Timeline");
  return (
    <div className="m-2 mx-auto max-w-7xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-4 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {current || last ? (
              <BreadcrumbLink asChild>
                <ListLink href="/timeline">{t("title")}</ListLink>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{t("title")}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {current && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {currentHref ? (
                  <BreadcrumbLink href={currentHref}>{current}</BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{current}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </>
          )}
          {last && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{last}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      {children}
    </div>
  );
}

const STATUS_STYLES: Record<TimelineStatus, string> = {
  live: "border-[#7FF0D0]/45 bg-[#7FF0D0]/10 text-[#7FF0D0]",
  upcoming: "border-[#F5C46B]/45 bg-[#FCD34D]/10 text-[#F7D68F]",
  announced: "border-[#F5C46B]/45 bg-[#FCD34D]/10 text-[#F7D68F]",
  ended: "border-[#9ED0FF]/28 text-[#A9CDEE]",
};

export async function StatusBadge({
  status,
  label,
}: {
  status: TimelineStatus;
  /** À la place du statut : « En cours · 5 j 14 h ». */
  label?: string;
}) {
  const t = await getTranslations("Timeline.status");
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[status]}`}
    >
      {status === "live" && (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[#7FF0D0]" />
      )}
      {label ?? t(status)}
    </span>
  );
}

export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="whitespace-nowrap rounded-md bg-[#9ED0FF]/12 px-2 py-0.5 font-mono text-xs text-[#CCE7FF]">
      {children}
    </span>
  );
}

/**
 * La bannière, ou à défaut un fond de planète et d'anneau : une page
 * d'évènement sans image reste lisible et ne laisse pas de trou.
 */
export function BannerArt({
  banner,
  alt,
  sizes,
  priority,
  className = "",
  children,
}: {
  banner?: TimelineBanner;
  alt: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden bg-[#06192B] ${className}`}>
      {banner ? (
        <Image
          src={banner.url}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <div aria-hidden="true">
          <span className="absolute -left-20 -top-40 size-[420px] rounded-full bg-[#F7D68F]/15 blur-[70px]" />
          <span className="absolute -bottom-48 right-10 size-[360px] rounded-full bg-[#9ED0FF]/15 blur-[60px]" />
          <span className="absolute -right-10 top-4 size-56 rounded-full bg-[radial-gradient(circle_at_35%_35%,#3c6f96_0%,#173a5a_55%,#081a2b_100%)] shadow-[0_0_60px_rgba(158,208,255,0.25)]" />
          <span className="absolute -right-28 top-24 h-20 w-96 -rotate-[14deg] rounded-[50%] border-2 border-[#CCE7FF]/30" />
        </div>
      )}
      {banner?.credit && (
        <span className="absolute right-2 top-2 z-10 rounded bg-[#030912]/65 px-1.5 py-0.5 font-mono text-[10.5px] text-[#CCE7FF]">
          {banner.credit}
        </span>
      )}
      {children}
    </div>
  );
}

type Dated = Pick<TimelineEventInput, "startAt" | "endAt" | "endTimeUnknown">;

/** « 9 → 20 oct. 2026 », « mai 2026 », ou rien sans date. */
export async function dateRange(
  event: Dated,
  { year = true }: { year?: boolean } = {},
): Promise<string | null> {
  if (!event.startAt) return null;
  const format = await getFormatter();
  const start = new Date(event.startAt);
  const end = event.endAt ? new Date(event.endAt) : null;
  const options = {
    day: "numeric",
    month: "short",
    year: year ? "numeric" : undefined,
    timeZone: "UTC",
  } as const;
  if (!end) return format.dateTime(start, options);
  return format.dateTimeRange(start, end, options);
}

/** Le temps qu'il reste avant la fin, en jours et heures : « 5 j 14 h ». */
export async function remaining(event: Dated): Promise<string | null> {
  const end = timelineEndTime(event);
  if (!Number.isFinite(end)) return null;
  const t = await getTranslations("Timeline");
  const hours = Math.max(0, Math.floor((end - Date.now()) / 3_600_000));
  return t("remaining", { days: Math.floor(hours / 24), hours: hours % 24 });
}
