"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  LockClosedIcon,
  MapPinIcon,
  UserGroupIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { ImageCover } from "@/components/image-cover";
import { placeTrail } from "@/lib/place-icons";
import type { PrivatePlaceSummary } from "@/types/private-places";

/**
 * La carte d'un lieu privé dans la liste des lieux : celle d'un lieu public,
 * bordée de pointillés lavande, avec qui le voit.
 */
export function PrivatePlaceCard({ place }: { place: PrivatePlaceSummary }) {
  const t = useTranslations("PrivatePlaces");
  const tPlaces = useTranslations("Places");
  const trail = placeTrail(place);
  const inReview =
    place.proposal?.status === "pending" ||
    place.proposal?.status === "changesRequested";

  return (
    <Link
      href={`/lieux/${place.slug}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-dashed border-[#c4b2ff]/50 bg-card transition-all hover:border-[#c4b2ff] hover:shadow-md"
    >
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden bg-muted">
        {place.imageUrl ? (
          <ImageCover
            imageUrl={place.imageUrl}
            name={place.name}
            width={400}
            height={300}
            className="h-full object-cover"
          />
        ) : (
          <MapPinIcon className="size-8 text-[#c4b2ff]/50" />
        )}
        <span className="absolute top-2 left-2 flex flex-wrap gap-1">
          <span className="inline-flex items-center gap-1 rounded-full border border-[#c4b2ff]/45 bg-black/60 px-2 py-0.5 text-xs font-semibold text-[#c4b2ff] backdrop-blur-sm">
            {place.org ? (
              <UserGroupIcon className="size-3" />
            ) : place.sharedWithMe || place.guestCount ? (
              <UserPlusIcon className="size-3" />
            ) : (
              <LockClosedIcon className="size-3" />
            )}
            {place.org
              ? t("cardOrg", { org: place.org.tag ?? place.org.name })
              : place.sharedWithMe
                ? t("cardShared")
                : place.guestCount
                  ? t("cardGuests", { count: place.guestCount })
                  : t("cardOwn")}
          </span>
          {inReview && (
            <span className="rounded-full border border-amber-300/45 bg-black/60 px-2 py-0.5 text-xs font-semibold text-amber-200 backdrop-blur-sm">
              {t("cardInReview")}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 text-left">
        <p className="line-clamp-2 text-sm leading-snug font-semibold">
          {place.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {tPlaces(`types.${place.type}`)}
          {trail ? ` · ${trail}` : ""}
        </p>
        <div className="mt-auto flex items-center justify-end gap-2 border-t border-[#9ED0FF]/15 pt-2">
          <span className="truncate text-xs text-[#c4b2ff]">
            {place.isOwner
              ? t("cardMine")
              : t("cardBy", { name: place.ownerName ?? "?" })}
          </span>
        </div>
      </div>
    </Link>
  );
}
