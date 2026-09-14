"use client";

import { useTranslations } from "next-intl";
import { ArrowRightEndOnRectangleIcon } from "@heroicons/react/24/outline";
import { PLACE_SERVICE_ICON } from "@/lib/place-icons";
import type { PlacePlanMarker, PlaceSummary } from "@/types/places";

export type MarkerTone = "service" | "shop" | "place" | "unmapped";

export function markerTone(
  marker: PlacePlanMarker,
  target?: PlaceSummary,
): MarkerTone {
  if (!marker.targetSlug) return "service";
  if (!target || target.planCount === 0) return "unmapped";
  return target.type === "shop" ? "shop" : "place";
}

export function markerName(
  marker: PlacePlanMarker,
  target: PlaceSummary | undefined,
  serviceLabel: (service: string) => string,
): string {
  if (marker.label) return marker.label;
  if (target) return target.name;
  if (marker.service) return serviceLabel(marker.service);
  return "—";
}

/**
 * Un repère est un vrai `<button>`. La maquette lui donnait un
 * `role="button"` et un `tabindex`, mais elle n'avait pas de framework : ici,
 * un bouton apporte Entrée, Espace, l'anneau de focus et l'état désactivé sans
 * qu'on ait à les réécrire — et sans risque de les écrire de travers.
 *
 * La contre-échelle garde la pastille à taille constante quel que soit le
 * zoom : un repère qui grossit avec le plan devient vite une tache.
 */
export function PlanMarker({
  marker,
  target,
  scale,
  selected,
  editable = false,
  onSelect,
  onPointerDown,
}: {
  marker: PlacePlanMarker;
  target?: PlaceSummary;
  scale: number;
  selected: boolean;
  editable?: boolean;
  onSelect: () => void;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const t = useTranslations("Places");
  const tone = markerTone(marker, target);
  const name = markerName(marker, target, (service) =>
    t(`services.${service}`),
  );
  const ServiceIcon = marker.service
    ? PLACE_SERVICE_ICON[marker.service]
    : null;

  const skin: Record<MarkerTone, string> = {
    service: "rounded-full bg-[#9ED0FF] text-[#092F49] border-[#092F49]",
    shop: "rounded-full bg-[#F0C193] text-[#092F49] border-[#092F49]",
    place: "rounded-[10px] bg-[#123F5F] text-[#C2E2FF] border-[#C2E2FF]",
    unmapped: "rounded-[10px] bg-[#123F5F] text-[#8FB6D6] border-[#8FB6D6]",
  };

  return (
    <div
      className="absolute"
      style={{
        left: `${marker.x * 100}%`,
        top: `${marker.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${1 / scale})`,
        transformOrigin: "center",
      }}
    >
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onSelect}
          onPointerDown={(event) => {
            // Sans cela, poser le doigt sur un repère déplacerait aussi le plan.
            event.stopPropagation();
            onPointerDown?.(event);
          }}
          aria-pressed={selected}
          aria-label={`${name} — ${
            marker.targetSlug ? t("markerPlace") : t("markerService")
          }`}
          className={`relative flex size-8 items-center justify-center border-2 shadow-md transition-transform before:absolute before:-inset-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            skin[tone]
          } ${selected ? "ring-2 ring-white/80" : ""} ${
            editable ? "cursor-move" : "cursor-pointer"
          }`}
        >
          {ServiceIcon ? (
            <ServiceIcon className="size-4" />
          ) : (
            <ArrowRightEndOnRectangleIcon className="size-4" />
          )}
        </button>

        {marker.targetSlug && (
          <span
            className={`pointer-events-none max-w-40 truncate rounded-md border bg-[#0B3652]/95 px-1.5 py-0.5 text-[11px] font-semibold ${
              tone === "unmapped"
                ? "border-[#8FB6D6]/60 text-[#8FB6D6]"
                : "border-[#C2E2FF]/60 text-nexus"
            }`}
          >
            {name}
          </span>
        )}
      </div>
    </div>
  );
}
