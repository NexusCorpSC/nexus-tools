"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PointsChip } from "@/components/points-chip";
import { cn } from "@/lib/utils";
import { useNow } from "@/app/orgs/[orgId]/events/shared";
import { confirmAction } from "@/app/contributions/actions";
import {
  CONFIRM_TARGETS,
  MAX_CONFIRM_COMMENT_LENGTH,
  POINTS,
  STALE_DATA_DAYS,
  type ConfirmState,
} from "@/types/contributions";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * « Toujours exact » ou « plus exact » : ce qui vieillit avec les patchs se
 * confirme en un clic. Le second demande ce qui a changé ; `fixHref` mène au
 * formulaire qui le corrige, quand la donnée se corrige par contribution.
 */
export function ConfirmPanel({
  slug,
  state,
  signedIn,
  fixHref,
  className,
}: {
  slug: string;
  state: ConfirmState;
  signedIn: boolean;
  fixHref?: string;
  className?: string;
}) {
  const t = useTranslations("Contributions.Confirm");
  const tErrors = useTranslations("Contributions.errors");
  const format = useFormatter();
  const router = useRouter();
  // `null` au rendu serveur, pour que la durée ne diffère pas à l'hydratation.
  const now = useNow();
  const [outdated, setOutdated] = useState(false);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(state.mine === true);
  const [pending, startTransition] = useTransition();
  const { subject } = state;

  const confirmedAt = state.confirmedAt ? Date.parse(state.confirmedAt) : null;
  const stale =
    now !== null &&
    (confirmedAt === null || now - confirmedAt > STALE_DATA_DAYS * DAY_MS);

  function send(accurate: boolean) {
    startTransition(async () => {
      const result = await confirmAction({
        target: { type: CONFIRM_TARGETS[subject], slug },
        subject,
        accurate,
        comment: accurate ? undefined : comment,
      });
      if (!result.ok) {
        toast.error(
          tErrors.has(result.error) ? tErrors(result.error) : t("failed"),
        );
        return;
      }
      const points = result.confirmation.points;
      toast.success(
        accurate
          ? t("thanksAccurate", { points })
          : result.reported
            ? t("thanksReported")
            : t("thanksOutdated", { points }),
      );
      setDone(true);
      setOutdated(false);
      router.refresh();
    });
  }

  return (
    <section
      className={cn(
        "space-y-2.5 rounded-xl border border-[#9ED0FF]/14 bg-[#092F49]/35 p-4",
        className,
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t(`${subject}.title`)}</h3>
        <span
          className={cn(
            "text-xs",
            stale ? "text-[#F7D2AE]" : "text-muted-foreground",
          )}
        >
          {confirmedAt === null
            ? t("never")
            : now === null
              ? t("confirmedOn", { date: new Date(confirmedAt) })
              : t("confirmedAgo", {
                  // `now` date du montage : une confirmation faite depuis
                  // ne doit pas tomber dans le futur.
                  ago: format.relativeTime(Math.min(confirmedAt, now), now),
                })}
        </span>
      </div>

      {state.outdatedVotes > 0 && (
        <p className="text-xs text-[#F7D2AE]">
          {t("outdatedVotes", { count: state.outdatedVotes })}
        </p>
      )}

      {!signedIn ? (
        <p className="text-xs text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline">
            {t("signIn")}
          </Link>
        </p>
      ) : done ? (
        <p className="text-xs text-muted-foreground">{t("alreadyDone")}</p>
      ) : outdated ? (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={comment}
            maxLength={MAX_CONFIRM_COMMENT_LENGTH}
            placeholder={t(`${subject}.commentPlaceholder`)}
            onChange={(event) => setComment(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={pending || !comment.trim()}
              onClick={() => send(false)}
            >
              {t("send")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setOutdated(false)}
            >
              {t("cancel")}
            </Button>
            {fixHref && (
              <Link
                href={fixHref}
                className="text-xs text-primary hover:underline"
              >
                {t(`${subject}.fix`)}
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => send(true)}
          >
            {t("accurate")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setOutdated(true)}
          >
            {t(`${subject}.outdated`)}
          </Button>
          <PointsChip points={POINTS.confirm} />
        </div>
      )}
    </section>
  );
}
