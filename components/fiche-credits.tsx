import { getTranslations } from "next-intl/server";
import { LevelBadge } from "@/components/level-badge";
import { getFicheCredits } from "@/lib/gamification";

/** Les initiales d'un pseudo, pour la pastille. */
function initials(name: string): string {
  const words = name.split(/[\s_#-]+/).filter(Boolean);
  return (
    words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  ).toUpperCase();
}

const AVATAR_TONES = [
  "bg-[#9ED0FF]",
  "bg-[#F5C46B]",
  "bg-[#8FD3B8]",
  "bg-[#F2B880]",
];

/**
 * « Fiche enrichie par » : qui a contribué à ce lieu ou cet objet, avec son
 * niveau. Rien tant que personne n'y a rien publié.
 */
export async function FicheCredits({
  type,
  slug,
}: {
  type: "place" | "item";
  slug: string;
}) {
  const credits = await getFicheCredits(type, slug);
  if (credits.contributors.length === 0) return null;
  const t = await getTranslations("Contributions.Credits");

  return (
    <section
      aria-label={t("title")}
      className="space-y-3 rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35 p-4"
    >
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t("title")}
      </h2>
      <ul className="space-y-2.5">
        {credits.contributors.map((contributor, index) => (
          <li
            key={contributor.id}
            className="flex items-center gap-2.5 text-sm"
          >
            <span
              aria-hidden
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-[#071A2B] ${AVATAR_TONES[index % AVATAR_TONES.length]}`}
            >
              {initials(contributor.name)}
            </span>
            <span className="min-w-0 flex-1 truncate">{contributor.name}</span>
            <span title={t("level", { level: contributor.level })}>
              <LevelBadge level={contributor.level} />
            </span>
            <span className="text-xs text-muted-foreground">
              {t("count", { count: contributor.count })}
            </span>
          </li>
        ))}
      </ul>
      {credits.others > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("others", { count: credits.others })}
        </p>
      )}
      {credits.updatedAt && (
        <p className="text-xs text-muted-foreground">
          {t("updated", { date: new Date(credits.updatedAt) })}
        </p>
      )}
    </section>
  );
}
