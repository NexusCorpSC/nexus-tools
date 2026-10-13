"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import {
  BellIcon,
  CalendarDaysIcon,
  LockClosedIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Invitation, InvitationsResponse } from "@/types/shares";

/**
 * La cloche de la barre du haut : les évènements et les lieux privés qu'un
 * joueur a partagés avec vous. L'ouvrir marque tout comme vu ; « Refuser »
 * retire l'accès.
 */
export function InvitationsBell({
  initialUnseen,
  className,
}: {
  initialUnseen: number;
  className: string;
}) {
  const t = useTranslations("Invitations");
  const tPlaces = useTranslations("Places");
  const format = useFormatter();
  const [unseen, setUnseen] = useState(initialUnseen);
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    const response = await fetch("/api/me/invitations").catch(() => null);
    if (!response?.ok) {
      setFailed(true);
      return;
    }
    const body = (await response.json()) as InvitationsResponse;
    setInvitations(body.invitations);
    if (body.unseen > 0) {
      void fetch("/api/me/invitations", { method: "POST" });
    }
    setUnseen(0);
  }

  async function decline(invitation: Invitation) {
    const response = await fetch(`/api/me/invitations/${invitation.id}`, {
      method: "DELETE",
    }).catch(() => null);
    if (response?.ok) {
      setInvitations(
        (current) =>
          current?.filter((entry) => entry.id !== invitation.id) ?? null,
      );
    }
  }

  function detail(invitation: Invitation): string {
    if (invitation.kind === "event") {
      return [
        invitation.startsAt
          ? format.dateTime(new Date(invitation.startsAt), {
              weekday: "short",
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null,
        invitation.orgName,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    if (invitation.kind === "markerCollection") {
      return t("markerCount", { count: invitation.markerCount ?? 0 });
    }
    return [
      invitation.placeType && tPlaces.has(`types.${invitation.placeType}`)
        ? tPlaces(`types.${invitation.placeType}` as "types.outpost")
        : null,
      invitation.parentName,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  return (
    <Popover onOpenChange={(open) => open && void load()}>
      <PopoverTrigger asChild>
        <button type="button" className={className}>
          <span className="sr-only">
            {unseen > 0 ? t("bellUnseen", { count: unseen }) : t("bell")}
          </span>
          <BellIcon aria-hidden="true" className="size-5.5" />
          {unseen > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#7fe3f0] px-1 text-xs font-bold text-[#062338]">
              {unseen > 9 ? "9+" : unseen}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b border-[#9ED0FF]/15 px-4 py-2.5">
          <span className="text-sm font-semibold">{t("title")}</span>
        </div>
        {failed ? (
          <p className="px-4 py-3 text-sm text-red-300">{t("error")}</p>
        ) : invitations === null ? (
          <p className="px-4 py-3 text-sm text-white/60">{t("loading")}</p>
        ) : invitations.length === 0 ? (
          <p className="px-4 py-3 text-sm text-white/60">{t("empty")}</p>
        ) : (
          <ul className="max-h-[70vh] divide-y divide-[#9ED0FF]/10 overflow-y-auto">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className={cn(
                  "flex gap-3 px-4 py-3 text-sm",
                  !invitation.seen && "bg-[#7fe3f0]/8",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-lg",
                    invitation.kind === "event"
                      ? "bg-[#9ED0FF]/10 text-[#CCE7FF]"
                      : invitation.kind === "markerCollection"
                        ? "bg-[#7ff0d0]/10 text-[#7ff0d0]"
                        : "bg-[#c4b2ff]/10 text-[#c4b2ff]",
                  )}
                >
                  {invitation.kind === "event" ? (
                    <CalendarDaysIcon className="size-4" />
                  ) : invitation.kind === "markerCollection" ? (
                    <MapPinIcon className="size-4" />
                  ) : (
                    <LockClosedIcon className="size-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p>
                    {t.rich(
                      invitation.kind === "event"
                        ? "eventInvite"
                        : invitation.kind === "markerCollection"
                          ? "markerCollectionInvite"
                          : "placeInvite",
                      {
                        name: invitation.invitedByName,
                        title: invitation.title,
                        b: (chunks) => (
                          <b className="font-semibold">{chunks}</b>
                        ),
                      },
                    )}
                  </p>
                  <p className="text-xs text-white/55">{detail(invitation)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Button asChild size="sm" className="h-7">
                      <Link href={invitation.href}>
                        {invitation.kind === "event"
                          ? t("openEvent")
                          : invitation.kind === "markerCollection"
                            ? t("openMarkerCollection")
                            : t("openPlace")}
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => void decline(invitation)}
                    >
                      {t("decline")}
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
