import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { MarkdownContent } from "@/components/markdown-content";
import { excerpt, getLoreArticle, rewriteLoreLinks } from "@/lib/lore";
import { LoreShell, LoreThumbnail, lorePath, systemPath } from "../components";
import { SectionTitle } from "@/app/items/[slug]/sections";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await getLoreArticle(id);
  if (!article) return { title: "Lore" };
  const description = excerpt(article.body, 160);
  return {
    title: `${article.title} — Lore`,
    description,
    openGraph: {
      title: `${article.title} — Nexus Tools`,
      description,
      url: `https://tools.services.nexus/lore/${article.wikiId}`,
      images: article.thumbnailUrl ? [{ url: article.thumbnailUrl }] : [],
    },
  };
}

export default async function LoreArticlePage({ params }: Props) {
  const t = await getTranslations("Lore");
  const { id } = await params;
  const article = await getLoreArticle(id);
  if (!article) notFound();

  const body = rewriteLoreLinks(
    article.body,
    article.linked.map((entry) => entry.id),
    lorePath,
  );

  return (
    <LoreShell current={article.title}>
      <div className="flex flex-col gap-5 md:flex-row">
        <LoreThumbnail
          src={article.thumbnailUrl}
          className="w-full rounded-xl border border-[#9ED0FF]/15 object-cover md:w-72"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <h1 className="text-2xl font-bold">{article.title}</h1>
            <p className="text-sm text-nexus-primary/80">
              {[article.type, ...article.categories]
                .filter(
                  (value, index, all) => value && all.indexOf(value) === index,
                )
                .join(" · ")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("englishNote")}
            </p>
          </div>
          {article.removedAt && (
            <p className="rounded-lg border border-[#F5C46B]/30 bg-[#F5C46B]/6 px-3 py-2 text-sm">
              {t("removed")}
            </p>
          )}
          <div lang="en">
            <MarkdownContent content={body} />
          </div>
          <a
            href={article.rsiUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-nexus-primary hover:underline"
          >
            {t("readOnRsi")}
            <ArrowTopRightOnSquareIcon className="size-4" />
          </a>
        </div>
      </div>

      {article.starmap.length > 0 && (
        <section>
          <SectionTitle>{t("starmapTitle")}</SectionTitle>
          <ul className="flex flex-wrap gap-2 text-sm">
            {article.starmap.map((entry) => (
              <li key={entry.code} className="flex gap-1">
                <Link
                  href={systemPath(entry.systemCode)}
                  className="rounded-lg border border-[#9ED0FF]/20 bg-[#071E30]/60 px-2.5 py-1 hover:bg-[#0B2A42]"
                >
                  {entry.name}
                </Link>
                {entry.placeSlug && (
                  <Link
                    href={`/lieux/${entry.placeSlug}`}
                    className="rounded-lg border border-[#9ED0FF]/20 bg-[#071E30]/60 px-2.5 py-1 text-nexus-primary hover:bg-[#0B2A42]"
                  >
                    {t("placeLink")}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {article.linked.length > 0 && (
        <section>
          <SectionTitle>{t("linkedTitle")}</SectionTitle>
          <ul className="flex flex-wrap gap-2 text-sm">
            {article.linked.map((entry) => (
              <li key={entry.id}>
                <Link
                  href={lorePath(entry.id)}
                  className="block rounded-lg border border-[#9ED0FF]/20 bg-[#071E30]/60 px-2.5 py-1 hover:bg-[#0B2A42]"
                >
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {article.tags.length > 0 && (
        <p className="flex flex-wrap gap-1.5">
          {article.tags.map((tag) => (
            <Link
              key={tag}
              href={`/lore?q=${encodeURIComponent(tag)}`}
              className="rounded-full bg-[#9ED0FF]/10 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              #{tag}
            </Link>
          ))}
        </p>
      )}
    </LoreShell>
  );
}
