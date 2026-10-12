import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { PlaceLore } from "@/lib/lore";
import { SectionTitle } from "@/app/items/[slug]/sections";
import { LoreThumbnail, lorePath, SensorRatings } from "./components";

/**
 * Le lore d'un lieu, sur sa fiche : sa description de la starmap et
 * l'article de la Galactapedia qui en parle. Textes de RSI, en anglais.
 */
export async function PlaceLoreSection({ lore }: { lore: PlaceLore }) {
  const t = await getTranslations("Lore");
  const { starmap, article } = lore;
  return (
    <div>
      <SectionTitle aside={t("englishNote")}>
        {t("placeLoreTitle")}
      </SectionTitle>
      <div className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#071E30]/50 p-4">
        {starmap && (
          <div className="space-y-2">
            <p className="text-xs text-nexus-primary/80">
              {[
                starmap.designation,
                starmap.subType,
                starmap.affiliations.join("/"),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {starmap.description && (
              <p lang="en" className="text-sm leading-relaxed">
                {starmap.description}
              </p>
            )}
            <SensorRatings sensor={starmap.sensor} />
          </div>
        )}
        {article && (
          <Link
            href={lorePath(article.id)}
            className="group flex gap-3 rounded-lg border border-[#9ED0FF]/10 bg-[#0B2A42]/50 p-3 hover:border-[#9ED0FF]/30"
          >
            <LoreThumbnail
              src={article.thumbnailUrl}
              className="size-14 shrink-0 rounded-md object-cover"
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold group-hover:text-blue-200">
                {article.title}
              </p>
              <p
                lang="en"
                className="line-clamp-2 text-xs text-muted-foreground"
              >
                {article.excerpt}
              </p>
              <p className="mt-1 text-xs text-nexus-primary">
                {t("readArticle")}
              </p>
            </div>
          </Link>
        )}
        {starmap && (
          <Link
            href={`/lore/systemes/${encodeURIComponent(starmap.code.split(".")[0])}`}
            className="inline-block text-xs text-nexus-primary hover:underline"
          >
            {t("seeSystem")}
          </Link>
        )}
      </div>
    </div>
  );
}
