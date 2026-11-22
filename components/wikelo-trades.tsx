import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { WikeloTradeEntryView, WikeloTradeView } from "@/types/wikelo";

/**
 * Les échanges de Wikelo sur une fiche objet ou blueprint : ce qu'il faut lui
 * apporter, ce qu'il donne. Titres et noms restent ceux du jeu, en anglais.
 */

type Translate = Awaited<ReturnType<typeof getTranslations<"Wikelo">>>;

function amount(t: Translate, entry: WikeloTradeEntryView): string {
  if (entry.scu !== undefined) return t("scu", { count: entry.scu });
  return t("units", { count: entry.quantity ?? 1 });
}

function EntryName({
  entry,
  highlightSlug,
}: {
  entry: WikeloTradeEntryView;
  highlightSlug?: string;
}) {
  const current =
    highlightSlug !== undefined && entry.itemSlug === highlightSlug;
  if (!entry.itemSlug || current) {
    return (
      <span className={cn(current && "font-semibold text-nexus-primary")}>
        {entry.name}
      </span>
    );
  }
  return (
    <Link
      href={`/items/${entry.itemSlug}`}
      className="text-nexus-primary underline-offset-2 hover:underline"
    >
      {entry.name}
    </Link>
  );
}

function EntryList({
  t,
  entries,
  highlightSlug,
}: {
  t: Translate;
  entries: WikeloTradeEntryView[];
  highlightSlug?: string;
}) {
  return (
    <ul className="space-y-0.5 text-sm">
      {entries.map((entry, index) => (
        <li key={`${entry.name}-${index}`} className="flex gap-2">
          <span className="w-16 shrink-0 text-right tabular-nums text-nexus/70">
            {amount(t, entry)}
          </span>
          <EntryName entry={entry} highlightSlug={highlightSlug} />
        </li>
      ))}
    </ul>
  );
}

