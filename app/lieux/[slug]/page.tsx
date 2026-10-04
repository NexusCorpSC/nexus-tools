import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { MapIcon } from "@heroicons/react/24/outline";
import { ImageCover } from "@/components/image-cover";
import { Button } from "@/components/ui/button";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { countMyPendingMedia, listPlaceMedia } from "@/lib/contributions";
import { hasPermission } from "@/lib/permissions";
import { getPlaceDetails, getPlacePlans } from "@/lib/places";
import { placeTrail } from "@/lib/place-icons";
import { KeyFigure } from "@/app/items/[slug]/sections";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { PlaceAdminMenu } from "./components";
import { PlaceContributeMenu } from "./contribute-menu";
import { OpenContributionsBanner } from "@/app/contributions/open-banner";
import { POINTS } from "@/types/contributions";
import { PlaceGallery } from "./gallery";
import { PlanViewer } from "./plan-viewer";
import { ContestedBanner, ReportMenu } from "@/components/report-menu";
import { FicheCredits } from "@/components/fiche-credits";
import { getContested } from "@/lib/reports";
import { getItemSummaries } from "@/lib/items";
import { listMissionsAt } from "@/lib/missions";
import { recordView } from "@/lib/page-views";
import { ConfirmBlock } from "@/components/confirm-block";
import {
  PlaceBreadcrumb,
  PlaceEmpty,
  PlaceRow,
  SectionTitle,
  ServiceChips,
} from "./sections";

const TABS = ["apercu", "services", "magasins", "plan"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const place = await getPlaceDetails(slug);

  if (!place) return { title: "Lieu introuvable" };

  const description =
    place.description?.slice(0, 160) ??
    `${place.name} — ${placeTrail(place) || "lieu du 'verse"}`;

  return {
    title: place.name,
    description,
    openGraph: {
      title: `${place.name} — Nexus Tools`,
      description,
      url: `https://tools.services.nexus/lieux/${place.slug}`,
      images: place.imageUrl ? [{ url: place.imageUrl }] : [],
    },
    twitter: { card: "summary_large_image", title: place.name, description },
  };
}

