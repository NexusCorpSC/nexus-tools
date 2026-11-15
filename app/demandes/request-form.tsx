"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/20/solid";
import { Textarea } from "@/components/ui/textarea";
import { ItemNameCombobox } from "@/app/inventory/item-name-combobox";
import { LocationCombobox } from "@/app/inventory/components";
import { cn } from "@/lib/utils";
import type { Location } from "@/types/inventory";
import type { ItemListResponse } from "@/types/items";
import {
  DEFAULT_REQUEST_EXPIRY_DAYS,
  MAX_REQUEST_NAME,
  MAX_REQUEST_NOTE,
  REQUEST_EXPIRY_DAYS,
  type PlayerRequest,
  type RequestKind,
  type RequestUnit,
} from "@/types/requests";
import { Chip, FIELD, GHOST_BUTTON, REQ_BUTTON } from "@/app/demandes/ui";

type Org = { id: string; name: string };

/** Le type d'une fiche du catalogue au nom exact, ou `null` (saisie libre). */
function useCatalogKind(name: string): RequestKind | null {
  const [found, setFound] = useState<{ name: string; kind: RequestKind | null }>({
    name: "",
    kind: null,
  });
  const typed = name.trim();
  useEffect(() => {
    if (typed.length < 2) return;
    let gone = false;
    const timer = setTimeout(() => {
      void fetch(`/api/items?${new URLSearchParams({ query: typed, limit: "20" })}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: ItemListResponse | null) => {
          if (gone || !body) return;
          const exact = body.items.find(
            (item) => item.name.trim().toLowerCase() === typed.toLowerCase(),
          );
          setFound({ name: typed, kind: exact?.kind ?? null });
        })
        .catch(() => {});
    }, 250);
    return () => {
      gone = true;
      clearTimeout(timer);
    };
  }, [typed]);
  return found.name === typed ? found.kind : null;
}

/**
 * Publier une demande, ou modifier la sienne (`initial`) : l'objet ne change
 * plus une fois publié, le reste oui.
 */
export function RequestForm({
  orgs,
  initial,
  initialName,
}: {
  orgs: Org[];
  initial?: PlayerRequest;
  /** Le nom d'une fiche d'objet d'où l'on vient (« Demander »). */
  initialName?: string;
}) {
  const t = useTranslations("Requests");
  const router = useRouter();
  const editing = !!initial;

  const [name, setName] = useState(initial?.name ?? initialName ?? "");
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "");
  const [unit, setUnit] = useState<RequestUnit | "">(initial ? (initial.unit ?? "") : "SCU");
  const [minQuality, setMinQuality] = useState(
    initial?.minQuality !== undefined ? String(initial.minQuality) : "",
  );
  const [location, setLocation] = useState<Location | null>(
    initial?.location ? { id: initial.location.id, name: initial.location.name, system: initial.location.system } : null,
  );
  const [price, setPrice] = useState(
    initial?.unitPrice !== undefined ? String(initial.unitPrice) : "",
  );
  const [friends, setFriends] = useState(initial ? initial.audience.friends : true);
  const [orgIds, setOrgIds] = useState<string[]>(
    initial ? initial.audience.orgs.map((org) => org.id) : orgs.map((org) => org.id),
  );
  const [isPublic, setIsPublic] = useState(initial?.audience.public ?? false);
  const [days, setDays] = useState<number>(DEFAULT_REQUEST_EXPIRY_DAYS);
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const catalogKind = useCatalogKind(editing ? "" : name);
  const kind: RequestKind = initial?.kind ?? catalogKind ?? "other";
  // Un objet du catalogue qui n'est pas un matériau se compte à l'unité, sans qualité.
  const material = kind === "resource" || kind === "other";
  const shownUnit = material ? unit : "";

  function toggleOrg(id: string) {
    setOrgIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!editing && !name.trim()) return setError(t("errors.name"));
    const quantityValue = Number(quantity.replace(",", "."));
    if (!quantity.trim() || !Number.isFinite(quantityValue) || quantityValue <= 0) {
      return setError(t("errors.quantity"));
    }
    if (!shownUnit && !Number.isInteger(quantityValue)) return setError(t("errors.wholeQuantity"));
    if (!friends && !isPublic && orgIds.length === 0) return setError(t("errors.audience"));

    const fields = {
      quantity: quantityValue,
      minQuality: material && minQuality.trim() !== "" ? Number(minQuality) : null,
      locationId: location?.id ?? null,
      unitPrice: price.trim() === "" ? null : Number(price.replace(/\s/g, "")),
      note: note.trim() || null,
      audience: { friends, orgIds, public: isPublic },
    };
    setSending(true);
    try {
      const response = editing
        ? await fetch(`/api/requests/${encodeURIComponent(initial.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update", ...fields }),
          })
        : await fetch("/api/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              unit: shownUnit || null,
              expiresInDays: days,
              ...fields,
            }),
          });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(t.has(`errors.${body.error}`) ? t(`errors.${body.error}`) : t("errors.generic"));
        return;
      }
      router.push(`/demandes/${body.id}`);
      router.refresh();
    } catch {
      setError(t("errors.generic"));
    } finally {
      setSending(false);
    }
  }

  const label = "space-y-1.5 text-xs font-medium text-[#A9CDEE]";
  const optional = <i className="font-normal text-[#7E9FB7] not-italic">{t("form.optional")}</i>;

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className={label}>
        <label htmlFor="request-name">{t("form.what")}</label>
        {editing ? (
          <p className="flex h-9 items-center rounded-lg border border-[#9ED0FF]/15 bg-[#0E2C45]/60 px-3 text-sm text-[#E3F1FF]">
            {initial.name}
            <span className="ml-auto text-xs text-[#7E9FB7]">{t(`kinds.${initial.kind}`)}</span>
          </p>
        ) : (
          <>
            <ItemNameCombobox
              id="request-name"
              value={name}
              onChange={(next) => setName(next.slice(0, MAX_REQUEST_NAME))}
              placeholder={t("form.whatPlaceholder")}
              required
            />
            <p className="font-normal text-[#7E9FB7]">
              {name.trim().length >= 2
                ? catalogKind
                  ? t("form.catalogKind", { kind: t(`kinds.${catalogKind}`) })
                  : t("form.freeText")
                : t("form.whatHint")}
            </p>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          {t("fields.quantity")}
          <input
            id="request-quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className={cn(FIELD, "font-mono")}
            required
          />
        </label>
        {material && (
          <div className={label}>
            <span>{t("form.unit")}</span>
            <div className="flex flex-wrap gap-1.5">
              {(["SCU", "cSCU", ""] as const).map((entry) => (
                <button
                  key={entry || "none"}
                  type="button"
                  disabled={editing}
                  onClick={() => setUnit(entry)}
                  aria-pressed={unit === entry}
                >
                  <Chip on={unit === entry}>{entry || t("form.units")}</Chip>
                </button>
              ))}
            </div>
          </div>
        )}
        {material && (
          <label className={label}>
            <span>
              {t("form.minQuality")} {optional}
            </span>
            <input
              id="request-quality"
              inputMode="numeric"
              value={minQuality}
              onChange={(event) => setMinQuality(event.target.value.replace(/\D/g, "").slice(0, 4))}
              className={cn(FIELD, "font-mono")}
              placeholder={t("form.minQualityPlaceholder")}
            />
          </label>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={label}>
          <span>
            {t("form.pickup")} {optional}
          </span>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <LocationCombobox
                value={location}
                onChange={setLocation}
                placeholder={t("form.pickupPlaceholder")}
                aria-label={t("form.pickup")}
                inputClassName="h-9 bg-[#0E2C45]"
              />
            </div>
            {location && (
              <button
                type="button"
                onClick={() => setLocation(null)}
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-[#9ED0FF]/28 text-[#A9CDEE] hover:text-[#E3F1FF]"
                aria-label={t("form.clearPickup")}
              >
                <XMarkIcon className="size-4" />
              </button>
            )}
          </div>
        </div>
        <label className={label}>
          <span>
            {shownUnit ? t("fields.pricePer", { unit: shownUnit }) : t("fields.pricePerUnit")}{" "}
            {optional}
          </span>
          <span className="relative block">
            <input
              id="request-price"
              inputMode="numeric"
              value={price}
              onChange={(event) => setPrice(event.target.value.replace(/[^\d\s]/g, ""))}
              className={cn(FIELD, "pr-14 font-mono")}
              placeholder={t("negotiable")}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-[#7E9FB7]">
              aUEC
            </span>
          </span>
          <span className="block font-normal text-[#7E9FB7]">{t("form.priceHint")}</span>
        </label>
      </div>

      <fieldset className={label}>
        <legend className="mb-1.5">{t("form.audience")}</legend>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setFriends(!friends)} aria-pressed={friends}>
            <Chip on={friends}>{friends ? "✓ " : ""}{t("form.myFriends")}</Chip>
          </button>
          {orgs.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => toggleOrg(org.id)}
              aria-pressed={orgIds.includes(org.id)}
            >
              <Chip on={orgIds.includes(org.id)}>
                {orgIds.includes(org.id) ? "✓ " : ""}
                {org.name}
              </Chip>
            </button>
          ))}
          <button type="button" onClick={() => setIsPublic(!isPublic)} aria-pressed={isPublic}>
            <Chip on={isPublic}>{isPublic ? "✓ " : ""}{t("audience.public")}</Chip>
          </button>
        </div>
        <p className="mt-1.5 font-normal text-[#7E9FB7]">{t("form.audienceHint")}</p>
      </fieldset>

      {!editing && (
        <fieldset className={label}>
          <legend className="mb-1.5">{t("form.expiresIn")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {REQUEST_EXPIRY_DAYS.map((entry) => (
              <button key={entry} type="button" onClick={() => setDays(entry)} aria-pressed={days === entry}>
                <Chip on={days === entry}>{t("form.days", { count: entry })}</Chip>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className={cn(label, "block")}>
        <span>
          {t("form.note")} {optional}
        </span>
        <Textarea
          id="request-note"
          value={note}
          maxLength={MAX_REQUEST_NOTE}
          onChange={(event) => setNote(event.target.value)}
          placeholder={t("form.notePlaceholder")}
          className="min-h-20"
        />
      </label>

      {error && <p className="text-sm text-red-300">{error}</p>}

      <div className="flex flex-wrap justify-end gap-2 border-t border-[#9ED0FF]/15 pt-4">
        <button type="button" className={GHOST_BUTTON} onClick={() => router.back()}>
          {t("cancel")}
        </button>
        <button type="submit" className={REQ_BUTTON} disabled={sending}>
          {sending ? t("sending") : editing ? t("form.save") : t("form.publish")}
        </button>
      </div>
    </form>
  );
}
