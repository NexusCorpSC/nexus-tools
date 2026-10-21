"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  MAX_TIMELINE_BUG_TEXT_LENGTH,
  MAX_TIMELINE_BUG_TITLE_LENGTH,
  TIMELINE_BUG_STATUSES,
  type TimelineBug,
  type TimelineBugStatus,
} from "@/types/timeline-events";

const STATUS_STYLES: Record<TimelineBugStatus, string> = {
  open: "border-[#FFA08C]/45 bg-[#FF8C78]/8 text-[#FFB4A8]",
  workaround: "border-[#F5C46B]/45 bg-[#FCD34D]/10 text-[#F7D68F]",
  fixed: "border-[#9ED0FF]/28 text-[#A9CDEE]",
};

async function send(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<{ ok: boolean; data?: unknown; detail?: string }> {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => undefined);
  return {
    ok: response.ok,
    data,
    detail: (data as { detail?: string; error?: string } | undefined)?.detail,
  };
}

function BugForm({
  slug,
  onCreated,
  onCancel,
}: {
  slug: string;
  onCreated: (bug: TimelineBug) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("Timeline.Bugs");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [workaround, setWorkaround] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-3 rounded-lg border border-[#9ED0FF]/20 bg-[#030912]/25 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await send(`/api/timeline-events/${slug}/bugs`, "POST", {
            title,
            description,
            workaround,
            status: workaround.trim() ? "workaround" : "open",
          });
          if (!result.ok) {
            setError(result.detail ?? t("error"));
            return;
          }
          onCreated(result.data as TimelineBug);
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="bug-title">{t("titleLabel")}</Label>
        <Input
          id="bug-title"
          required
          maxLength={MAX_TIMELINE_BUG_TITLE_LENGTH}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bug-description">{t("descriptionLabel")}</Label>
        <Textarea
          id="bug-description"
          rows={3}
          maxLength={MAX_TIMELINE_BUG_TEXT_LENGTH}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bug-workaround">{t("workaroundLabel")}</Label>
        <Textarea
          id="bug-workaround"
          rows={2}
          maxLength={MAX_TIMELINE_BUG_TEXT_LENGTH}
          value={workaround}
          onChange={(event) => setWorkaround(event.target.value)}
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !title.trim()}>
          {t("submit")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/**
 * Les bugs connus de l'évènement : chaque joueur en signale, dit qu'il l'a
 * aussi, et l'auteur ou un modérateur tient son statut à jour.
 */
export function BugsPanel({
  slug,
  initialBugs,
  signedIn,
  viewerId,
  moderator,
}: {
  slug: string;
  initialBugs: TimelineBug[];
  signedIn: boolean;
  viewerId?: string;
  moderator: boolean;
}) {
  const t = useTranslations("Timeline.Bugs");
  const pathname = usePathname();
  const [bugs, setBugs] = useState(initialBugs);
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  const replace = (bug: TimelineBug) =>
    setBugs((current) =>
      current
        .map((entry) => (entry.id === bug.id ? bug : entry))
        .sort((a, b) => b.affected - a.affected),
    );

  return (
    <section
      aria-labelledby="event-bugs"
      className="space-y-1 rounded-xl border border-[#9ED0FF]/15 bg-[#0E2C45] p-5"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <h2 id="event-bugs" className="text-lg font-semibold">
          {t("title")}
        </h2>
        <span className="text-xs text-muted-foreground">{t("hint")}</span>
        {signedIn ? (
          !adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="ml-auto h-8 rounded-lg bg-[#2C7BE5] px-3 text-[13px] font-semibold text-white hover:bg-[#2569C4]"
            >
              {t("report")}
            </button>
          )
        ) : (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(`${pathname}?tab=bugs`)}`}
            className="ml-auto text-sm"
          >
            {t("signIn")}
          </Link>
        )}
      </div>

      {adding && (
        <BugForm
          slug={slug}
          onCancel={() => setAdding(false)}
          onCreated={(bug) => {
            setBugs((current) => [...current, bug]);
            setAdding(false);
          }}
        />
      )}

      {bugs.length === 0 && !adding && (
        <p className="py-4 text-sm text-muted-foreground">{t("empty")}</p>
      )}

      <ul>
        {bugs.map((bug) => {
          const canEdit = moderator || bug.userId === viewerId;
          return (
            <li
              key={bug.id}
              className="grid gap-x-4 gap-y-2 border-t border-[#9ED0FF]/12 py-4 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-[#E3F1FF]">{bug.title}</h3>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[bug.status]}`}
                  >
                    {bug.status === "fixed" && bug.fixedIn
                      ? t("fixedIn", { patch: bug.fixedIn })
                      : t(`statuses.${bug.status}`)}
                  </span>
                </div>
                {bug.description && (
                  <p className="whitespace-pre-line text-sm text-nexus">
                    {bug.description}
                  </p>
                )}
                {bug.workaround && (
                  <p className="whitespace-pre-line rounded-lg border border-[#7FF0D0]/25 bg-[#7FF0D0]/6 px-3 py-2 text-[13px]">
                    <b className="font-semibold text-[#7FF0D0]">{t("workaround")}</b>{" "}
                    · {bug.workaround}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {t("reportedBy", { name: bug.userName ?? "—" })}
                </p>
                {canEdit && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <label htmlFor={`bug-status-${bug.id}`} className="sr-only">
                      {t("statusLabel")}
                    </label>
                    <select
                      id={`bug-status-${bug.id}`}
                      value={bug.status}
                      disabled={pending}
                      onChange={(event) =>
                        startTransition(async () => {
                          const result = await send(
                            `/api/timeline-events/${slug}/bugs/${bug.id}`,
                            "PATCH",
                            { status: event.target.value },
                          );
                          if (result.ok) replace(result.data as TimelineBug);
                        })
                      }
                      className="h-8 rounded-md border border-[#9ED0FF]/25 bg-[#071E30] px-2 text-xs"
                    >
                      {TIMELINE_BUG_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {t(`statuses.${status}`)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        if (!window.confirm(t("deleteConfirm"))) return;
                        startTransition(async () => {
                          const result = await send(
                            `/api/timeline-events/${slug}/bugs/${bug.id}`,
                            "DELETE",
                          );
                          if (result.ok) {
                            setBugs((current) =>
                              current.filter((entry) => entry.id !== bug.id),
                            );
                          }
                        });
                      }}
                      className="h-8 rounded-md px-2 text-xs text-[#FFB4A8] hover:underline"
                    >
                      {t("delete")}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 sm:flex-col sm:items-end">
                <button
                  type="button"
                  disabled={!signedIn || pending}
                  aria-pressed={bug.mine}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await send(
                        `/api/timeline-events/${slug}/bugs/${bug.id}`,
                        "PATCH",
                        { affected: !bug.mine },
                      );
                      if (result.ok) replace(result.data as TimelineBug);
                    })
                  }
                  className={`h-8 whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold disabled:opacity-60 ${
                    bug.mine
                      ? "border-[#7FF0D0]/50 bg-[#7FF0D0]/10 text-[#7FF0D0]"
                      : "border-[#9ED0FF]/28 bg-[#0B3A5A]/60 text-[#CCE7FF]"
                  }`}
                >
                  {t("metoo", { count: bug.affected })}
                </button>
                {bug.issueCouncilUrl && (
                  <a
                    href={bug.issueCouncilUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs"
                  >
                    Issue Council
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