export default async function PlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ onglet?: string; lieu?: string; plan?: string }>;
}) {
  const t = await getTranslations("Places");
  const { slug } = await params;
  const { onglet, lieu, plan } = await searchParams;
  const place = await getPlaceDetails(slug);

  if (!place) {
    return (
      <div className="m-2 mx-auto max-w-5xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
        <h1 className="text-2xl font-bold">{t("notFound")}</h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/lieux">{t("backToPlaces")}</Link>
        </Button>
      </div>
    );
  }

  const canEdit = await hasPermission(PLACES_EDIT_PERMISSION);
  await recordView("place", place.slug);

  // Poser un relevé en fond d'un plan de vol demande une escouade ; cette page
  // n'en demande aucune. On ne lit donc ici que « y a-t-il quelqu'un », et
  // c'est l'API qui dira, à l'ouverture du dialogue, ce que ce quelqu'un peut.
  const session = await auth.api.getSession({ headers: await headers() });
  const tab: Tab = TABS.includes(onglet as Tab) ? (onglet as Tab) : "apercu";

  const [media, myPending, soldItems, missions] =
    tab === "apercu"
      ? await Promise.all([
          listPlaceMedia(place.slug),
          session?.user
            ? countMyPendingMedia(place.slug, new ObjectId(session.user.id))
            : 0,
          getItemSummaries(place.soldItems),
          listMissionsAt(place.slug),
        ])
      : [[], 0, [], []];

  /*
    Le plan regardé vit dans l'adresse. On ne descend que dans l'arborescence
    de ce lieu-là : un `?lieu=` tapé à la main ne transforme pas la fiche de
    Lorville en visualiseur de n'importe quel plan du catalogue.
  */
  const visited =
    tab === "plan" && lieu && lieu !== slug ? await getPlacePlans(lieu) : null;
  const plans =
    visited && visited.ancestorSlugs.includes(slug)
      ? visited
      : place.planCount > 0
        ? {
            slug: place.slug,
            name: place.name,
            type: place.type,
            ancestorSlugs: place.ancestorSlugs,
            ancestors: place.ancestors,
            plans: place.plans ?? [],
            targets: place.planTargets,
          }
        : null;
  // Le plan affiché, celui qu'« Améliorer ce plan » ouvre.
  const shownPlan =
    plans?.plans.find((entry) => entry.id === plan) ?? plans?.plans[0];
  // Un plan emprunté se signale chez le lieu qui le tient.
  const reportedPlan = shownPlan
    ? shownPlan.borrowedFrom
      ? { slug: shownPlan.borrowedFrom.slug, id: shownPlan.borrowedFrom.planId }
      : { slug: plans!.slug, id: shownPlan.id }
    : null;
  const [contested, contestedPlans] = await Promise.all([
    getContested("place", place.slug),
    reportedPlan && reportedPlan.slug !== place.slug
      ? getContested("place", reportedPlan.slug)
      : null,
  ]);
  const planContested =
    reportedPlan !== null &&
    (contestedPlans ?? contested).planIds.includes(reportedPlan.id);
  const tr = await getTranslations("Reports");
  const services = place.services ?? [];
  const trail = placeTrail(place);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "apercu", label: t("tabOverview") },
    { key: "services", label: t("tabServices"), count: services.length },
    { key: "magasins", label: t("tabShops"), count: place.shops.length },
    { key: "plan", label: t("tabPlan"), count: place.planCount },
  ];

  return (
    <div className="m-2 mx-auto max-w-5xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb ancestors={place.ancestors} name={place.name} />

      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-block rounded bg-indigo-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">
              {t(`types.${place.type}`)}
            </span>
            {trail && <span className="text-xs text-nexus">{trail}</span>}
          </div>
          <h1 className="text-3xl font-bold">{place.name}</h1>
          {place.shopCategory && (
            <p className="text-sm text-nexus">{place.shopCategory}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <PlaceAdminMenu slug={place.slug} />
          ) : (
            <PlaceContributeMenu slug={place.slug} />
          )}
          <ReportMenu
            type="place"
            id={place.slug}
            name={place.name}
            fixHref={canEdit ? undefined : `/lieux/${place.slug}/contribuer`}
          />
        </div>
      </div>

      {contested.contested && <ContestedBanner message={tr("contested")} />}

      <OpenContributionsBanner type="place" slug={place.slug} />

      {place.imageUrl && (
        <div className="relative flex min-h-24 w-full items-center justify-center overflow-hidden rounded-xl border border-[#9ED0FF]/15">
          <ImageCover imageUrl={place.imageUrl} name={place.name} priority />
        </div>
      )}

      <div className="flex flex-wrap overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/35">
        <KeyFigure label={t("factType")} value={t(`types.${place.type}`)} />
        {place.systemName && (
          <KeyFigure label={t("factSystem")} value={place.systemName} />
        )}
        {place.bodyName && (
          <KeyFigure label={t("factBody")} value={place.bodyName} />
        )}
        <KeyFigure
          label={t("factContained")}
          value={String(place.childCount)}
        />
        <KeyFigure label={t("factShops")} value={String(place.shopCount)} />
        <KeyFigure label={t("factPlans")} value={String(place.planCount)} />
      </div>

      {/*
        Des liens plutôt qu'un état local : un onglet se partage, revient avec
        le bouton Précédent, et la page reste rendue côté serveur.
      */}
      <div className="flex flex-wrap gap-1 border-b border-[#9ED0FF]/18">
        {tabs.map((entry) => (
          <Link
            key={entry.key}
            href={`/lieux/${place.slug}?onglet=${entry.key}`}
            scroll={false}
            aria-current={entry.key === tab ? "page" : undefined}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
              entry.key === tab
                ? "border-b-2 border-primary text-nexus"
                : "border-b-2 border-transparent text-muted-foreground hover:text-nexus"
            }`}
          >
            {entry.label}
            {!!entry.count && (
              <span className="rounded-full bg-[#9ED0FF]/16 px-1.5 py-px text-[11px] font-semibold">
                {entry.count}
              </span>
            )}
          </Link>
        ))}
      </div>

      {tab === "apercu" && (
        <div className="space-y-6">
          <div>
            <SectionTitle
              aside={
                media.length > 0
                  ? t("imagesCount", { count: media.length })
                  : undefined
              }
            >
              {t("imagesTitle")}
            </SectionTitle>
            <PlaceGallery
              slug={place.slug}
              placeName={place.name}
              media={media}
              signedIn={Boolean(session?.user)}
              defaultCredit={session?.user?.name}
              myPending={myPending}
              firstBonus={media.length === 0 && !place.imageUrl}
            />
          </div>

          <div>
            <SectionTitle>{t("descriptionTitle")}</SectionTitle>
            {place.description ? (
              <p className="prose prose-invert whitespace-pre-line leading-relaxed">
                {place.description}
              </p>
            ) : (
              <PlaceEmpty>{t("noDescription")}</PlaceEmpty>
            )}
          </div>

          {place.tip && (
            <div>
              <SectionTitle>{t("tipTitle")}</SectionTitle>
              <p className="whitespace-pre-line rounded-xl border border-[#F5C46B]/30 bg-[#F5C46B]/6 p-4 text-sm leading-relaxed">
                {place.tip}
              </p>
            </div>
          )}

          {soldItems.length > 0 && (
            <div>
              <SectionTitle aside={t("soldCount", { count: soldItems.length })}>
                {t("soldTitle")}
              </SectionTitle>
              <ul className="flex flex-wrap gap-1.5">
                {soldItems.map((item) => (
                  <li key={item.slug}>
                    <Link
                      href={`/items/${item.slug}`}
                      className="inline-block rounded-full border border-[#9ED0FF]/20 bg-white/5 px-2.5 py-1 text-xs hover:bg-white/10"
                    >
                      {item.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {services.length > 0 && (
            <div>
              <SectionTitle>{t("servicesTitle")}</SectionTitle>
              <ServiceChips services={services.slice(0, 8)} />
            </div>
          )}

          {missions.length > 0 && (
            <div>
              <SectionTitle>{t("missionsTitle")}</SectionTitle>
              <ul className="space-y-1 text-sm">
                {missions.map((mission) => (
                  <li key={mission.id}>
                    <Link
                      href={`/missions/${mission.id}`}
                      className="text-primary hover:underline"
                    >
                      {mission.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <SectionTitle
              aside={t("containedCount", { count: place.children.length })}
            >
              {t("containedTitle")}
            </SectionTitle>
            {place.children.length > 0 ? (
              <div className="space-y-1.5">
                {place.children.map((child) => (
                  <PlaceRow key={child.slug} place={child} />
                ))}
                <p className="pt-1 text-xs text-muted-foreground">
                  {t("containedHint")}
                </p>
              </div>
            ) : (
              <PlaceEmpty>{t("noContained")}</PlaceEmpty>
            )}
            {!canEdit && (
              <Link
                href={`/lieux/${place.slug}/contribuer/lieu`}
                className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                {t("missingPlace")}
                <PointsChip points={POINTS.placeCreate} />
              </Link>
            )}
          </div>

          <FicheCredits type="place" slug={place.slug} />
        </div>
      )}

      {tab === "services" && (
        <div>
          <SectionTitle>{t("servicesTitle")}</SectionTitle>
          {services.length > 0 ? (
            <ServiceChips services={services} />
          ) : (
            <PlaceEmpty>{t("noServices")}</PlaceEmpty>
          )}
          {services.length > 0 && (
            <ConfirmBlock
              subject="services"
              slug={place.slug}
              fixHref={
                canEdit
                  ? `/admin/lieux/${place.slug}/edit`
                  : `/lieux/${place.slug}/contribuer`
              }
              className="mt-4 max-w-xl"
            />
          )}
        </div>
      )}

      {tab === "magasins" && (
        <div>
          <SectionTitle aside={t("shopsCount", { count: place.shops.length })}>
            {t("shopsTitle")}
          </SectionTitle>
          {place.shops.length > 0 ? (
            <div className="space-y-1.5">
              {place.shops.map((shop) => (
                <PlaceRow key={shop.slug} place={shop} />
              ))}
              <p className="pt-1 text-xs text-muted-foreground">
                {t("shopsHint")}
              </p>
            </div>
          ) : (
            <PlaceEmpty>{t("noShops")}</PlaceEmpty>
          )}
        </div>
      )}

      {tab === "plan" && (
        <div>
          <SectionTitle>{t("planTitle")}</SectionTitle>
          {plans && plans.plans.length > 0 ? (
            <div className="space-y-3">
              {planContested && (
                <ContestedBanner message={tr("contestedPlan")} />
              )}
              <PlanViewer
                data={plans}
                rootSlug={place.slug}
                activePlanId={plan}
                canBrief={Boolean(session)}
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!canEdit && (
                  <PlanContributeLinks
                    slug={plans.slug}
                    improvePlanId={
                      shownPlan?.borrowedFrom ? undefined : shownPlan?.id
                    }
                  />
                )}
                {reportedPlan && shownPlan && (
                  <ReportMenu
                    type="plan"
                    id={`${reportedPlan.slug}:${reportedPlan.id}`}
                    name={`${plans.name} · ${shownPlan.name}`}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#9ED0FF]/25 bg-[#092F49]/35 px-6 py-12 text-center">
              <MapIcon className="size-8 text-muted-foreground" />
              <p className="text-base font-semibold">
                {t("noPlan", { name: place.name })}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("noPlanHint")}
              </p>
              {canEdit ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/lieux/${place.slug}/plans`}>
                    {t("suggestPlan")}
                  </Link>
                </Button>
              ) : (
                <PlanContributeLinks slug={place.slug} />
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#9ED0FF]/15 pt-4">
        <Link
          href="/lieux"
          className="inline-flex h-9 items-center rounded-md border border-[#9ED0FF]/30 px-4 text-sm font-medium text-nexus hover:bg-white/5"
        >
          {t("backToPlaces")}
        </Link>
        <p className="text-xs text-muted-foreground">{t("reportHint")}</p>
      </div>
    </div>
  );
}

function PointsChip({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300/55 bg-amber-300/15 px-1.5 font-mono text-[10px] font-bold leading-4 text-amber-200">
      +{points}
    </span>
  );
}

/**
 * Proposer un plan : le dessiner, ou en envoyer l'image. Un plan proposé
 * s'ajoute à ceux de la fiche, il ne remplace jamais un plan publié.
 */
async function PlanContributeLinks({
  slug,
  improvePlanId,
}: {
  slug: string;
  /** Le plan regardé, quand il appartient bien à ce lieu. */
  improvePlanId?: string;
}) {
  const t = await getTranslations("Contributions.Place");

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button asChild size="sm">
        <Link href={`/lieux/${slug}/contribuer/dessin`}>
          {t("planDrawn")}
          <PointsChip points={POINTS.planDrawn} />
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link href={`/lieux/${slug}/contribuer/plan`}>
          {t("planImage")}
          <PointsChip points={POINTS.planImage} />
        </Link>
      </Button>
      {improvePlanId && (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/lieux/${slug}/contribuer/plan?plan=${improvePlanId}`}>
            {t("improvePlan")}
          </Link>
        </Button>
      )}
    </div>
  );
}
