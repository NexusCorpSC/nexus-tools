import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, MapIcon } from "@heroicons/react/24/outline";
import { ImageCover } from "@/components/image-cover";
import { PLACE_SERVICE_ICON, PLACE_TYPE_ICON } from "@/lib/place-icons";
import { SectionTitle } from "@/app/items/[slug]/sections";
import type { PlaceAncestor, PlaceSummary, PlaceService } from "@/types/places";

/**
 * Le fil d'Ariane porte toute la chaîne des lieux qui contiennent celui-ci :
 * c'est là que l'arborescence se voit et se remonte.
 */
export async function PlaceBreadcrumb({
  ancestors,
  name,
}: {
  ancestors: PlaceAncestor[];
  name: string;
}) {
  const t = await getTranslations("Places");

  return (
    <nav
      aria-label="breadcrumb"
      className="flex flex-wrap items-center gap-2 text-sm text-nexus/70"
    >
      <Link href="/" className="hover:text-nexus-primary">
        {t("home")}
      </Link>
      <span aria-hidden>›</span>
      <Link href="/lieux" className="hover:text-nexus-primary">
        {t("title")}
      </Link>
      {ancestors.map((ancestor) => (
        <span key={ancestor.slug} className="flex items-center gap-2">
          <span aria-hidden>›</span>
          <Link
            href={`/lieux/${ancestor.slug}`}
            className="hover:text-nexus-primary"
          >
            {ancestor.name}
          </Link>
        </span>
      ))}
      <span aria-hidden>›</span>
      <span className="text-nexus">{name}</span>
    </nav>
  );
}

/** Une ligne de lieu : la même forme que les objets liés d'une fiche d'objet. */
export async function PlaceRow({ place }: { place: PlaceSummary }) {
  const t = await getTranslations("Places");
  const TypeIcon = PLACE_TYPE_ICON[place.type];

  return (
    <Link
      href={`/lieux/${place.slug}`}
      className="flex items-center gap-3 rounded-lg border border-[#9ED0FF]/15 p-2.5 transition-colors hover:border-primary/40 hover:bg-white/5"
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/5">
        {place.imageUrl ? (
          <ImageCover
            imageUrl={place.imageUrl}
            name={place.name}
            width={96}
            height={96}
            className="h-full object-cover"
          />
        ) : (
          <TypeIcon className="size-5 text-nexus-primary" />
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-nexus">
          {place.name}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {[
            t(`types.${place.type}`),
            place.shopCategory,
            place.childCount > 0
              ? t("containedCount", { count: place.childCount })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>

      <span
        className={`hidden shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold sm:inline-flex ${
          place.planCount > 0
            ? "border-primary/45 text-primary"
            : "border-muted-foreground/35 text-muted-foreground"
        }`}
      >
        <MapIcon className="size-3" />
        {t("plansCount", { count: place.planCount })}
      </span>

      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export async function ServiceChips({ services }: { services: PlaceService[] }) {
  const t = await getTranslations("Places");

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {services.map((service) => {
        const ServiceIcon = PLACE_SERVICE_ICON[service];
        return (
          <div
            key={service}
            className="flex items-center gap-2.5 rounded-lg border border-[#9ED0FF]/15 bg-[#092F49]/35 px-3 py-2.5"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#9ED0FF]/12 text-nexus-primary">
              <ServiceIcon className="size-4" />
            </span>
            <span className="text-[13px] font-semibold text-nexus">
              {t(`services.${service}`)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** L'invite qu'affiche une section que personne n'a encore remplie. */
export async function PlaceEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-[#9ED0FF]/25 bg-[#092F49]/35 px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export { SectionTitle };
