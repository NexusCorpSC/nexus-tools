"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CheckIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  ShareCandidate,
  ShareEntry,
  ShareKind,
  SharePanelData,
} from "@/types/shares";

/**
 * Le panneau « Partager » d'un évènement ou d'un lieu privé : inviter un
 * joueur (ses amis d'abord), voir qui a accès et le retirer, et pour un
 * évènement gérer le lien de partage. Le même pour tout ce qui se partage.
 */
export function SharePanel({
  kind,
  id,
  open,
  onOpenChange,
  orgEditHref,
}: {
  kind: ShareKind;
  id: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Où changer l'organisation qui voit l'objet, quand elle se choisit ailleurs. */
  orgEditHref?: string;
}) {
  const t = useTranslations("Share");
  const base = `/api/shares/${kind}/${encodeURIComponent(id)}`;
  const [data, setData] = useState<SharePanelData | null>(null);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    fetch(base)
      .then((response) => (response.ok ? response.json() : null))
      .then((panel: SharePanelData | null) => {
        if (!alive) return;
        if (panel) setData(panel);
        else setError(t("errors.unknown"));
      })
      .catch(() => alive && setError(t("errors.unknown")));
    return () => {
      alive = false;
    };
  }, [base, open, t]);

  // Les amis tout de suite, puis la recherche par pseudo à la frappe.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: query, kind, id });
      fetch(`/api/shares/candidates?${params}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { candidates: ShareCandidate[] } | null) =>
          setCandidates(body?.candidates ?? []),
        )
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [id, kind, open, query, data]);

  async function act(path: string, method: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json().catch(() => null)) as
        | (SharePanelData & { error?: string })
        | null;
      if (!response.ok || !payload) {
        const code = payload?.error;
        setError(
          code && t.has(`errors.${code}`)
            ? t(`errors.${code}` as "errors.unknown")
            : t("errors.unknown"),
        );
        return;
      }
      setData(payload);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!data?.link) return;
    try {
      await navigator.clipboard.writeText(data.link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("errors.copy"));
    }
  }

  const people = data?.shares ?? [];
  const invited = people.filter((share) => share.via === "invite");
  const byLink = people.filter((share) => share.via === "link");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {data ? t("title", { name: data.title }) : t("loading")}
          </DialogTitle>
          <DialogDescription>
            {kind === "event" ? t("introEvent") : t("introPlace")}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className={label}>{t("invite")}</h3>
          <label className="flex h-9 items-center gap-2 rounded-md border border-[#7fe3f0]/40 bg-[#092f49] px-2.5 text-sm">
            <MagnifyingGlassIcon className="size-4 text-white/60" />
            <input
              id={`share-search-${kind}-${id}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/45"
              autoComplete="off"
            />
          </label>
          {candidates.length > 0 ? (
            <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/20 bg-[#0e2c45]">
              {candidates.map((candidate) => (
                <li
                  key={candidate.userId}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm"
                >
                  <Avatar src={candidate.avatar} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate font-semibold">
                      {candidate.name}
                    </b>
                    {candidate.isFriend ? (
                      <span className="text-xs text-white/55">
                        {t("friend")}
                      </span>
                    ) : null}
                  </span>
                  {candidate.hasAccess ? (
                    <span className="flex items-center gap-1 text-xs text-[#7ff0d0]">
                      <CheckIcon className="size-3.5" />
                      {t("hasAccess")}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      className="h-7 border-[#7fe3f0]/45 bg-[#7fe3f0]/10 text-[#7fe3f0] hover:bg-[#7fe3f0]/20"
                      onClick={() =>
                        void act(base, "POST", { userId: candidate.userId })
                      }
                    >
                      {t("inviteButton")}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="text-xs text-white/55">{t("noMatch")}</p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h3 className={label}>{t("haveAccess")}</h3>
          <ul className="divide-y divide-[#9ED0FF]/10 rounded-lg border border-[#9ED0FF]/15">
            {data?.org ? (
              <li className="flex items-center gap-2.5 bg-[#c4b2ff]/5 px-3 py-2 text-sm">
                <span className="grid size-7 place-items-center rounded-full border border-[#c4b2ff]/40 text-[#c4b2ff]">
                  <UserGroupIcon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate font-semibold">
                    {t("orgMembers", { org: data.org.name })}
                  </b>
                  <span className="text-xs text-white/55">
                    {t("memberCount", { count: data.org.memberCount })}
                  </span>
                </span>
                {orgEditHref ? (
                  <Link
                    href={orgEditHref}
                    className="text-xs text-[#c4b2ff] underline-offset-2 hover:underline"
                  >
                    {t("changeOrg")}
                  </Link>
                ) : null}
              </li>
            ) : orgEditHref ? (
              <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="text-white/60">{t("noOrg")}</span>
                <Link
                  href={orgEditHref}
                  className="text-xs text-[#c4b2ff] underline-offset-2 hover:underline"
                >
                  {t("pickOrg")}
                </Link>
              </li>
            ) : null}
            {[...invited, ...byLink].map((share) => (
              <Guest
                key={share.userId}
                share={share}
                disabled={busy}
                onRemove={() =>
                  void act(
                    `${base}?userId=${encodeURIComponent(share.userId)}`,
                    "DELETE",
                  )
                }
              />
            ))}
            {!data?.org && !orgEditHref && people.length === 0 ? (
              <li className="px-3 py-2.5 text-sm text-white/60">
                {t("nobody")}
              </li>
            ) : null}
          </ul>
        </section>

        {data?.allowLink ? (
          <section className="space-y-2">
            <h3 className={label}>{t("link")}</h3>
            {data.link ? (
              <>
                <div className="flex min-w-0 gap-2">
                  <input
                    id={`share-link-${kind}-${id}`}
                    readOnly
                    value={data.link.url}
                    onFocus={(event) => event.currentTarget.select()}
                    className="h-9 min-w-0 flex-1 rounded-md border border-[#7fe3f0]/40 bg-[#092f49] px-2.5 font-mono text-xs text-[#7fe3f0]"
                  />
                  <Button
                    variant="outline"
                    className="border-[#7fe3f0]/45 bg-[#7fe3f0]/10 text-[#7fe3f0] hover:bg-[#7fe3f0]/20"
                    onClick={() => void copy()}
                  >
                    <LinkIcon className="size-4" />
                    {copied ? t("copied") : t("copy")}
                  </Button>
                </div>
                <p className="text-xs text-white/60">{t("linkHint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void act(`${base}/link`, "POST")}
                  >
                    {t("newLink")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    className="border-red-300/40 text-red-200 hover:bg-red-500/15"
                    onClick={() => void act(`${base}/link`, "DELETE")}
                  >
                    {t("disableLink")}
                  </Button>
                </div>
                <p className="text-xs text-white/50">{t("disableHint")}</p>
              </>
            ) : (
              <>
                <p className="text-xs text-white/60">{t("noLink")}</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  className="border-[#7fe3f0]/45 bg-[#7fe3f0]/10 text-[#7fe3f0] hover:bg-[#7fe3f0]/20"
                  onClick={() => void act(`${base}/link`, "POST")}
                >
                  <LinkIcon className="size-4" />
                  {t("createLink")}
                </Button>
              </>
            )}
          </section>
        ) : null}

        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

const label =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55";

function Avatar({ src }: { src: string | null }) {
  return (
    <Image
      alt=""
      src={src ?? "/avatar_empty.png"}
      width={28}
      height={28}
      className="size-7 shrink-0 rounded-full border border-[#9ED0FF]/25"
    />
  );
}

function Guest({
  share,
  disabled,
  onRemove,
}: {
  share: ShareEntry;
  disabled: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations("Share");
  return (
    <li className="flex items-center gap-2.5 px-3 py-2 text-sm">
      <Avatar src={share.avatar} />
      <span className="min-w-0 flex-1">
        <b className="block truncate font-semibold">{share.name}</b>
        <span className="text-xs text-white/55">
          {share.via === "link"
            ? t("cameByLink", { date: new Date(share.createdAt) })
            : share.invitedByName
              ? t("invitedBy", { name: share.invitedByName })
              : null}
        </span>
      </span>
      <span
        className={cn(
          "whitespace-nowrap text-xs",
          share.via === "link"
            ? "text-[#7fe3f0]"
            : share.seen
              ? "text-[#7ff0d0]"
              : "text-white/60",
        )}
      >
        {share.via === "link" ? t("byLink") : share.seen ? t("seen") : t("unseen")}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={t("remove", { name: share.name })}
        className="rounded p-1 text-white/55 hover:bg-white/10 hover:text-white"
      >
        <XMarkIcon className="size-4" />
      </button>
    </li>
  );
}
