import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MapIcon } from "@heroicons/react/24/outline";
import { ImageCover } from "@/components/image-cover";
import { Button } from "@/components/ui/button";
import { hasPermission } from "@/lib/permissions";
import { getPlaceDetails } from "@/lib/places";
import { placeTrail } from "@/lib/place-icons";
import { KeyFigure } from "@/app/items/[slug]/sections";
import { PLACES_EDIT_PERMISSION } from "@/types/places";
import { PlaceAdminMenu } from "./components";
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
  searchParams: Promise<{ onglet?: string }>;
}) {
  const t = await getTranslations("Places");
  const { slug } = await params;
  const { onglet } = await searchParams;
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
  const tab: Tab = TABS.includes(onglet as Tab) ? (onglet as Tab) : "apercu";
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
        {canEdit && <PlaceAdminMenu slug={place.slug} />}
      </div>

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
            <SectionTitle>{t("descriptionTitle")}</SectionTitle>
            {place.description ? (
              <p className="prose prose-invert whitespace-pre-line leading-relaxed">
                {place.description}
              </p>
            ) : (
              <PlaceEmpty>{t("noDescription")}</PlaceEmpty>
            )}
          </div>

          {services.length > 0 && (
            <div>
              <SectionTitle>{t("servicesTitle")}</SectionTitle>
              <ServiceChips services={services.slice(0, 8)} />
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
          </div>
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
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#9ED0FF]/25 bg-[#092F49]/35 px-6 py-12 text-center">
            <MapIcon className="size-8 text-muted-foreground" />
            <p className="text-base font-semibold">
              {t("noPlan", { name: place.name })}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("noPlanHint")}
            </p>
            {canEdit && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/lieux/${place.slug}/plans`}>
                  {t("suggestPlan")}
                </Link>
              </Button>
            )}
          </div>
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
