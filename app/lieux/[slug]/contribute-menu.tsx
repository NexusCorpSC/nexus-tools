"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  MapIcon,
  PencilIcon,
  PencilSquareIcon,
  PlusIcon,
  PhotoIcon,
} from "@heroicons/react/24/outline";
import { POINTS } from "@/types/contributions";

/**
 * Ce qu'un joueur peut apporter à une fiche de lieu, avec ce que ça rapporte.
 * Un visiteur passe par la connexion et revient ici.
 */
export function PlaceContributeMenu({ slug }: { slug: string }) {
  const t = useTranslations("Contributions.Place");
  const [open, setOpen] = useState(false);

  const entries = [
    {
      href: `/lieux/${slug}/contribuer`,
      label: t("edit"),
      points: POINTS.edit,
      icon: PencilIcon,
    },
    {
      href: `/lieux/${slug}/contribuer/lieu`,
      label: t("addChild"),
      points: POINTS.placeCreate,
      icon: PlusIcon,
    },
    {
      href: `/lieux/${slug}/contribuer/plan`,
      label: t("planImage"),
      points: POINTS.planImage,
      icon: PhotoIcon,
    },
    {
      href: `/lieux/${slug}/contribuer/dessin`,
      label: t("planDrawn"),
      points: POINTS.planDrawn,
      icon: MapIcon,
    },
  ];

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#9ED0FF]/30 px-3 text-sm font-medium text-nexus transition-colors hover:bg-white/10"
      >
        <PencilSquareIcon className="size-4" />
        {t("menu")}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-[#9ED0FF]/20 bg-nexus-bg py-1 shadow-md">
            {entries.map(({ href, label, points, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                <span className="font-mono text-[11px] font-bold text-amber-200">
                  +{points}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