function Rewards({
  t,
  trade,
  highlightSlug,
}: {
  t: Translate;
  trade: WikeloTradeView;
  highlightSlug?: string;
}) {
  if (trade.rewardChoices.length <= 1) {
    return (
      <EntryList
        t={t}
        entries={trade.rewardChoices[0] ?? []}
        highlightSlug={highlightSlug}
      />
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-nexus/70">
        {t("randomReward", { count: trade.rewardChoices.length })}
      </p>
      <ul className="space-y-0.5 text-sm">
        {trade.rewardChoices.map((group, index) => (
          <li key={index}>
            {group.map((entry, entryIndex) => (
              <span key={`${entry.name}-${entryIndex}`}>
                {entryIndex > 0 && " + "}
                {(entry.quantity ?? 1) > 1 && `${entry.quantity} × `}
                <EntryName entry={entry} highlightSlug={highlightSlug} />
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Un échange en entier : ce qu'il faut apporter, ce qu'il donne. */
export async function WikeloTradeCard({
  trade,
  highlightSlug,
  highlightBlueprintSlug,
}: {
  trade: WikeloTradeView;
  /** La fiche objet affichée, mise en avant dans les listes. */
  highlightSlug?: string;
  /** La fiche blueprint affichée. */
  highlightBlueprintSlug?: string;
}) {
  const t = await getTranslations("Wikelo");
  return (
    <div className="space-y-3 rounded-lg border border-[#9ED0FF]/15 p-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="font-semibold text-nexus-primary">{trade.title}</p>
        {trade.onceOnly && (
          <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-xs text-amber-200">
            {t("onceOnly")}
          </span>
        )}
        {trade.reputation !== undefined && (
          <span className="text-xs text-nexus/70">
            {t("reputation", { count: trade.reputation })}
          </span>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-nexus/70">
            {t("bring")}
          </p>
          <EntryList
            t={t}
            entries={trade.requirements}
            highlightSlug={highlightSlug}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-nexus/70">
            {t("receive")}
          </p>
          <Rewards t={t} trade={trade} highlightSlug={highlightSlug} />
          {trade.blueprints.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-sm">
              {trade.blueprints.map((blueprint) => (
                <li key={blueprint.gameId}>
                  <span className="text-nexus/70">{t("blueprint")} </span>
                  {blueprint.slug &&
                  blueprint.slug !== highlightBlueprintSlug ? (
                    <Link
                      href={`/crafting/blueprints/${blueprint.slug}`}
                      className="text-nexus-primary underline-offset-2 hover:underline"
                    >
                      {blueprint.name}
                    </Link>
                  ) : (
                    <span
                      className={cn(
                        blueprint.slug === highlightBlueprintSlug &&
                          "font-semibold text-nexus-primary",
                      )}
                    >
                      {blueprint.name}
                    </span>
                  )}
                  {blueprint.chance !== undefined &&
                    ` (${t("chance", { percent: Math.round(blueprint.chance * 100) })})`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {trade.missionId && (
        <Link
          href={`/missions/${trade.missionId}`}
          className="inline-block text-xs text-nexus/70 hover:text-nexus-primary"
        >
          {t("missionLink")}
        </Link>
      )}
    </div>
  );
}

/** Un échange qui demande l'objet affiché, sur une ligne. */
async function WantedRow({
  trade,
  itemSlug,
}: {
  trade: WikeloTradeView;
  itemSlug: string;
}) {
  const t = await getTranslations("Wikelo");
  const needed = trade.requirements.find(
    (entry) => entry.itemSlug === itemSlug,
  );
  const rewards =
    trade.rewardChoices.length === 1 ? trade.rewardChoices[0] : [];
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 text-sm">
      {needed && (
        <span className="tabular-nums text-nexus/70">{amount(t, needed)}</span>
      )}
      <span className="text-nexus/70">→</span>
      {rewards.length > 0 ? (
        rewards.map((entry, index) => (
          <span key={`${entry.name}-${index}`}>
            {index > 0 && " + "}
            <EntryName entry={entry} />
          </span>
        ))
      ) : (
        <span>{t("randomReward", { count: trade.rewardChoices.length })}</span>
      )}
      <span className="text-xs text-nexus/60">({trade.title})</span>
    </li>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-nexus-primary">
        {children}
      </h2>
      <span className="h-px flex-1 bg-[#9ED0FF]/15" />
    </div>
  );
}

/** La section d'une fiche objet : les échanges qui la donnent ou la demandent. */
export async function ItemWikeloSection({
  itemSlug,
  rewards,
  wanted,
}: {
  itemSlug: string;
  rewards: WikeloTradeView[];
  wanted: WikeloTradeView[];
}) {
  if (rewards.length === 0 && wanted.length === 0) return null;
  const t = await getTranslations("Wikelo");
  const version = (rewards[0] ?? wanted[0]).version;
  return (
    <>
      {rewards.length > 0 && (
        <div>
          <SectionHeading>{t("itemTitle")}</SectionHeading>
          <p className="mb-2 text-xs text-nexus/70">{t("itemHint")}</p>
          <div className="space-y-2">
            {rewards.map((trade) => (
              <WikeloTradeCard
                key={trade.id}
                trade={trade}
                highlightSlug={itemSlug}
              />
            ))}
          </div>
        </div>
      )}
      {wanted.length > 0 && (
        <div>
          <SectionHeading>
            {t("wantedTitle", { count: wanted.length })}
          </SectionHeading>
          <p className="mb-2 text-xs text-nexus/70">{t("wantedHint")}</p>
          <ul className="space-y-1">
            {wanted.map((trade) => (
              <WantedRow key={trade.id} trade={trade} itemSlug={itemSlug} />
            ))}
          </ul>
        </div>
      )}
      <p className="-mt-2 text-xs text-nexus/50">{t("source", { version })}</p>
    </>
  );
}

/** La section d'une fiche blueprint : les échanges qui donnent le blueprint. */
export async function BlueprintWikeloSection({
  blueprintSlug,
  trades,
}: {
  blueprintSlug: string;
  trades: WikeloTradeView[];
}) {
  if (trades.length === 0) return null;
  const t = await getTranslations("Wikelo");
  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide">
        {t("blueprintTitle")}
      </h2>
      <p className="mb-2 text-xs text-nexus/70">{t("blueprintHint")}</p>
      <div className="space-y-2">
        {trades.map((trade) => (
          <WikeloTradeCard
            key={trade.id}
            trade={trade}
            highlightBlueprintSlug={blueprintSlug}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-nexus/50">
        {t("source", { version: trades[0].version })}
      </p>
    </div>
  );
}
