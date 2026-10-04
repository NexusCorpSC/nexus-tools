"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { Contribution, ContributionChange } from "@/types/contributions";

/** Le nom lisible d'un champ, « vehicle.speedMax » compris. */
export function useFieldLabel() {
  const t = useTranslations("Contributions.fields");
  return (field: string) => {
    if (field === "*") return t("whole");
    const [head, ...rest] = field.split(".");
    const label = t.has(head) ? t(head) : head;
    return rest.length > 0 ? `${label} · ${rest.join(".")}` : label;
  };
}

/** Champ / Avant / Proposé : ce que la relecture compare. */
export function ChangeTable({
  changes,
  beforeLabel,
  afterLabel,
}: {
  changes: ContributionChange[];
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const t = useTranslations("Contributions.Admin");
  const label = useFieldLabel();

  return (
    <div className="overflow-x-auto rounded-lg border border-[#9ED0FF]/12">
      <table className="w-full min-w-[480px] text-left text-xs">
        <thead className="bg-[#08243A] text-[#9ED0FF]/70">
          <tr>
            <th className="w-40 px-3 py-1.5 font-medium">{t("diffField")}</th>
            <th className="px-3 py-1.5 font-medium">
              {beforeLabel ?? t("diffBefore")}
            </th>
            <th className="px-3 py-1.5 font-medium">
              {afterLabel ?? t("diffAfter")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#9ED0FF]/8">
          {changes.map((change) => (
            <tr key={change.field} className="align-top">
              <td className="px-3 py-1.5 text-[#9ED0FF]/80">
                {label(change.field)}
              </td>
              <td className="whitespace-pre-line break-words px-3 py-1.5 text-red-200/80">
                {change.before ?? <span className="text-[#9ED0FF]/40">—</span>}
              </td>
              <td className="whitespace-pre-line break-words px-3 py-1.5 text-emerald-200">
                {change.after ?? <span className="text-[#9ED0FF]/40">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ce qu'une contribution propose, quelle qu'en soit la nature : images, plan, champs. */
export function ContributionBody({
  contribution,
  media = [],
}: {
  contribution: Contribution;
  media?: { id: string; url: string; caption?: string }[];
}) {
  const t = useTranslations("Contributions.Admin");

  return (
    <div className="space-y-2">
      {media.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {media.map((image) => (
            <a
              key={image.id}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              title={image.caption}
              className="relative block h-14 w-24 overflow-hidden rounded-md border border-[#9ED0FF]/20"
            >
              <Image
                src={image.url}
                alt={image.caption ?? ""}
                fill
                sizes="96px"
                className="object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {contribution.preview && (
        <a
          href={contribution.preview.url}
          target="_blank"
          rel="noreferrer"
          className="relative block h-40 w-64 overflow-hidden rounded-md border border-[#9ED0FF]/20 bg-black/30"
        >
          <Image
            src={contribution.preview.url}
            alt=""
            fill
            sizes="256px"
            className="object-contain"
          />
        </a>
      )}
      {contribution.changes && contribution.changes.length > 0 && (
        <ChangeTable changes={contribution.changes} />
      )}
      {contribution.source && (
        <p className="break-words text-xs text-[#9ED0FF]/70">
          {t("source")}{" "}
          {/^https?:\/\//.test(contribution.source) ? (
            <a
              href={contribution.source}
              target="_blank"
              rel="noreferrer nofollow"
              className="text-[#CCE7FF] underline"
            >
              {contribution.source}
            </a>
          ) : (
            <span className="text-[#CCE7FF]">{contribution.source}</span>
          )}
        </p>
      )}
    </div>
  );
}
