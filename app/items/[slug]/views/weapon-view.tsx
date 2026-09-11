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
