import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "bson";
import { getFormatter, getTranslations } from "next-intl/server";
import { MagnifyingGlassIcon } from "@heroicons/react/20/solid";
import { auth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { RememberListUrl } from "@/components/remember-list-url";
import { listBoard, listMyOffers, listMyRequests } from "@/lib/player-requests";
import {
  quantityLabel,
  REQUEST_KIND_FILTERS,
  type RequestKindFilter,
} from "@/types/requests";
import { RequestCard } from "@/app/demandes/request-card";
import { Chip, FIELD, MUTED, PAGE_PANEL, REQ_BUTTON, StatusPill } from "@/app/demandes/ui";

export const metadata: Metadata = {
  title: "Tableau des demandes",
  description:
    "Ce que vos amis, vos organisations et la communauté cherchent dans Star Citizen. Répondez « J'en ai » et négociez en privé.",
  robots: { index: false, follow: false },
};

type Search = {
  view?: string;
  q?: string;
  aud?: string;
  kind?: string;
  system?: string;
  supply?: string;
};

const AUDIENCES = ["friends", "orgs", "public"] as const;
const SYSTEMS = ["Stanton", "Pyro", "Nyx"] as const;

/** L'adresse du tableau avec un filtre changé, les autres gardés. */
function withParam(search: Search, key: keyof Search, value: string | undefined) {
  const params = new URLSearchParams();
  for (const [name, current] of Object.entries({ ...search, [key]: value })) {
    if (current && name !== "view") params.set(name, current);
  }
  const query = params.toString();
  return query ? `/demandes?${query}` : "/demandes";
}

export default async function RequestsBoardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");
  const userId = new ObjectId(session.user.id);
  const search = await searchParams;
  const view = search.view === "mine" || search.view === "offers" ? search.view : "board";

  const t = await getTranslations("Requests");
  const format = await getFormatter();

  const [mine, myOffers] = await Promise.all([
    listMyRequests(userId),
    listMyOffers(userId),
  ]);
  const openMine = mine.filter((request) => request.status === "OPEN").length;
  const activeOffers = myOffers.filter(
    (offer) => offer.status === "NEW" || offer.status === "KEPT",
  ).length;

  const tabs = [
    { id: "board", href: "/demandes", label: t("tabs.board"), count: 0 },
    { id: "mine", href: "/demandes?view=mine", label: t("tabs.mine"), count: openMine },
    { id: "offers", href: "/demandes?view=offers", label: t("tabs.offers"), count: activeOffers },
  ];

  return (
    <div className={PAGE_PANEL}>
      <RememberListUrl />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-bold text-[#E3F1FF]">{t("title")}</h1>
        <Link href="/demandes/new" className={cn(REQ_BUTTON, "ml-auto")}>
          {t("publish")}
        </Link>
        <p className={cn("basis-full text-sm", MUTED)}>{t("subtitle")}</p>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-[#9ED0FF]/15" aria-label={t("tabs.label")}>
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={view === tab.id ? "page" : undefined}
            className={cn(
              "px-3 py-2 text-sm",
              view === tab.id
                ? "text-[#E3F1FF] shadow-[inset_0_-2px_0_#FFB98A]"
                : "text-[#A9CDEE] hover:text-[#E3F1FF]",
            )}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1 font-mono text-[11px] text-[#FFB98A]">{tab.count}</span>
            )}
          </Link>
        ))}
      </nav>

      {view === "board" && <Board userId={userId} search={search} />}

      {view === "mine" &&
        (mine.length === 0 ? (
          <p className={cn("text-sm", MUTED)}>{t("emptyMine")}</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {mine.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
        ))}

      {view === "offers" &&
        (myOffers.length === 0 ? (
          <p className={cn("text-sm", MUTED)}>{t("emptyOffers")}</p>
        ) : (
          <ul className="space-y-2">
            {myOffers.map((offer) => (
              <li key={offer.id}>
                <Link
                  href={`/demandes/${offer.requestId}#offre-${offer.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[#9ED0FF]/20 bg-[#092F49]/50 px-4 py-3 transition-colors hover:border-[#9ED0FF]/50"
                >
                  <span className="min-w-0 font-semibold text-[#E3F1FF]">
                    {offer.request.name}
                  </span>
                  <span className={cn("text-xs", MUTED)}>
                    {t("offers.to", { name: offer.request.userName })}
                  </span>
                  <span className="font-mono text-xs text-[#E3F1FF]">
                    {quantityLabel(offer.quantity, offer.request.unit)}
                    {offer.quality !== undefined && ` · Q ${offer.quality}`}
                    {offer.unitPrice !== undefined &&
                      ` · ${format.number(offer.unitPrice)} aUEC`}
                  </span>
                  <span className="ml-auto">
                    <StatusPill kind="offer" status={offer.status}>
                      {t(`offerStatus.${offer.status}`)}
                    </StatusPill>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

async function Board({ userId, search }: { userId: ObjectId; search: Search }) {
  const t = await getTranslations("Requests");
  const audience = (AUDIENCES as readonly string[]).includes(search.aud ?? "")
    ? (search.aud as (typeof AUDIENCES)[number])
    : undefined;
  const kind = (REQUEST_KIND_FILTERS as readonly string[]).includes(search.kind ?? "")
    ? (search.kind as RequestKindFilter)
    : undefined;
  const system = (SYSTEMS as readonly string[]).includes(search.system ?? "")
    ? search.system
    : undefined;
  const supply = search.supply === "1";
  const { requests, total } = await listBoard(userId, {
    q: search.q,
    audience,
    kind,
    system,
    supply,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <form action="/demandes" className="relative min-w-0 flex-[1_1_220px]">
          {audience && <input type="hidden" name="aud" value={audience} />}
          {kind && <input type="hidden" name="kind" value={kind} />}
          {system && <input type="hidden" name="system" value={system} />}
          {supply && <input type="hidden" name="supply" value="1" />}
          <label htmlFor="requests-q" className="sr-only">
            {t("filters.search")}
          </label>
          <MagnifyingGlassIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-2 left-2.5 size-5 text-[#9ED0FF]/55"
          />
          <input
            id="requests-q"
            name="q"
            type="search"
            defaultValue={search.q ?? ""}
            placeholder={t("filters.search")}
            className={cn(FIELD, "pl-9")}
          />
        </form>
        <Link href={withParam(search, "aud", undefined)}>
          <Chip on={!audience}>{t("filters.all")}</Chip>
        </Link>
        {AUDIENCES.map((entry) => (
          <Link key={entry} href={withParam(search, "aud", audience === entry ? undefined : entry)}>
            <Chip on={audience === entry}>{t(`filters.audience.${entry}`)}</Chip>
          </Link>
        ))}
        {REQUEST_KIND_FILTERS.map((entry) => (
          <Link key={entry} href={withParam(search, "kind", kind === entry ? undefined : entry)}>
            <Chip on={kind === entry}>{t(`filters.kind.${entry}`)}</Chip>
          </Link>
        ))}
        {SYSTEMS.map((entry) => (
          <Link key={entry} href={withParam(search, "system", system === entry ? undefined : entry)}>
            <Chip on={system === entry}>{entry}</Chip>
          </Link>
        ))}
        <Link href={withParam(search, "supply", supply ? undefined : "1")}>
          <Chip on={supply}>{t("filters.supply")}</Chip>
        </Link>
      </div>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#9ED0FF]/25 px-4 py-8 text-center">
          <p className="text-sm text-[#A9CDEE]">{t("emptyBoard")}</p>
          <Link href="/demandes/new" className="mt-3 inline-block text-sm font-medium text-[#FFB98A] hover:underline">
            {t("emptyBoardCta")}
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3">
            {requests.map((request) => (
              <RequestCard key={request.id} request={request} />
            ))}
          </div>
          {total > requests.length && (
            <p className={cn("text-xs", MUTED)}>
              {t("moreResults", { shown: requests.length, total })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
