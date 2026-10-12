import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ListLink } from "@/components/list-link";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { LoreArticleSummary } from "@/lib/lore";
import type { StarmapSensor } from "@/types/lore";

export const lorePath = (id: string) => `/lore/${id}`;
export const systemPath = (code: string) =>
  `/lore/systemes/${encodeURIComponent(code)}`;

/** Le cadre des pages du lore, avec le fil d'Ariane. */
export async function LoreShell({
  current,
  children,
}: {
  /** La page en cours ; absente sur `/lore`. */
  current?: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("Lore");
  return (
    <div className="m-2 mx-auto max-w-7xl space-y-5 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {current ? (
              <BreadcrumbLink asChild>
                <ListLink href="/lore">{t("title")}</ListLink>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>{t("title")}</BreadcrumbPage>
            )}
          </BreadcrumbItem>
          {current && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{current}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>
      {children}
      <p className="border-t border-[#9ED0FF]/10 pt-3 text-xs text-muted-foreground">
        {t("source")}
      </p>
    </div>
  );
}

/** La miniature d'un article, servie par RSI. */
export function LoreThumbnail({
  src,
  className,
}: {
  src?: string;
  className: string;
}) {
  if (!src) return null;
  return (
    // Servie par RSI, un hôte que `next/image` ne connaît pas.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className={className} />
  );
}

export function ArticleCard({ article }: { article: LoreArticleSummary }) {
  return (
    <Link
      href={lorePath(article.id)}
      className="group flex gap-3 rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-3 transition-all hover:border-[#9ED0FF]/30 hover:bg-[#0B2A42]/80"
    >
      <LoreThumbnail
        src={article.thumbnailUrl}
        className="size-16 shrink-0 rounded-lg border border-[#9ED0FF]/15 object-cover"
      />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold transition-colors group-hover:text-blue-200">
          {article.title}
        </p>
        {article.categories.length > 0 && (
          <p className="truncate text-xs text-nexus-primary/80">
            {article.categories.join(" · ")}
          </p>
        )}
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {article.excerpt}
        </p>
      </div>
    </Link>
  );
}

/** Population, économie et danger, de 0 à 10. */
export async function SensorRatings({ sensor }: { sensor?: StarmapSensor }) {
  if (!sensor) return null;
  const t = await getTranslations("Lore");
  const entries = [
    ["population", sensor.population],
    ["economy", sensor.economy],
    ["danger", sensor.danger],
  ] as const;
  return (
    <dl className="flex flex-wrap gap-2 text-xs">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="rounded-lg border border-[#9ED0FF]/15 bg-[#071E30]/60 px-2.5 py-1"
        >
          <dt className="inline text-muted-foreground">{t(key)} </dt>
          <dd className="inline font-semibold">
            {t("rating", { value: Math.round(value * 10) / 10 })}
          </dd>
        </div>
      ))}
    </dl>
  );
}
