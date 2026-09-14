"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowTopRightOnSquareIcon,
  LinkIcon,
  LinkSlashIcon,
  MapIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { removeBorrowedPlanAction, sharePlanAction } from "@/app/lieux/actions";
import type { PlaceGroup, PlaceGroupMember } from "@/types/places";

/** « source|planId » : une seule valeur pour le `Select`, deux à l'usage. */
function planValue(slug: string, planId: string) {
  return `${slug}|${planId}`;
}

type Outcome = { tone: "ok" | "error"; text: string };

export function PlanGroups({ groups }: { groups: PlaceGroup[] }) {
  const t = useTranslations("Places.Admin");

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("sharedEmpty")}</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <PlanGroupCard key={group.key} group={group} />
      ))}
    </div>
  );
}

function PlanGroupCard({ group }: { group: PlaceGroup }) {
  const t = useTranslations("Places.Admin");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  // Les plans que ce groupe peut se prêter à lui-même. Proposer ceux du reste
  // du catalogue noierait le cas courant — un Farro Data Center emprunte à un
  // autre Farro Data Center, pas à Lorville.
  const sources = useMemo(
    () =>
      group.members.flatMap((member) =>
        member.ownPlans.map((plan) => ({
          value: planValue(member.slug, plan.id),
          label: `${member.name} — ${plan.name}`,
          ownerSlug: member.slug,
        })),
      ),
    [group.members],
  );

  const [source, setSource] = useState(sources[0]?.value ?? "");
  const [selected, setSelected] = useState<string[]>([]);

  const sourceSlug = source.split("|")[0];
  const sourcePlanId = source.split("|")[1];

  // Un lieu ne s'emprunte pas à lui-même, et celui qui emprunte déjà ce plan
  // n'a rien à refaire : ni l'un ni l'autre n'est cochable.
  const linkable = group.members.filter(
    (member) =>
      member.slug !== sourceSlug &&
      !member.borrowed.some(
        (ref) =>
          ref.sourceSlug === sourceSlug && ref.sourcePlanId === sourcePlanId,
      ),
  );

  const toggle = (slug: string) =>
    setSelected((current) =>
      current.includes(slug)
        ? current.filter((entry) => entry !== slug)
        : [...current, slug],
    );

  const share = () =>
    startTransition(async () => {
      setOutcome(null);
      const result = await sharePlanAction(sourceSlug, sourcePlanId, selected);

      if (!result.ok) {
        setOutcome({ tone: "error", text: result.error });
        return;
      }
      setSelected([]);
      setOutcome({
        // Les refus sont nommés : « 7 liés » sans dire lesquels manquent
        // oblige à rouvrir chaque fiche pour le découvrir.
        tone: result.skipped.length > 0 ? "error" : "ok",
        text: [
          t("sharedLinked", { count: result.linked.length }),
          ...result.skipped,
        ].join(" · "),
      });
      router.refresh();
    });

  const unlink = (slug: string, planId: string) =>
    startTransition(async () => {
      setOutcome(null);
      const result = await removeBorrowedPlanAction(slug, planId);
      if (!result.ok) setOutcome({ tone: "error", text: result.error });
      else router.refresh();
    });

  return (
    <section className="space-y-3 rounded-xl border border-[#9ED0FF]/15 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-[#CCE7FF]">{group.key}</h2>
        <span className="text-xs text-muted-foreground">
          {t("sharedMembers", { count: group.members.length })}
        </span>
      </div>

      {sources.length === 0 ? (
        // Un groupe sans plan n'est pas une erreur : c'est juste du travail qui
        // n'a pas encore été fait. On dit où aller le faire.
        <p className="text-sm text-muted-foreground">{t("sharedNoPlanYet")}</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 flex-1 space-y-1.5">
              <label
                htmlFor={`source-${group.key}`}
                className="block text-xs font-medium text-[#9ED0FF]/80"
              >
                {t("sharedSourceLabel")}
              </label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger id={`source-${group.key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              disabled={isPending || selected.length === 0}
              onClick={share}
            >
              <LinkIcon className="size-4" />
              {t("sharedApply", { count: selected.length })}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending || linkable.length === 0}
              onClick={() =>
                setSelected(
                  selected.length === linkable.length
                    ? []
                    : linkable.map((member) => member.slug),
                )
              }
            >
              {t("sharedSelectAll")}
            </Button>
          </div>

          <ul className="divide-y divide-[#9ED0FF]/10 overflow-hidden rounded-lg border border-[#9ED0FF]/15">
            {group.members.map((member) => (
              <MemberRow
                key={member.slug}
                member={member}
                sourceSlug={sourceSlug}
                sourcePlanId={sourcePlanId}
                checked={selected.includes(member.slug)}
                disabled={isPending}
                onToggle={() => toggle(member.slug)}
                onUnlink={unlink}
              />
            ))}
          </ul>
        </div>
      )}

      {outcome && (
        <p
          className={
            outcome.tone === "ok"
              ? "text-sm text-[#9ED0FF]"
              : "text-sm text-amber-400"
          }
        >
          {outcome.text}
        </p>
      )}
    </section>
  );
}

function MemberRow({
  member,
  sourceSlug,
  sourcePlanId,
  checked,
  disabled,
  onToggle,
  onUnlink,
}: {
  member: PlaceGroupMember;
  sourceSlug: string;
  sourcePlanId: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onUnlink: (slug: string, planId: string) => void;
}) {
  const t = useTranslations("Places.Admin");

  const isSource = member.slug === sourceSlug;
  const already = member.borrowed.find(
    (ref) => ref.sourceSlug === sourceSlug && ref.sourcePlanId === sourcePlanId,
  );

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <input
        type="checkbox"
        className="size-4 accent-[#C2E2FF]"
        checked={checked}
        disabled={disabled || isSource || !!already}
        onChange={onToggle}
        aria-label={member.name}
      />

      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-nexus">
          {member.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[member.parentName, member.systemName].filter(Boolean).join(" · ")}
        </span>
      </div>

      <span className="text-xs text-muted-foreground">
        {isSource
          ? t("sharedIsSource")
          : already
            ? t("sharedAlready")
            : member.ownPlans.length > 0
              ? t("sharedOwnPlans", { count: member.ownPlans.length })
              : member.borrowed.length > 0
                ? t("sharedBorrowsElsewhere", { count: member.borrowed.length })
                : t("sharedNoPlan")}
      </span>

      {member.borrowed.map((ref) => (
        <Button
          key={ref.id}
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          onClick={() => onUnlink(member.slug, ref.id)}
        >
          <LinkSlashIcon className="size-4" />
          {t("sharedUnlinkFrom", { name: ref.sourceName ?? ref.sourceSlug })}
        </Button>
      ))}

      <Button asChild size="sm" variant="ghost">
        <Link href={`/admin/lieux/${member.slug}/plans`}>
          <MapIcon className="size-4" />
          <span className="sr-only">{t("sharedOpenPlans")}</span>
        </Link>
      </Button>
      <Button asChild size="sm" variant="ghost">
        <Link href={`/lieux/${member.slug}`} target="_blank" rel="noopener">
          <ArrowTopRightOnSquareIcon className="size-4" />
          <span className="sr-only">{t("sharedOpenPlace")}</span>
        </Link>
      </Button>
    </li>
  );
}
