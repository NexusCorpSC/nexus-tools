import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { RememberListUrl } from "@/components/remember-list-url";
import { browseLore, listLoreCategories, listStarSystems } from "@/lib/lore";
import { ArticleCard, LoreShell, systemPath } from "./components";

export const metadata: Metadata = {
  title: "Lore",
  description:
    "La Galactapedia et la starmap de RSI : l'histoire, les peuples, les sociétés et les systèmes de Star Citizen.",
  openGraph: {
    title: "Lore — Nexus Tools",
    description: "La Galactapedia et la starmap de Star Citizen.",
    url: "https://tools.services.nexus/lore",
  },
};

type Search = { q?: string; category?: string; page?: string };

function href(search: Search, page: number): string {
  const params = new URLSearchParams();
  if (search.q) params.set("q", search.q);
  if (search.category) params.set("category", search.category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/lore?${query}` : "/lore";
}

export default async function LorePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const t = await getTranslations("Lore");
  const search = await searchParams;
  const query = search.q?.trim() || undefined;
  const category = search.category || undefined;
  const browsing = !query && !category;
  const [page, categories, systems] = await Promise.all([
    browseLore({ query, category, page: Number(search.page ?? 1) }),
    listLoreCategories(),
    browsing ? listStarSystems() : Promise.resolve([]),
  ]);
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));

  return (
    <LoreShell>
      <RememberListUrl />
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t("title")}</h1>
        <p className="text-nexus">{t("header")}</p>
        <p className="mt-1 text-xs text-muted-foreground">{t("englishNote")}</p>
      </div>

      <form action="/lore" className="flex flex-wrap gap-2">
        <div className="relative min-w-60 flex-1">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            defaultValue={query}
            placeholder={t("searchPlaceholder")}
            className="h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
        </div>
        <select
          name="category"
          defaultValue={category ?? ""}
          className="h-9 rounded-md border border-input bg-[#071E30] px-3 text-sm"
        >
          <option value="">{t("allCategories")}</option>
          {categories.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name} ({entry.count})
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-md bg-[#2C7BE5] px-4 text-sm font-medium text-white hover:bg-[#2C7BE5]/85"
        >
          {t("searchButton")}
        </button>
      </form>

      <p className="text-sm text-muted-foreground">
        {t("resultsCount", { count: page.total })}
      </p>

      {page.results.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t("noResults")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {page.results.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-center gap-3 text-sm">
          {page.page > 1 && (
            <Link
              href={href(search, page.page - 1)}
              className="rounded-md border border-[#9ED0FF]/20 px-3 py-1 hover:bg-[#0B2A42]"
            >
              {t("previous")}
            </Link>
          )}
          <span className="text-muted-foreground">
            {t("pageOf", { page: page.page, pages })}
          </span>
          {page.page < pages && (
            <Link
              href={href(search, page.page + 1)}
              className="rounded-md border border-[#9ED0FF]/20 px-3 py-1 hover:bg-[#0B2A42]"
            >
              {t("next")}
            </Link>
          )}
        </nav>
      )}

      {browsing && systems.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t("systemsTitle")}</h2>
          <p className="text-sm text-nexus">
            {t("systemsHeader", { count: systems.length })}
          </p>
          <div className="flex flex-wrap gap-2">
            {systems.map((system) => (
              <Link
                key={system.code}
                href={systemPath(system.code)}
                title={[
                  system.affiliations.join("/"),
                  system.status === "P"
                    ? t("statusP")
                    : system.status === "M"
                      ? t("statusM")
                      : t("statusN"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                className={
                  "rounded-lg border px-2.5 py-1 text-sm transition-colors hover:border-[#9ED0FF]/40 hover:bg-[#0B2A42] " +
                  (system.status === "P"
                    ? "border-[#9ED0FF]/20 bg-[#071E30]/60"
                    : "border-dashed border-[#9ED0FF]/15 text-muted-foreground")
                }
              >
                {system.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </LoreShell>
  );
}
