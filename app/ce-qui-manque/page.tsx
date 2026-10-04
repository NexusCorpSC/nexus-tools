import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Eye } from "lucide-react";
import { PointsChip } from "@/components/points-chip";
import {
  MISSING_KINDS,
  isMissingKind,
  listMissing,
  type MissingKind,
} from "@/lib/missing";

export const metadata: Metadata = {
  title: "Ce qui manque",
  description:
    "Les fiches les plus visitées auxquelles il manque une image, un plan, une section ou un cours à jour.",
};

export const dynamic = "force-dynamic";

/** L'adresse d'un onglet : des mots plutôt que des clés de code. */
const SLUGS: Record<MissingKind, string> = {
  placeImage: "images",
  placePlan: "plans",
  itemSection: "objets",
  stalePrices: "cours",
  missionPlace: "missions",
};

function kindFromSlug(value: string | undefined): MissingKind {
  const found = MISSING_KINDS.find((kind) => SLUGS[kind] === value);
  return found && isMissingKind(found) ? found : "placeImage";
}

/**
 * Les trous du catalogue que les joueurs croisent le plus : chacun mène là où
 * le combler, avec ce que ça rapporte.
 */
export default async function MissingPage({
  searchParams,
}: {
  searchParams: Promise<{ quoi?: string }>;
}) {
  const { quoi } = await searchParams;
  const kind = kindFromSlug(quoi);
  const [t, format, { entries, total }] = await Promise.all([
    getTranslations("Missing"),
    getFormatter(),
    listMissing(kind),
  ]);

  return (
    <div className="m-2 mx-auto max-w-5xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="max-w-prose text-sm text-[#CCE7FF]/80">{t("intro")}</p>
      </div>

      <nav
        aria-label={t("tabsLabel")}
        className="flex flex-wrap gap-1 border-b border-[#9ED0FF]/18"
      >
        {MISSING_KINDS.map((entry) => (
          <Link
            key={entry}
            href={`/ce-qui-manque?quoi=${SLUGS[entry]}`}
            scroll={false}
            aria-current={entry === kind ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              entry === kind
                ? "border-primary text-nexus"
                : "border-transparent text-muted-foreground hover:text-nexus"
            }`}
          >
            {t(`kinds.${entry}.tab`)}
          </Link>
        ))}
      </nav>

      <div className="space-y-1">
        <p className="text-sm text-[#CCE7FF]/80">{t(`kinds.${kind}.hint`)}</p>
        <p className="text-xs text-muted-foreground">
          {t("total", { count: total })}
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-[#9ED0FF]/14 p-6 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : (
        <ol className="divide-y divide-[#9ED0FF]/10 overflow-hidden rounded-xl border border-[#9ED0FF]/14">
          {entries.map((entry) => (
            <li
              key={entry.slug}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={entry.href}
                  className="block truncate font-medium hover:underline"
                >
                  {entry.name}
                </Link>
                {entry.detail && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {kind === "stalePrices"
                      ? t("pricesFrom", {
                          when: format.relativeTime(new Date(entry.detail)),
                        })
                      : entry.detail}
                  </span>
                )}
                {kind === "stalePrices" && !entry.detail && (
                  <span className="block text-xs text-muted-foreground">
                    {t("pricesNever")}
                  </span>
                )}
              </div>
              {entry.views > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Eye className="size-3.5" />
                  {t("views", { count: entry.views })}
                </span>
              )}
              <Link
                href={entry.fillHref}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#9ED0FF]/25 px-3 py-1.5 text-sm hover:bg-white/5"
              >
                {t(`kinds.${kind}.cta`)}
                <PointsChip points={entry.points} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
