import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import {
  getTimelineEvent,
  guideField,
  guideSectionId,
} from "@/lib/timeline-events";
import { ContributionNotice } from "@/app/contributions/notice";
import {
  openEditOn,
  requireContributor,
  resumableContribution,
} from "@/app/contributions/session";
import { DIRECT_EDIT_LEVEL, POINTS } from "@/types/contributions";
import type { TimelineGuideSection } from "@/types/timeline-events";
import { TimelineShell, timelinePath } from "../../components";
import { GuideForm } from "./guide-form";

export const metadata: Metadata = {
  title: "Guide d'un évènement",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Écrire ou réécrire une section du guide (`?section=<id>`, ou `new`). Une
 * section est un champ à elle : deux joueurs sur deux sections ne se gênent
 * pas, et une correction déjà ouverte sur cet évènement se complète.
 */
export default async function TimelineGuidePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ section?: string; c?: string }>;
}) {
  const { slug } = await params;
  const { section: sectionId = "new", c } = await searchParams;
  const query = new URLSearchParams({ section: sectionId, ...(c ? { c } : {}) });
  const { userId, standing } = await requireContributor(
    `${timelinePath(slug)}/guide?${query}`,
  );

  const event = await getTimelineEvent(slug);
  if (!event) notFound();

  const resumed =
    (await resumableContribution(c, userId, "timelineEdit", slug)) ??
    (await openEditOn(userId, "timelineEdit", slug));
  const proposal = (resumed?.proposal ?? {}) as Record<string, unknown>;
  // Les sections que la proposition ouverte ajoute, pas encore publiées : leur
  // auteur les reprend ici tant que la relecture n'est pas passée.
  const pending = Object.entries(proposal).flatMap(([field, value]) => {
    const id = guideSectionId(field);
    const section = value as TimelineGuideSection | null;
    return id !== null &&
      section &&
      !event.guide.some((entry) => entry.id === id)
      ? [section]
      : [];
  });

  const existing =
    sectionId === "new"
      ? undefined
      : (event.guide.find((section) => section.id === sectionId) ??
        pending.find((section) => section.id === sectionId));
  if (sectionId !== "new" && !existing) notFound();

  // La section telle que la proposition encore ouverte la réécrit, si elle y est.
  const proposed = existing
    ? (proposal[guideField(existing.id)] as TimelineGuideSection | null | undefined)
    : undefined;
  const initial = proposed ?? existing;
  const published = !!existing && event.guide.some((entry) => entry.id === existing.id);

  const t = await getTranslations("Timeline.Guide");

  return (
    <TimelineShell
      current={event.name}
      currentHref={timelinePath(slug)}
      last={existing ? t("editTitle") : t("newTitle")}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            {existing
              ? t("editHeading", { title: existing.title })
              : t("newHeading", { event: event.name })}
          </h1>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
          <ContributionNotice
            standing={standing}
            direct={standing.level >= DIRECT_EDIT_LEVEL}
            points={POINTS.edit}
            resumed={resumed}
          />
        </div>
        {sectionId === "new" && pending.length > 0 && (
          <div className="space-y-1.5 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4 text-sm">
            <p className="font-semibold text-amber-100">{t("pendingTitle")}</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {pending.map((section) => (
                <li key={section.id}>
                  <Link href={`${timelinePath(slug)}/guide?section=${section.id}`}>
                    {section.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <GuideForm
          slug={slug}
          sectionId={existing?.id}
          published={published}
          initialTitle={initial?.title ?? ""}
          initialBody={initial?.body ?? ""}
          otherTitles={event.guide
            .filter((section) => section.id !== existing?.id)
            .map((section) => section.title)}
          contributionId={resumed?.id}
          source={resumed?.source}
          gameVersion={resumed?.gameVersion}
        />
      </div>
    </TimelineShell>
  );
}
