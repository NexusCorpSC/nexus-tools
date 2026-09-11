import { getFormatter, getTranslations } from "next-intl/server";
import Image from "next/image";
import { isNumber, type ItemDetails } from "@/types/items";
import { ItemAdminMenu } from "../components";
import {
  CommonSections,
  EmptySection,
  ItemBreadcrumb,
  KeyFigure,
  KindDataNotice,
  SectionTitle,
  SlotRow,
  StatisticsGrid,
  KIND_ACCENT,
} from "../sections";

const ACCENT = KIND_ACCENT.vehicle;

/** Where the numbered hardpoints sit on the schematic, in document order. */
const HARDPOINT_POSITIONS = [
  { x: 160, y: 66 },
  { x: 128, y: 128 },
  { x: 192, y: 128 },
  { x: 160, y: 160 },
  { x: 128, y: 196 },
  { x: 192, y: 196 },
];

/**
 * A top view of a generic hull with the hardpoints numbered in the order the
 * fiche lists them. It is a schematic, not a plan: the shape says "vehicle",
 * the numbers tie each dot to its row.
 */
function HardpointDiagram({ count, label }: { count: number; label: string }) {
  const points = HARDPOINT_POSITIONS.slice(0, count);

  return (
    <div className="relative w-full shrink-0 overflow-hidden rounded-xl border border-[#9ED0FF]/15 bg-[#092F49]/45 sm:w-80">
      <div
        className="absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(158,208,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(158,208,255,0.08) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <svg viewBox="0 0 320 250" className="relative w-full" fill="none">
        <g
          stroke="rgba(158,208,255,0.45)"
          strokeWidth="1.4"
          strokeLinejoin="round"
        >
          <path
            d="M132 30 L188 30 L206 84 L206 176 L188 222 L132 222 L114 176 L114 84 Z"
            fill="rgba(158,208,255,0.05)"
          />
          <path d="M114 96 L206 96 M114 160 L206 160" />
          <rect
            x="92"
            y="66"
            width="22"
            height="44"
            rx="4"
            fill="rgba(8,38,60,0.9)"
          />
          <rect
            x="206"
            y="66"
            width="22"
            height="44"
            rx="4"
            fill="rgba(8,38,60,0.9)"
          />
          <rect
            x="92"
            y="150"
            width="22"
            height="44"
            rx="4"
            fill="rgba(8,38,60,0.9)"
          />
          <rect
            x="206"
            y="150"
            width="22"
            height="44"
            rx="4"
            fill="rgba(8,38,60,0.9)"
          />
        </g>
        {points.map((point, index) => (
          <g key={index}>
            <circle
              cx={point.x}
              cy={point.y}
              r="9"
              fill="rgba(9,47,73,0.9)"
              stroke={ACCENT}
              strokeWidth="1.6"
            />
            <text
              x={point.x}
              y={point.y + 4}
              textAnchor="middle"
              fontSize="10"
              fontFamily="var(--font-geist-mono), monospace"
              fill={ACCENT}
            >
              {index + 1}
            </text>
          </g>
        ))}
        <text
          x="160"
          y="242"
          textAnchor="middle"
          fontSize="10"
          letterSpacing="1.4"
          fontFamily="var(--font-geist-mono), monospace"
          fill="rgba(158,208,255,0.45)"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

/** The line-art stand-in used until someone uploads a picture of the vehicle. */
function VehicleSilhouette() {
  return (
    <svg
      viewBox="0 0 560 240"
      className="absolute right-4 top-14 hidden w-[520px] opacity-90 sm:block"
      fill="none"
      aria-hidden
    >
      <g
        stroke={ACCENT}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path
          d="M78 168 L128 122 L236 112 L286 74 L392 74 L432 118 L498 128 L508 168"
          fill="rgba(127,212,255,0.07)"
        />
        <path d="M236 112 L286 74 M300 74 L300 112 L236 112" />
        <path
          d="M312 78 L378 78 L404 112 L312 112 Z"
          fill="rgba(127,212,255,0.05)"
        />
        <path d="M128 122 L236 112 M432 118 L498 128" />
        <path d="M96 168 L508 168" />
        <path d="M352 74 L352 46 L392 46" strokeWidth="1.2" />
        <circle cx="392" cy="46" r="7" fill="rgba(127,212,255,0.12)" />
        <circle cx="168" cy="176" r="34" fill="rgba(8,38,60,0.9)" />
        <circle cx="168" cy="176" r="17" />
        <circle cx="438" cy="176" r="34" fill="rgba(8,38,60,0.9)" />
        <circle cx="438" cy="176" r="17" />
      </g>
    </svg>
  );
}

export async function VehicleView({
  item,
  canEdit,
}: {
  item: ItemDetails;
  canEdit: boolean;
}) {
  const t = await getTranslations("Items");
  const tv = await getTranslations("Items.Vehicle");
  const format = await getFormatter();

  const vehicle = item.vehicle;
  const dimensions =
    isNumber(vehicle?.length) &&
    isNumber(vehicle?.width) &&
    isNumber(vehicle?.height)
      ? `${format.number(vehicle.length)} × ${format.number(vehicle.width)} × ${format.number(vehicle.height)} m`
      : undefined;

  const figures = [
    isNumber(vehicle?.speedMax) && {
      label: tv("speedMax"),
      value: format.number(vehicle.speedMax!),
      unit: "m/s",
    },
    isNumber(vehicle?.speedScm) && {
      label: tv("speedScm"),
      value: format.number(vehicle.speedScm!),
      unit: "m/s",
    },
    isNumber(vehicle?.cargoScu) && {
      label: tv("cargo"),
      value: format.number(vehicle.cargoScu!),
      unit: "SCU",
    },
    isNumber(vehicle?.mass) && {
      label: tv("mass"),
      value: format.number(vehicle.mass!),
      unit: "kg",
    },
  ].filter((figure): figure is { label: string; value: string; unit: string } =>
    Boolean(figure),
  );

  const technical = {
    ...(dimensions ? { [tv("dimensions")]: { value: dimensions } } : {}),
    ...(item.statistics ?? {}),
  };

  return (
    <div className="m-2 mx-auto max-w-4xl overflow-hidden rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 shadow-xl shadow-black/20 backdrop-blur-sm">
      {/* Hero */}
      <div
        className="relative h-[372px]"
        style={{
          background:
            "radial-gradient(120% 90% at 78% 12%, rgba(127,212,255,0.18) 0%, rgba(9,47,73,0) 62%), linear-gradient(180deg, #0C3E60 0%, #0A3350 55%, #082B44 100%)",
        }}
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(158,208,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(158,208,255,0.09) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {item.imageUrl ? (
          <>
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="896px"
              className="object-cover"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08283F] via-[#08283F]/45 to-transparent" />
          </>
        ) : (
          <VehicleSilhouette />
        )}

        <div className="absolute inset-x-6 top-5 flex items-start justify-between gap-2">
          <ItemBreadcrumb name={item.name} />
          {canEdit && <ItemAdminMenu slug={item.slug} />}
        </div>

        <div className="absolute inset-x-6 bottom-5">
          {item.manufacturer && (
            <p
              className="text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: ACCENT }}
            >
              {item.manufacturer}
            </p>
          )}
          <h1 className="mt-1.5 text-[46px] font-bold leading-none tracking-tight text-[#EAF5FF]">
            {item.name}
          </h1>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <span
              className="inline-flex items-center rounded-full border bg-[#092F49]/50 px-2.5 py-0.5 text-xs font-medium"
              style={{ borderColor: ACCENT, color: ACCENT }}
            >
              {t(`kinds.${item.kind}`)}
            </span>
            <span className="inline-flex items-center rounded-full border border-[#9ED0FF]/25 bg-[#092F49]/50 px-2.5 py-0.5 text-xs font-medium text-nexus">
              {[item.category, item.subcategory].filter(Boolean).join(" · ")}
            </span>
            {isNumber(vehicle?.crew) && (
              <span className="inline-flex items-center rounded-full border border-[#9ED0FF]/25 bg-[#092F49]/50 px-2.5 py-0.5 text-xs font-medium text-nexus">
                {tv("seats", { count: vehicle.crew! })}
              </span>
            )}
            {item.variantName && (
              <span className="inline-flex items-center rounded-full border border-[#9ED0FF]/25 bg-[#092F49]/50 px-2.5 py-0.5 text-xs font-medium text-nexus">
                {item.variantName}
              </span>
            )}
          </div>
        </div>
      </div>

      {figures.length > 0 && (
        <div
          className="grid border-b border-[#9ED0FF]/12 bg-[#092F49]/35"
          style={{
            gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))`,
          }}
        >
          {figures.map((figure) => (
            <KeyFigure key={figure.label} {...figure} />
          ))}
        </div>
      )}

      <div className="space-y-7 p-6">
        {item.description && (
          <div>
            <SectionTitle>{tv("presentation")}</SectionTitle>
            <p className="max-w-[64ch] whitespace-pre-line leading-relaxed text-nexus">
              {item.description}
            </p>
          </div>
        )}

        {vehicle ? (
          <>
            <div>
              <SectionTitle>{tv("technical")}</SectionTitle>
              {Object.keys(technical).length > 0 ? (
                <StatisticsGrid statistics={technical} />
              ) : (
                <EmptySection
                  label={tv("technicalEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                />
              )}
            </div>

            <div>
              <SectionTitle
                aside={
                  item.hardpoints.length > 0
                    ? tv("hardpointsCount", { count: item.hardpoints.length })
                    : undefined
                }
              >
                {tv("armament")}
              </SectionTitle>
              {item.hardpoints.length > 0 ? (
                <div className="flex flex-col gap-4 sm:flex-row">
                  <HardpointDiagram
                    count={item.hardpoints.length}
                    label={tv("topView")}
                  />
                  <div className="flex flex-1 flex-col gap-2">
                    {item.hardpoints.map((slot, index) => (
                      <SlotRow
                        key={`${slot.label}-${index}`}
                        slot={slot}
                        index={index + 1}
                        accent={ACCENT}
                        emptyLabel={tv("slotEmpty")}
                      />
                    ))}
                    <p className="mt-auto pt-1 text-xs leading-relaxed text-nexus/60">
                      {tv("armamentHint")}
                    </p>
                  </div>
                </div>
              ) : (
                <EmptySection
                  label={tv("armamentEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                />
              )}
            </div>

            <div>
              <SectionTitle
                aside={
                  item.components.length > 0
                    ? tv("componentsCount", { count: item.components.length })
                    : undefined
                }
              >
                {tv("equipment")}
              </SectionTitle>
              {item.components.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {item.components.map((slot, index) => (
                    <SlotRow
                      key={`${slot.label}-${index}`}
                      slot={slot}
                      accent={ACCENT}
                      emptyLabel={tv("slotEmpty")}
                    />
                  ))}
                </div>
              ) : (
                <EmptySection
                  label={tv("equipmentEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                />
              )}
            </div>
          </>
        ) : (
          <KindDataNotice kind="vehicle" slug={item.slug} canEdit={canEdit} />
        )}

        <CommonSections item={item} canEdit={canEdit} />
      </div>
    </div>
  );
}
