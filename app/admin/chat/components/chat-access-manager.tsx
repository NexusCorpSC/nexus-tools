"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChatAccessRow } from "@/lib/chat/access";
import { formatUsd } from "@/lib/chat/format";
import type { ChatAccessStatus } from "@/types/chat";
import {
  grantChatAccessAction,
  revokeChatAccessAction,
  searchChatCandidatesAction,
  setChatBudgetAction,
  type ChatAdminResult,
} from "../actions";

type Candidate = {
  id: string;
  name: string;
  email?: string;
  status: ChatAccessStatus;
};

/**
 * Les joueurs et leur accès : ajouter quelqu'un par recherche, traiter les
 * demandes, régler le budget mensuel de ceux qui ont l'accès ou le retirer.
 */
export function ChatAccessManager({
  rows,
  defaultBudgetUsd,
}: {
  rows: ChatAccessRow[];
  defaultBudgetUsd: number;
}) {
  const t = useTranslations("Chat.Admin");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);

  const requested = rows.filter((row) => row.status === "requested");
  const granted = rows.filter((row) => row.status === "granted");
  const revoked = rows.filter((row) => row.status === "revoked");

  const budgetOf = (id: string, fallback: number) =>
    budgets[id] ?? String(fallback);

  function run(action: () => Promise<ChatAdminResult>, done: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(done);
      setCandidates(null);
      router.refresh();
    });
  }

  function search(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      setCandidates(await searchChatCandidatesAction(query));
    });
  }

  const budgetInput = (id: string, fallback: number) => (
    <Input
      inputMode="decimal"
      aria-label={t("budget")}
      value={budgetOf(id, fallback)}
      onChange={(event) =>
        setBudgets((current) => ({ ...current, [id]: event.target.value }))
      }
      className="h-8 w-24"
    />
  );

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
          {t("addTitle")}
        </h2>
        <form onSubmit={search} className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
          />
          <Button type="submit" variant="outline" disabled={pending}>
            {t("search")}
          </Button>
        </form>
        {candidates !== null &&
          (candidates.length === 0 ? (
            <p className="text-sm text-[#F2F7FC]/60">{t("noCandidate")}</p>
          ) : (
            <ul className="divide-y divide-[#9ED0FF]/8">
              {candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="text-sm text-[#F2F7FC]">
                    {candidate.name}
                    {candidate.email && (
                      <span className="ml-2 text-xs text-[#F2F7FC]/50">
                        {candidate.email}
                      </span>
                    )}
                    <span className="ml-2 text-xs text-[#F2F7FC]/60">
                      {t(`status.${candidate.status}`)}
                    </span>
                  </span>
                  {candidate.status !== "granted" && (
                    <span className="flex items-center gap-2">
                      {budgetInput(candidate.id, defaultBudgetUsd)}
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              grantChatAccessAction(
                                candidate.id,
                                budgetOf(candidate.id, defaultBudgetUsd),
                              ),
                            t("grantedToast"),
                          )
                        }
                      >
                        {t("grant")}
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
          {t("requestsTitle", { count: requested.length })}
        </h2>
        {requested.length === 0 ? (
          <p className="text-sm text-[#F2F7FC]/60">{t("noRequest")}</p>
        ) : (
          <ul className="divide-y divide-[#9ED0FF]/8 rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75">
            {requested.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-sm text-[#F2F7FC]">
                  {row.name}
                  {row.requestedAt && (
                    <span className="ml-2 text-xs text-[#F2F7FC]/50">
                      {t("requestedOn", { date: new Date(row.requestedAt) })}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  {budgetInput(row.id, defaultBudgetUsd)}
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          grantChatAccessAction(
                            row.id,
                            budgetOf(row.id, defaultBudgetUsd),
                          ),
                        t("grantedToast"),
                      )
                    }
                  >
                    {t("grant")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => revokeChatAccessAction(row.id),
                        t("declinedToast"),
                      )
                    }
                  >
                    {t("decline")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
          {t("grantedTitle", { count: granted.length })}
        </h2>
        {granted.length === 0 ? (
          <p className="text-sm text-[#F2F7FC]/60">{t("noGranted")}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-[#F2F7FC]/60">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("colName")}</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t("colSpent")}
                  </th>
                  <th className="px-3 py-2 font-semibold">{t("colBudget")}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {granted.map((row) => {
                  const budgetUsd = row.monthlyBudgetMicros / 1_000_000;
                  const over = row.spentMicros >= row.monthlyBudgetMicros;
                  return (
                    <tr key={row.id} className="border-t border-[#9ED0FF]/8">
                      <td className="px-3 py-2 text-[#F2F7FC]">{row.name}</td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${over ? "text-[#F7D2AE]" : "text-[#F2F7FC]"}`}
                      >
                        {formatUsd(row.spentMicros, locale)} /{" "}
                        {formatUsd(row.monthlyBudgetMicros, locale)}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {budgetInput(row.id, budgetUsd)}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              pending ||
                              budgetOf(row.id, budgetUsd) === String(budgetUsd)
                            }
                            onClick={() =>
                              run(
                                () =>
                                  setChatBudgetAction(
                                    row.id,
                                    budgetOf(row.id, budgetUsd),
                                  ),
                                t("budgetToast"),
                              )
                            }
                          >
                            {t("saveBudget")}
                          </Button>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => revokeChatAccessAction(row.id),
                              t("revokedToast"),
                            )
                          }
                        >
                          {t("revoke")}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {revoked.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[#F2F7FC]/70">
            {t("revokedTitle", { count: revoked.length })}
          </h2>
          <ul className="divide-y divide-[#9ED0FF]/8 rounded-xl border border-[#9ED0FF]/14 bg-[#092840]/75">
            {revoked.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <span className="text-sm text-[#F2F7FC]/80">{row.name}</span>
                <span className="flex items-center gap-2">
                  {budgetInput(row.id, defaultBudgetUsd)}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () =>
                          grantChatAccessAction(
                            row.id,
                            budgetOf(row.id, defaultBudgetUsd),
                          ),
                        t("grantedToast"),
                      )
                    }
                  >
                    {t("grant")}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
