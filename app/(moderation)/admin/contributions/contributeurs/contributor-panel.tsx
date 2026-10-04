"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LEVELS } from "@/types/contributions";
import {
  MAX_ADJUST_POINTS,
  MAX_ADJUST_REASON_LENGTH,
  MAX_SUSPENSION_DAYS,
} from "@/types/gamification";
import { updateContributorAction } from "./actions";

const SELECT = "h-9 rounded-md border border-input bg-transparent px-2 text-sm";

/**
 * Ce qu'on règle sur un contributeur. Le niveau et les points ne s'affichent
 * qu'à un admin ; avertir et suspendre, à tout modérateur.
 */
export function ContributorPanel({
  id,
  canAdmin,
  trustLevel,
  suspended,
}: {
  id: string;
  canAdmin: boolean;
  trustLevel?: number;
  suspended: boolean;
}) {
  const t = useTranslations("Contributions.People");
  const tLevels = useTranslations("Contributions.levels");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [level, setLevel] = useState(trustLevel ? String(trustLevel) : "");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState("7");
  const [error, setError] = useState<string | null>(null);

  function run(input: Record<string, unknown>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await updateContributorAction(id, input);
      if (!result.ok) {
        setError(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("done"));
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5 border-t border-[#9ED0FF]/15 pt-4">
      {canAdmin ? (
        <>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
              {t("trust")}
            </h3>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={t("trust")}
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className={SELECT}
              >
                <option value="">{t("trustAuto")}</option>
                {LEVELS.map((entry) => (
                  <option key={entry.level} value={entry.level}>
                    N{entry.level} · {tLevels(entry.key)}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  run({ action: "trust", level: level ? Number(level) : null })
                }
              >
                {t("trustSave")}
              </Button>
            </div>
            <p className="text-xs text-[#F2F7FC]/60">{t("trustHint")}</p>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
              {t("adjust")}
            </h3>
            <div className="grid gap-2 sm:grid-cols-[13rem_minmax(0,1fr)_auto]">
              <Input
                type="number"
                aria-label={t("adjustPoints")}
                placeholder={t("adjustPoints")}
                min={-MAX_ADJUST_POINTS}
                max={MAX_ADJUST_POINTS}
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
              <Input
                aria-label={t("adjustReason")}
                placeholder={t("adjustReason")}
                maxLength={MAX_ADJUST_REASON_LENGTH}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                disabled={pending || !points || !reason.trim()}
                onClick={() =>
                  run(
                    { action: "adjust", points: Number(points), reason },
                    () => {
                      setPoints("");
                      setReason("");
                    },
                  )
                }
              >
                {t("adjustSave")}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs text-[#F2F7FC]/60">{t("adminOnly")}</p>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
          {t("sanction")}
        </h3>
        <Input
          aria-label={t("note")}
          placeholder={t("note")}
          maxLength={MAX_ADJUST_REASON_LENGTH}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run({ action: "warn", note }, () => setNote(""))}
          >
            {t("warn")}
          </Button>
          <Input
            type="number"
            aria-label={t("suspendDays")}
            title={t("suspendDays")}
            min={1}
            max={MAX_SUSPENSION_DAYS}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="h-9 w-20"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !days}
            onClick={() =>
              run({ action: "suspend", days: Number(days), note }, () =>
                setNote(""),
              )
            }
          >
            {t("suspend")}
          </Button>
          {suspended && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run({ action: "lift" })}
            >
              {t("lift")}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
