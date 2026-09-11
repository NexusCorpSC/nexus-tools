import { getFormatter, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { isNumber, type ItemDetails } from "@/types/items";
import { ItemAdminMenu } from "../components";
import {
  CommonSections,
  EmptySection,
  ItemBreadcrumb,
  KindDataNotice,
  SectionTitle,
  SlotRow,
  KIND_ACCENT,
} from "../sections";

const ACCENT = KIND_ACCENT.weapon;

/** The line-art stand-in used until someone uploads a picture of the weapon. */
function WeaponSilhouette() {
  return (
    <svg
      viewBox="0 0 620 190"
      className="absolute left-1/2 top-3 w-[620px] -translate-x-1/2"
      fill="none"
      aria-hidden
    >
      <g
        stroke={ACCENT}
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path
          d="M64 96 L108 96 L118 78 L286 78 L300 70 L420 70 L420 96 L468 96 L476 108 L118 108 Z"
          fill="rgba(232,71,43,0.08)"
        />
        <path
          d="M468 96 L556 96 L562 104 L476 108"
          fill="rgba(232,71,43,0.05)"
        />
        <path d="M180 108 L172 152 L214 152 L222 108" />
        <path d="M118 108 L96 150 L64 150 L64 96" />
        <path
          d="M258 108 L252 136 L288 136 L294 108"
          fill="rgba(232,71,43,0.05)"
        />
        <path d="M320 70 L320 52 L392 52 L392 70" />
        <circle cx="356" cy="52" r="10" fill="rgba(6,25,39,0.9)" />
        <path d="M430 78 L452 78 M430 88 L452 88" />
      </g>
    </svg>
  );
}

function Tag({
  children,
  filled,
}: {
  children: React.ReactNode;
  filled?: boolean;
}) {
  return (
    <span
      className="clip-tag inline-flex items-center px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em]"
      style={
        filled
          ? { backgroundColor: ACCENT, color: "#0B0B0B" }
          : {
              border: "1px solid rgba(158,208,255,0.3)",
              color: "var(--color-nexus-fg)",
            }
      }
    >
      {children}
    </span>
  );
}

function Readout({
  value,
  unit,
  label,
}: {
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <div className="clip-notch border border-[#9ED0FF]/14 bg-white/[0.025] p-3.5">
      <p className="font-mono text-2xl font-bold text-[#F2F7FC]">
        {value}
        {unit && <span className="text-[13px] text-nexus/70">{unit}</span>}
      </p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wider text-nexus/65">
        {label}
      </p>
    </div>
  );
}

/**
 * Damage per shot against distance, from the three numbers the game uses:
 * full damage up to `start`, then a linear drop per metre down to a floor.
 */
function FalloffChart({
  damage,
  start,
  perMeter,
  min,
  range,
  axisLabel,
}: {
  damage: number;
  start: number;
  perMeter: number;
  min: number;
  range: number;
  axisLabel: string;
}) {
  const floor = Math.min(min, damage);
  const reachesFloor = start + (damage - floor) / perMeter;
  const span = Math.max(range, reachesFloor * 1.1, start * 2, 1);
  const x = (metres: number) => (metres / span) * 800;
  const y = (value: number) => 118 - (value / damage) * 100;

  const path = [
    `M ${x(0)} ${y(damage)}`,
    `L ${x(start)} ${y(damage)}`,
    `L ${x(Math.min(reachesFloor, span))} ${y(Math.max(floor, damage - perMeter * (Math.min(reachesFloor, span) - start)))}`,
    reachesFloor < span ? `L ${x(span)} ${y(floor)}` : "",
  ].join(" ");

  return (
    <svg
      viewBox="0 0 800 140"
      preserveAspectRatio="none"
      className="block h-[140px] w-full"
    >
      <g stroke="rgba(158,208,255,0.1)" strokeWidth="1">
        <path d="M0 18 H800 M0 68 H800 M0 118 H800" />
      </g>
      <path
        d={`${path} L 800 138 L 0 138 Z`}
        fill="rgba(232,71,43,0.10)"
        stroke="none"
      />
      <path
        d={path}
        fill="none"
        stroke={ACCENT}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text
        x="4"
        y="14"
        fontSize="10"
        fill="rgba(158,208,255,0.55)"
        fontFamily="var(--font-geist-mono), monospace"
      >
        {damage}
      </text>
      <text
        x="4"
        y="132"
        fontSize="10"
        fill="rgba(158,208,255,0.55)"
        fontFamily="var(--font-geist-mono), monospace"
      >
        {floor}
      </text>
      <text
        x="796"
        y="132"
        fontSize="10"
        textAnchor="end"
        fill="rgba(158,208,255,0.55)"
        fontFamily="var(--font-geist-mono), monospace"
      >
        {Math.round(span)} {axisLabel}
      </text>
    </svg>
  );
}

export async function WeaponView({
  item,
  canEdit,
}: {
  item: ItemDetails;
  canEdit: boolean;
}) {
  const t = await getTranslations("Items");
  const tw = await getTranslations("Items.Weapon");
  const format = await getFormatter();

  const weapon = item.weapon;
  const readouts = [
    isNumber(weapon?.rateOfFire) && {
      value: format.number(weapon.rateOfFire!),
      label: tw("rateOfFire"),
    },
    isNumber(weapon?.magazine) && {
      value: format.number(weapon.magazine!),
      label: tw("magazine"),
    },
    isNumber(weapon?.reloadTime) && {
      value: format.number(weapon.reloadTime!),
      unit: "s",
      label: tw("reload"),
    },
    isNumber(weapon?.mass) && {
      value: format.number(weapon.mass!),
      unit: "kg",
      label: tw("mass"),
    },
  ].filter(
    (readout): readout is { value: string; unit?: string; label: string } =>
      Boolean(readout),
  );

  const peerMax = Math.max(...item.weaponPeers.map((peer) => peer.value), 1);

  return (
    <div className="m-2 mx-auto max-w-4xl overflow-hidden rounded-2xl border border-[#9ED0FF]/15 bg-[#071E2E] shadow-xl shadow-black/35">
      {/* Header slab */}
      <div
        className="relative px-6 pb-5 pt-5"
        style={{
          background:
            "linear-gradient(100deg, rgba(232,71,43,0.16) 0%, rgba(7,30,46,0) 58%)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: ACCENT }}
        />
        <div
          className="absolute inset-y-0 left-1.5 w-7 opacity-30"
          style={{
            background: `repeating-linear-gradient(135deg, ${ACCENT} 0 7px, transparent 7px 15px)`,
          }}
        />

        <div className="ml-12">
          <div className="flex items-start justify-between gap-2">
            <ItemBreadcrumb name={item.name} />
            {canEdit && <ItemAdminMenu slug={item.slug} />}
          </div>

          <p
            className="mt-4 font-mono text-[11px] tracking-[0.22em]"
            style={{ color: ACCENT }}
          >
            {[item.manufacturer, item.subcategory]
              .filter(Boolean)
              .join(" · ")
              .toUpperCase()}
          </p>
          <h1 className="mt-1.5 text-5xl font-extrabold uppercase leading-none tracking-tight text-[#F2F7FC]">
            {item.name}
          </h1>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Tag filled>{t(`kinds.${item.kind}`)}</Tag>
            <Tag>{item.category}</Tag>
            {weapon?.damageType && <Tag>{weapon.damageType}</Tag>}
            {weapon?.caliber && <Tag>{weapon.caliber}</Tag>}
            {item.variantName && <Tag>{item.variantName}</Tag>}
          </div>
        </div>
      </div>

      {/* Silhouette band */}
      <div
        className="relative h-[250px] border-y border-[#9ED0FF]/12"
        style={{
          background:
            "radial-gradient(90% 140% at 20% 100%, rgba(232,71,43,0.12) 0%, rgba(6,25,39,0) 60%), #061927",
        }}
      >
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(rgba(158,208,255,0.05) 1px, transparent 1px)",
            backgroundSize: "100% 10px",
          }}
        />
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            sizes="896px"
            className="object-contain p-6"
            priority
          />
        ) : (
          <WeaponSilhouette />
        )}
      </div>

      <div className="space-y-7 p-6">
        {item.description && (
          <p className="max-w-[68ch] whitespace-pre-line leading-relaxed text-nexus">
            {item.description}
          </p>
        )}

        {weapon ? (
          <>
            <div>
              <SectionTitle
                aside={
                  item.weaponProfile.some((stat) => stat.average !== undefined)
                    ? tw("classAverage")
                    : undefined
                }
              >
                {tw("damageProfile")}
              </SectionTitle>
              {item.weaponProfile.length > 0 ? (
                <div className="flex flex-col gap-3.5">
                  {item.weaponProfile.map((stat) => (
                    <div key={stat.label}>
                      <div className="mb-1.5 flex items-baseline justify-between">
                        <span className="text-[13px] font-semibold text-nexus-primary">
                          {stat.label}
                        </span>
                        <span className="font-mono text-[15px] font-bold text-[#F2F7FC]">
                          {format.number(stat.value)}
                          {stat.unit ? ` ${stat.unit}` : ""}
                        </span>
                      </div>
                      {stat.comparable ? (
                        <div className="relative h-2.5 bg-[#9ED0FF]/10">
                          <div
                            className="absolute inset-y-0 left-0"
                            style={{
                              width: `${Math.min(100, (stat.value / stat.max) * 100)}%`,
                              backgroundColor: ACCENT,
                            }}
                          />
                          {stat.average !== undefined && (
                            <div
                              className="absolute -inset-y-0.5 w-0.5 bg-[#EAF5FF]/65"
                              style={{
                                left: `${Math.min(100, (stat.average / stat.max) * 100)}%`,
                              }}
                              title={tw("classAverage")}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="h-2.5 border-b border-dashed border-[#9ED0FF]/25" />
                      )}
                    </div>
                  ))}
                  {item.weaponProfile.some((stat) => !stat.comparable) && (
                    <p className="text-xs text-nexus/60">
                      {tw("notComparable")}
                    </p>
                  )}
                </div>
              ) : (
                <EmptySection
                  label={tw("damageProfileEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                  sharp
                />
              )}
            </div>

            <div>
              <SectionTitle>{tw("rounds")}</SectionTitle>
              {readouts.length > 0 ? (
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(readouts.length, 4)}, minmax(0, 1fr))`,
                  }}
                >
                  {readouts.map((readout) => (
                    <Readout key={readout.label} {...readout} />
                  ))}
                </div>
              ) : (
                <EmptySection
                  label={tw("roundsEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                  sharp
                />
              )}
            </div>

            <div>
              <SectionTitle
                aside={
                  item.attachments.length > 0
                    ? tw("attachmentsCount", {
                        mounted: item.attachments.filter(
                          (slot) => slot.mounted || slot.itemName,
                        ).length,
                        total: item.attachments.length,
                      })
                    : undefined
                }
              >
                {tw("attachments")}
              </SectionTitle>
              {item.attachments.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {item.attachments.map((slot, index) => (
                    <SlotRow
                      key={`${slot.label}-${index}`}
                      slot={slot}
                      accent={ACCENT}
                      emptyLabel={tw("attachmentEmpty")}
                      sharp
                    />
                  ))}
                </div>
              ) : (
                <EmptySection
                  label={tw("attachmentsEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                  sharp
                />
              )}
            </div>

            <div>
              <SectionTitle>{tw("fireModes")}</SectionTitle>
              {weapon.fireModes && weapon.fireModes.length > 0 ? (
                <div className="clip-notch overflow-hidden border border-[#9ED0FF]/14 bg-white/[0.025]">
                  <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] px-3.5 py-2 text-[10px] font-bold uppercase tracking-widest text-nexus/60">
                    <span>{tw("modeLabel")}</span>
                    <span className="text-right">{tw("modeRpm")}</span>
                    <span className="text-right">{tw("modeDps")}</span>
                    <span className="text-right">{tw("modeAmmo")}</span>
                    <span className="text-right">{tw("modePellets")}</span>
                  </div>
                  {weapon.fireModes.map((mode) => (
                    <div
                      key={mode.label}
                      className="grid grid-cols-[1.2fr_1fr_1fr_1fr_1fr] items-center border-t border-[#9ED0FF]/[0.09] px-3.5 py-2.5 text-[13px]"
                    >
                      <span className="font-mono text-xs font-bold tracking-[0.12em] text-[#F2F7FC]">
                        {mode.label}
                        {isNumber(mode.burstCount) && mode.burstCount > 1 && (
                          <span className="ml-2 font-normal tracking-normal text-nexus/60">
                            {tw("modeBurst")} ×{mode.burstCount}
                          </span>
                        )}
                      </span>
                      <span className="text-right font-mono text-[#EAF5FF]">
                        {isNumber(mode.rpm) ? format.number(mode.rpm) : "—"}
                      </span>
                      <span className="text-right font-mono text-[#EAF5FF]">
                        {isNumber(mode.dps) ? format.number(mode.dps) : "—"}
                      </span>
                      <span className="text-right font-mono text-nexus/80">
                        {isNumber(mode.ammoPerShot)
                          ? format.number(mode.ammoPerShot)
                          : "—"}
                      </span>
                      <span className="text-right font-mono text-nexus/80">
                        {isNumber(mode.pelletsPerShot)
                          ? format.number(mode.pelletsPerShot)
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptySection
                  label={tw("fireModesEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                  sharp
                />
              )}
            </div>

            <div>
              <SectionTitle>{tw("spread")}</SectionTitle>
              {weapon.spread || weapon.adsSpread ? (
                <div className="clip-notch border border-[#9ED0FF]/14 bg-white/[0.025] p-4">
                  <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-y-2 text-[13px]">
                    <span />
                    <span className="text-right text-[10px] font-bold uppercase tracking-widest text-nexus/60">
                      {tw("spreadHip")}
                    </span>
                    <span className="text-right text-[10px] font-bold uppercase tracking-widest text-nexus/60">
                      {tw("spreadAds")}
                    </span>
                    {(
                      [
                        ["spreadMin", "min", "°"],
                        ["spreadMax", "max", "°"],
                        ["spreadFirst", "firstShot", "°"],
                        ["spreadPer", "perShot", "°"],
                        ["spreadDecay", "decay", "°/s"],
                      ] as const
                    ).map(([labelKey, field, unit]) => (
                      <div key={field} className="contents">
                        <span className="border-t border-[#9ED0FF]/[0.09] pt-2 text-nexus-primary">
                          {tw(labelKey)}
                        </span>
                        {[weapon.spread, weapon.adsSpread].map(
                          (spread, column) => (
                            <span
                              key={column}
                              className="border-t border-[#9ED0FF]/[0.09] pt-2 text-right font-mono text-[#EAF5FF]"
                            >
                              {isNumber(spread?.[field])
                                ? `${format.number(spread[field], { maximumFractionDigits: 2 })}${unit}`
                                : "—"}
                            </span>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-nexus/60">
                    {tw("spreadHint")}
                  </p>
                </div>
              ) : (
                <EmptySection
                  label={tw("spreadEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                  sharp
                />
              )}
            </div>

            <div>
              <SectionTitle>{tw("ammunition")}</SectionTitle>
              {weapon.ammunition ? (
                <div className="space-y-2">
                  <div
                    className="grid gap-2"
                    style={{
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(120px, 1fr))",
                    }}
                  >
                    {(
                      [
                        [
                          "ammoDamage",
                          weapon.ammunition.damagePerShot,
                          weapon.ammunition.damageType
                            ? ` ${weapon.ammunition.damageType}`
                            : "",
                        ],
                        ["ammoSpeed", weapon.ammunition.speed, " m/s"],
                        ["ammoRange", weapon.ammunition.range, " m"],
                        ["ammoLifetime", weapon.ammunition.lifetime, " s"],
                        ["ammoCapacity", weapon.ammunition.capacity, ""],
                        ["ammoSize", weapon.ammunition.size, ""],
                        ["ammoPenetration", weapon.ammunition.penetration, ""],
                      ] as const
                    )
                      .filter(([, value]) => isNumber(value))
                      .map(([labelKey, value, unit]) => (
                        <Readout
                          key={labelKey}
                          value={
                            labelKey === "ammoSize"
                              ? `S${value}`
                              : format.number(value as number, {
                                  maximumFractionDigits: 2,
                                })
                          }
                          unit={unit || undefined}
                          label={tw(labelKey)}
                        />
                      ))}
                  </div>

                  {isNumber(weapon.ammunition.damagePerShot) && (
                    <div className="clip-notch border border-[#9ED0FF]/14 bg-white/[0.025] p-4">
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-nexus/60">
                        {tw("falloffTitle")}
                      </p>
                      {isNumber(weapon.ammunition.falloffPerMeter) &&
                      weapon.ammunition.falloffPerMeter > 0 ? (
                        <>
                          <FalloffChart
                            damage={weapon.ammunition.damagePerShot}
                            start={weapon.ammunition.falloffStart ?? 0}
                            perMeter={weapon.ammunition.falloffPerMeter}
                            min={weapon.ammunition.falloffMinDamage ?? 0}
                            range={weapon.ammunition.range ?? 0}
                            axisLabel={tw("falloffAxis")}
                          />
                          <p className="mt-2 text-xs text-nexus/60">
                            {tw("falloff", {
                              damage: format.number(
                                weapon.ammunition.damagePerShot,
                                { maximumFractionDigits: 1 },
                              ),
                              start: format.number(
                                weapon.ammunition.falloffStart ?? 0,
                              ),
                              perMeter: format.number(
                                weapon.ammunition.falloffPerMeter,
                                { maximumFractionDigits: 3 },
                              ),
                              min: format.number(
                                weapon.ammunition.falloffMinDamage ?? 0,
                                { maximumFractionDigits: 1 },
                              ),
                            })}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-nexus/60">
                          {tw("falloffNone")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <EmptySection
                  label={tw("ammunitionEmpty")}
                  slug={item.slug}
                  canEdit={canEdit}
                  sharp
                />
              )}
            </div>

            {item.weaponPeers.length > 1 && (
              <div>
                <SectionTitle>{tw("againstClass")}</SectionTitle>
                <div className="clip-notch border border-[#9ED0FF]/14 bg-white/[0.025] p-4">
                  <div className="flex h-36 items-end gap-5">
                    {item.weaponPeers.map((peer) => (
                      <div
                        key={peer.slug}
                        className="flex flex-1 flex-col items-center gap-2"
                      >
                        <span
                          className={
                            peer.isCurrent
                              ? "font-mono text-xs text-[#F2F7FC]"
                              : "font-mono text-xs text-nexus/80"
                          }
                        >
                          {format.number(peer.value)}
                        </span>
                        <div
                          className="w-full"
                          style={{
                            height: `${Math.max(6, (peer.value / peerMax) * 92)}px`,
                            backgroundColor: peer.isCurrent
                              ? ACCENT
                              : "rgba(158,208,255,0.28)",
                          }}
                        />
                        {peer.isCurrent ? (
                          <span className="text-center text-[11px] text-nexus-primary">
                            {peer.name}
                          </span>
                        ) : (
                          <Link
                            href={`/items/${peer.slug}`}
                            className="text-center text-[11px] text-nexus/75 hover:text-nexus-primary"
                          >
                            {peer.name}
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-nexus/60">
                    {tw("againstClassHint", {
                      stat: item.weaponProfile[0]?.label ?? "",
                    })}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <KindDataNotice
            kind="weapon"
            slug={item.slug}
            canEdit={canEdit}
            sharp
          />
        )}

        <CommonSections item={item} canEdit={canEdit} />
      </div>
    </div>
  );
}
