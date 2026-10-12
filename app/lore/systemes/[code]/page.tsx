import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getStarSystem } from "@/lib/lore";
import { SectionTitle } from "@/app/items/[slug]/sections";
import {
  ArticleCard,
  LoreShell,
  lorePath,
  SensorRatings,
  systemPath,
} from "../../components";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const system = await getStarSystem(decodeURIComponent(code));
  if (!system) return { title: "Lore" };
  const description = system.description?.slice(0, 160);
  return {
    title: `${system.name} — Lore`,
    description,
    openGraph: {
      title: `${system.name} — Nexus Tools`,
      description,
      url: `https://tools.services.nexus${systemPath(system.code)}`,
    },
  };
}

export default async function StarSystemPage({ params }: Props) {
  const t = await getTranslations("Lore");
  const { code } = await params;
  const system = await getStarSystem(decodeURIComponent(code));
  if (!system) notFound();

  const status =
    system.status === "P"
      ? t("statusP")
      : system.status === "M"
        ? t("statusM")
        : t("statusN");

  return (
    <LoreShell current={system.name}>
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold">
            {t("systemTitle", { name: system.name })}
          </h1>
          <p className="text-sm text-nexus-primary/80">
            {[system.affiliations.join("/"), status]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <SensorRatings sensor={system.sensor} />
        {system.description && (
          <p lang="en" className="leading-relaxed">
            {system.description}
          </p>
        )}
        {system.placeSlug && (
          <Link
            href={`/lieux/${system.placeSlug}`}
            className="inline-block text-sm text-nexus-primary hover:underline"
          >
            {t("placeLink")}
          </Link>
        )}
      </div>

      {system.article && (
        <section>
          <SectionTitle>{t("galactapedia")}</SectionTitle>
          <ArticleCard article={system.article} />
        </section>
      )}

      {system.jumpPoints && system.jumpPoints.length > 0 && (
        <section>
          <SectionTitle>{t("jumpPointsTitle")}</SectionTitle>
          <ul className="flex flex-wrap gap-2 text-sm">
            {system.jumpPoints.map((jump) => (
              <li key={jump.to}>
                <Link
                  href={systemPath(jump.to)}
                  className="block rounded-lg border border-[#9ED0FF]/20 bg-[#071E30]/60 px-2.5 py-1 hover:bg-[#0B2A42]"
                >
                  {jump.toName ?? jump.to}
                  {jump.size && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {jump.size}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>{t("bodiesTitle")}</SectionTitle>
        {system.bodies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noBodies")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {system.bodies.map((body) => (
              <li
                key={body.code}
                className="space-y-1.5 rounded-xl border border-[#9ED0FF]/10 bg-[#071E30]/60 p-3"
              >
                <div>
                  <p className="font-semibold">
                    {body.name}
                    {body.designation && (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        {body.designation}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-nexus-primary/80">
                    {[
                      body.subType ?? body.type,
                      body.habitable ? t("habitable") : "",
                      body.affiliations.join("/"),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {body.description && (
                  <p
                    lang="en"
                    className="text-sm leading-relaxed text-muted-foreground"
                  >
                    {body.description}
                  </p>
                )}
                {(body.articleId || body.placeSlug) && (
                  <p className="flex gap-3 text-sm">
                    {body.articleId && (
                      <Link
                        href={lorePath(body.articleId)}
                        className="text-nexus-primary hover:underline"
                      >
                        {t("articleLink")}
                      </Link>
                    )}
                    {body.placeSlug && (
                      <Link
                        href={`/lieux/${body.placeSlug}`}
                        className="text-nexus-primary hover:underline"
                      >
                        {t("placeLink")}
                      </Link>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </LoreShell>
  );
}
