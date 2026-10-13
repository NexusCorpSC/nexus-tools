import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  LockClosedIcon,
  MapIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import { ImageCover } from "@/components/image-cover";
import { Button } from "@/components/ui/button";
import { listInventory } from "@/lib/inventory";
import { placeTrail } from "@/lib/place-icons";
import type { PrivatePlace } from "@/types/private-places";
import {
  PlaceBreadcrumb,
  PlacePositionSection,
  SectionTitle,
} from "../[slug]/sections";
import { PrivatePlaceActions } from "./private-place-actions";

/**
 * La fiche d'un lieu privé, à `/lieux/{slug}` comme les autres : un bandeau
 * dit qui le voit et porte les actions de son créateur. Un membre de
 * l'organisation le voit sans pouvoir le changer.
 */
export async function PrivatePlaceView({
  place,
  userId,
}: {
  place: PrivatePlace;
  userId: string;
}) {
  const t = await getTranslations("PrivatePlaces");
  const tPlaces = await getTranslations("Places");
  const lots = await listInventory(userId, { locationId: place.locationId });
  const trail = placeTrail(place);
  const open =
    place.proposal?.status === "pending" ||
    place.proposal?.status === "changesRequested";

  return (
    <div className="m-2 mx-auto max-w-5xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <PlaceBreadcrumb ancestors={place.ancestors} name={place.name} />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-xl border border-[#c4b2ff]/45 bg-[#c4b2ff]/10 px-4 py-3">
        {place.org ? (
          <UserGroupIcon className="size-5 shrink-0 text-[#c4b2ff]" />
        ) : (
          <LockClosedIcon className="size-5 shrink-0 text-[#c4b2ff]" />
        )}
        <p className="min-w-0 flex-1 basis-64 text-sm">
          <b className="text-[#c4b2ff]">{t("badge")}</b>
          {" · "}
          {place.org
            ? t("visibleWithOrg", {
                org: place.org.name,
                count: place.org.memberCount - 1,
              })
            : t("visibleOwn")}
          {!place.isOwner &&
            place.ownerName &&
            ` ${t("createdBy", { name: place.ownerName })}`}
        </p>
        {place.isOwner && <PrivatePlaceActions place={place} />}
      </div>

      {open && (
        <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 px-3 py-2 text-sm text-amber-100">
          {t("inReview")}{" "}
          <Link href="/contributions" className="underline">
            {t("inReviewLink")}
          </Link>
        </p>
      )}
      {place.proposal?.status === "rejected" && place.isOwner && (
        <p className="rounded-lg border border-[#9ED0FF]/20 px-3 py-2 text-sm text-muted-foreground">
          {t("rejected")}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-block rounded bg-indigo-50 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                {tPlaces(`types.${place.type}`)}
              </span>
              {trail && <span className="text-xs text-nexus">{trail}</span>}
            </div>
            <h1 className="text-3xl font-bold">{place.name}</h1>
          </div>
          {place.imageUrl && (
            <div className="overflow-hidden rounded-xl">
              <ImageCover
                imageUrl={place.imageUrl}
                name={place.name}
                width={960}
                height={420}
                className="aspect-[16/7] h-auto w-full object-cover"
              />
            </div>
          )}
          <div>
            <SectionTitle>{tPlaces("descriptionTitle")}</SectionTitle>
            {place.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {place.description}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {tPlaces("noDescription")}
              </p>
            )}
          </div>
        </div>

        <aside className="min-w-0 space-y-4">
          <PlacePositionSection
            slug={place.slug}
            position={place.position}
            editHref={
              place.isOwner ? `/lieux/${place.slug}/modifier` : undefined
            }
          />
          {place.position && place.systemSlug && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/starmap?place=${place.slug}`}>
                <MapIcon className="size-4" />
                {t("openStarMap")}
              </Link>
            </Button>
          )}

          <div className="space-y-2">
            <SectionTitle>
              <span className="text-[#ffc76a]">{t("myItemsHere")}</span>
            </SectionTitle>
            {lots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noItemsHere")}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {lots.map((lot) => (
                  <li
                    key={lot.id}
                    className="flex justify-between gap-3 rounded-lg border border-[#ffc76a]/20 bg-[#ffc76a]/[0.07] px-3 py-1.5 text-sm"
                  >
                    <span className="min-w-0 truncate">{lot.name}</span>
                    <span className="shrink-0 font-mono text-[#ffc76a]">
                      {lot.unit
                        ? `${lot.quantity} ${lot.unit}`
                        : `× ${lot.quantity}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/inventory"
              className="text-xs text-primary hover:underline"
            >
              {t("openInventory")}
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
