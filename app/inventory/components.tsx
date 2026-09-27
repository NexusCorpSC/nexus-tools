"use client";

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { InventoryItemWithLocation, Location } from "@/types/inventory";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  MapPinIcon,
  CubeIcon,
  TableCellsIcon,
  TrashIcon,
  PencilIcon,
  MinusIcon,
  ArrowsRightLeftIcon,
  ArchiveBoxIcon,
  BuildingOffice2Icon,
  PaperAirplaneIcon,
  ArrowDownTrayIcon,
  InboxStackIcon,
} from "@heroicons/react/24/outline";
import { packageOperate, sendParcel } from "./actions";
import type { ParcelView } from "@/lib/parcels";
import {
  PARCEL_PARAM,
  ReceiveParcelDialog,
  SentParcelDialog,
} from "./parcels";
import { cn, roundQty } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ─── Types ───────────────────────────────────────────────────────────────────

/** A small action next to a lot: quiet until pointed at. */
const ICON_BUTTON =
  "size-7 rounded-md text-[#7E9FB7] hover:bg-[#0B3A5A] hover:text-[#CCE7FF]";

type PackageItem = {
  item: InventoryItemWithLocation;
  quantity: number;
};

/** What of a lot a new parcel may still take: not what one waiting holds. */
function availableOf(item: InventoryItemWithLocation) {
  return roundQty(item.quantity - (item.reserved ?? 0));
}

// ─── LocationCombobox ────────────────────────────────────────────────────────

export function LocationCombobox({
  value,
  onChange,
  placeholder,
  inputClassName,
  "aria-label": ariaLabel,
}: {
  value: Location | null;
  onChange: (loc: Location) => void;
  placeholder: string;
  inputClassName?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("Inventory");
  const [inputValue, setInputValue] = useState(value?.name ?? "");
  const [suggestions, setSuggestions] = useState<Location[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    try {
      const res = await fetch(
        `/api/inventory/locations?query=${encodeURIComponent(query)}`,
      );
      if (!res.ok) return;
      const data: Location[] = await res.json();
      setSuggestions(data);
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    fetchSuggestions(inputValue);
  }, [inputValue, fetchSuggestions]);

  // Reset input when value prop changes from outside
  useEffect(() => {
    setInputValue(value?.name ?? "");
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleCreateLocation = async () => {
    if (!inputValue.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/inventory/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: inputValue.trim() }),
      });
      if (!res.ok) return;
      const newLoc: Location = await res.json();
      onChange(newLoc);
      setInputValue(newLoc.name);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  };

  const exactMatch = suggestions.some(
    (s) => s.name.toLowerCase() === inputValue.trim().toLowerCase(),
  );

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={inputClassName}
        autoComplete="off"
        onChange={(e) => {
          setInputValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (inputValue.length > 0 || suggestions.length > 0) && (
        <div className="absolute z-50 mt-1 w-full min-w-64 max-h-60 overflow-auto rounded-lg border border-[#9ED0FF]/25 bg-popover text-popover-foreground shadow-xl shadow-black/40">
          {/*
            Deux groupes : les lieux du catalogue d'abord — ceux qui portent un
            `placeSlug` —, puis ceux que le joueur a nommés lui-même. « Hangar
            de Karim » reste à sa place, il n'est pas au catalogue.
          */}
          {[
            {
              key: "catalogue",
              label: t("locationCatalogue"),
              rows: suggestions.filter((loc) => loc.placeSlug),
            },
            {
              key: "mine",
              label: t("locationMine"),
              rows: suggestions.filter((loc) => !loc.placeSlug),
            },
          ]
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <div key={group.key}>
                <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide opacity-60">
                  {group.label}
                </p>
                {group.rows.map((loc) => (
                  <button
                    key={loc.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#9ED0FF]/10 flex items-center gap-2"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(loc);
                      setInputValue(loc.name);
                      setOpen(false);
                    }}
                  >
                    <MapPinIcon className="size-4 shrink-0 text-[#7E9FB7]" />
                    <span>{loc.name}</span>
                    {loc.system && (
                      <span className="ml-auto text-xs opacity-70">
                        {loc.system}
                      </span>
                    )}
                    {!loc.placeSlug && loc.userId && (
                      <span className="ml-auto text-xs text-[#7E9FB7]">
                        {t("locationPersonal")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          {inputValue.trim() && !exactMatch && (
            <button
              type="button"
              disabled={creating}
              className="w-full text-left px-3 py-2 text-sm hover:bg-[#9ED0FF]/10 text-[#9ED0FF] flex items-center gap-2 border-t border-[#9ED0FF]/15"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreateLocation}
            >
              <PlusIcon className="size-4 shrink-0" />
              {t("locationCreate", { name: inputValue.trim() })}
            </button>
          )}
          {suggestions.length === 0 && !inputValue.trim() && (
            <p className="px-3 py-2 text-sm text-[#7E9FB7]">{t("locationEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ItemFormFields ───────────────────────────────────────────────────────────
// Shared form body used by AddItemDialog and EditItemDialog

function ItemFormFields({
  name,
  setName,
  description,
  setDescription,
  quality,
  setQuality,
  quantity,
  setQuantity,
  unit,
  setUnit,
  location,
  setLocation,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  quality: string;
  setQuality: (v: string) => void;
  quantity: string;
  setQuantity: (v: string) => void;
  unit: string;
  setUnit: (v: string) => void;
  location: Location | null;
  setLocation: (v: Location) => void;
}) {
  const t = useTranslations("Inventory");
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="item-name">{t("fieldName")}</Label>
        <Input
          id="item-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("fieldNamePlaceholder")}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="item-description">
          {t("fieldDescription")}{" "}
          <span className=" font-normal">({t("optional")})</span>
        </Label>
        <Textarea
          id="item-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={t("fieldDescriptionPlaceholder")}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="item-quality">
            {t("fieldQuality")}{" "}
            <span className=" font-normal text-xs">({t("optional")})</span>
          </Label>
          <Input
            id="item-quality"
            type="number"
            min={0}
            step={1}
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="item-quantity">{t("fieldQuantity")}</Label>
          <Input
            id="item-quantity"
            type="number"
            min={0}
            step="any"
            required
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="item-unit">
            {t("fieldUnit")}{" "}
            <span className=" font-normal text-xs">({t("optional")})</span>
          </Label>
          <Input
            id="item-unit"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={t("fieldUnitPlaceholder")}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>{t("fieldLocation")}</Label>
        <LocationCombobox
          value={location}
          onChange={setLocation}
          placeholder={t("fieldLocationPlaceholder")}
        />
      </div>
    </>
  );
}

// ─── AddItemDialog ────────────────────────────────────────────────────────────

function AddItemDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations("Inventory");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [quality, setQuality] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [orgVisible, setOrgVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setQuality("");
    setQuantity("");
    setUnit("");
    setLocation(null);
    setOrgVisible(false);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!location) {
      setError(t("errorLocationRequired"));
      return;
    }

    const parsedQuantity = parseFloat(quantity);
    if (isNaN(parsedQuantity)) {
      setError(t("errorQuantityInvalid"));
      return;
    }

    const parsedQuality =
      quality.trim() !== "" ? parseInt(quality, 10) : undefined;
    if (
      parsedQuality !== undefined &&
      (isNaN(parsedQuality) || parsedQuality < 0)
    ) {
      setError(t("errorQualityInvalid"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          quality: parsedQuality,
          quantity: parsedQuantity,
          unit: unit.trim() || undefined,
          locationId: location.id,
          orgVisible,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("errorGeneric"));
        return;
      }

      onCreated();
      handleClose();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("addItemTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ItemFormFields
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            quality={quality}
            setQuality={setQuality}
            quantity={quantity}
            setQuantity={setQuantity}
            unit={unit}
            setUnit={setUnit}
            location={location}
            setLocation={setLocation}
          />

          <button
            type="button"
            onClick={() => setOrgVisible((v) => !v)}
            aria-pressed={orgVisible}
            className={`w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
              orgVisible
                ? "border-[#9ED0FF]/60 bg-[#9ED0FF]/12 text-[#CCE7FF]"
                : "border-[#9ED0FF]/15 hover:bg-[#9ED0FF]/5 text-[#7E9FB7]"
            }`}
          >
            <div className="flex items-center gap-2">
              <BuildingOffice2Icon className="size-4 shrink-0" />
              <span className="font-medium">{t("fieldOrgVisible")}</span>
            </div>
            <span
              className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors ${
                orgVisible ? "bg-[#9ED0FF]" : "bg-[#9ED0FF]/20"
              }`}
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-[#061E30] shadow-sm transition-transform ${
                  orgVisible ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
          </button>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("addItemConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── EditItemDialog ───────────────────────────────────────────────────────────

function EditItemDialog({
  item,
  onClose,
  onUpdated,
}: {
  item: InventoryItemWithLocation;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const t = useTranslations("Inventory");
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [quality, setQuality] = useState(
    item.quality !== undefined && item.quality !== null
      ? String(item.quality)
      : "",
  );
  const [quantity, setQuantity] = useState(String(item.quantity));
  const [unit, setUnit] = useState(item.unit ?? "");
  const [location, setLocation] = useState<Location | null>(
    item.location ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!location) {
      setError(t("errorLocationRequired"));
      return;
    }
    const parsedQuantity = parseFloat(quantity);
    if (isNaN(parsedQuantity)) {
      setError(t("errorQuantityInvalid"));
      return;
    }
    const parsedQuality =
      quality.trim() !== "" ? parseInt(quality, 10) : undefined;
    if (
      parsedQuality !== undefined &&
      (isNaN(parsedQuality) || parsedQuality < 0)
    ) {
      setError(t("errorQualityInvalid"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "update",
          name: name.trim(),
          description: description.trim() || undefined,
          quality: parsedQuality,
          quantity: parsedQuantity,
          unit: unit.trim() || undefined,
          locationId: location.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("errorGeneric"));
        return;
      }
      onUpdated();
      onClose();
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("editItemTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <ItemFormFields
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            quality={quality}
            setQuality={setQuality}
            quantity={quantity}
            setQuantity={setQuantity}
            unit={unit}
            setUnit={setUnit}
            location={location}
            setLocation={setLocation}
          />
          {error && <p className="text-sm text-red-300">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t("saving") : t("editItemConfirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── AdjustQuantityPopover ────────────────────────────────────────────────────

function AdjustQuantityPopover({
  item,
  mode,
  onUpdated,
}: {
  item: InventoryItemWithLocation;
  mode: "add" | "remove";
  onUpdated: () => void;
}) {
  const t = useTranslations("Inventory");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) {
      setError(t("errorQuantityInvalid"));
      return;
    }
    const delta = mode === "add" ? parsed : -parsed;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "adjust", delta }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("errorGeneric"));
        return;
      }
      onUpdated();
      setOpen(false);
      setValue("");
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = mode === "add" ? PlusIcon : MinusIcon;
  const label = mode === "add" ? t("actionAdd") : t("actionRemove");

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setValue("");
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          title={label}
        >
          <Icon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <p className="text-sm font-medium mb-2">{label}</p>
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            type="number"
            min={0.001}
            step="any"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("quantityDeltaPlaceholder")}
          />
          {error && <p className="text-xs text-red-300">{error}</p>}
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? t("saving") : t("confirm")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// ─── MoveItemPopover ──────────────────────────────────────────────────────────

function MoveItemPopover({
  item,
  onUpdated,
}: {
  item: InventoryItemWithLocation;
  onUpdated: () => void;
}) {
  const t = useTranslations("Inventory");
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useState<Location | null>(
    item.location ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      setLocation(item.location ?? null);
      setError(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!location) {
      setError(t("errorLocationRequired"));
      return;
    }
    if (location.id === item.locationId) {
      setOpen(false);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "move", locationId: location.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || t("errorGeneric"));
        return;
      }
      onUpdated();
      setOpen(false);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          title={t("actionMove")}
        >
          <ArrowsRightLeftIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <p className="text-sm font-medium mb-2">{t("actionMove")}</p>
        <form onSubmit={handleSubmit} className="space-y-2">
          <LocationCombobox
            value={location}
            onChange={setLocation}
            placeholder={t("fieldLocationPlaceholder")}
          />
          {error && <p className="text-xs text-red-300">{error}</p>}
          <Button
            type="submit"
            size="sm"
            className="w-full"
            disabled={submitting}
          >
            {submitting ? t("saving") : t("confirm")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// ─── DeleteConfirmPopover ─────────────────────────────────────────────────────

function DeleteConfirmPopover({
  item,
  onDeleted,
}: {
  item: InventoryItemWithLocation;
  onDeleted: () => void;
}) {
  const t = useTranslations("Inventory");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await fetch(`/api/inventory/items/${item.id}`, { method: "DELETE" });
      onDeleted();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(ICON_BUTTON, "hover:bg-red-400/10 hover:text-red-300")}
          title={t("actionDelete")}
        >
          <TrashIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <p className="text-sm font-medium mb-1">{t("deleteConfirmTitle")}</p>
        <p className="text-xs mb-3">{t("deleteConfirmDescription")}</p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => setOpen(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="flex-1"
            disabled={submitting}
            onClick={handleDelete}
          >
            {submitting ? t("saving") : t("deleteConfirmConfirm")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── AddToPackagePopover ─────────────────────────────────────────────────────

function AddToPackagePopover({
  item,
  onAdd,
}: {
  item: InventoryItemWithLocation;
  onAdd: (quantity: number) => void;
}) {
  const t = useTranslations("Inventory");
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) {
      setError(t("errorQuantityInvalid"));
      return;
    }
    if (parsed > availableOf(item)) {
      setError(
        item.reserved
          ? t("errorQuantityExceedsAvailable", { available: availableOf(item) })
          : t("errorQuantityExceedsStock"),
      );
      return;
    }
    onAdd(parsed);
    setOpen(false);
    setValue("");
    setError(null);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setValue("");
          setError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          title={t("packageAdd")}
        >
          <ArchiveBoxIcon className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <p className="text-sm font-medium mb-2">{t("packageAdd")}</p>
        <form onSubmit={handleSubmit} className="space-y-2">
          <Input
            type="number"
            min={0.001}
            max={availableOf(item)}
            step="any"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("quantityDeltaPlaceholder")}
          />
          {error && <p className="text-xs text-red-300">{error}</p>}
          <Button type="submit" size="sm" className="w-full">
            {t("confirm")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

// ─── PackageSidebar ───────────────────────────────────────────────────────────

function PackageSidebar({
  items,
  onUpdate,
  onRefresh,
  onSent,
}: {
  items: PackageItem[];
  onUpdate: (items: PackageItem[]) => void;
  onRefresh: () => void;
  /** The package became a parcel: its code is to be shown. */
  onSent: (parcel: ParcelView) => void;
}) {
  const t = useTranslations("Inventory");
  const tParcels = useTranslations("Parcels");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveLocation, setMoveLocation] = useState<Location | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRemoveItem = (itemId: string) =>
    onUpdate(items.filter((pi) => pi.item.id !== itemId));

  const handleUpdateQty = (itemId: string, qty: number) =>
    onUpdate(
      items.map((pi) =>
        pi.item.id === itemId ? { ...pi, quantity: qty } : pi,
      ),
    );

  const handleSend = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await sendParcel(
        items.map((pi) => ({ itemId: pi.item.id, quantity: pi.quantity })),
      );
      if (!result.ok) {
        setError(
          tParcels(`error_${result.error}`, { item: result.item ?? "" }),
        );
        return;
      }
      onUpdate([]);
      onRefresh();
      onSent(result.parcel);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await packageOperate(
        items.map((pi) => ({ itemId: pi.item.id, quantity: pi.quantity })),
        { type: "delete" },
      );
      if (!result.ok) {
        setError(result.error || t("errorGeneric"));
        return;
      }
      onUpdate([]);
      onRefresh();
      setDeleteOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMove = async (e: FormEvent) => {
    e.preventDefault();
    if (!moveLocation) {
      setError(t("errorLocationRequired"));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await packageOperate(
        items.map((pi) => ({ itemId: pi.item.id, quantity: pi.quantity })),
        { type: "move", locationId: moveLocation.id },
      );
      if (!result.ok) {
        setError(result.error || t("errorGeneric"));
        return;
      }
      onUpdate([]);
      onRefresh();
      setMoveOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="w-72 shrink-0 sticky top-4 rounded-xl border border-[#9ED0FF]/25 bg-[#0A2A42] p-4 space-y-3 shadow-lg shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArchiveBoxIcon className="size-5 text-[#9ED0FF]" />
          <h2 className="font-semibold text-[#CCE7FF]">{t("packageTitle")}</h2>
          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-[#9ED0FF]/15 text-[#9ED0FF]">
            {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => onUpdate([])}
          className="text-xs text-[#7E9FB7] hover:text-[#CCE7FF] transition-colors"
        >
          {t("packageClear")}
        </button>
      </div>

      {/* Items */}
      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
        {items.map((pi) => (
          <div
            key={pi.item.id}
            className="flex items-center gap-2 text-sm py-1.5 border-b border-[#9ED0FF]/10 last:border-0"
          >
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-xs text-[#CCE7FF]">
                {pi.item.name}
                {pi.item.quality != null && (
                  <span className="ml-1.5 text-[#7E9FB7]">
                    Q{pi.item.quality}
                  </span>
                )}
              </p>
              {pi.item.location && (
                <p className="text-xs text-[#7E9FB7] truncate">
                  {pi.item.location.name}
                </p>
              )}
            </div>
            <Input
              type="number"
              min={0.001}
              max={availableOf(pi.item)}
              step="any"
              value={pi.quantity}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0) handleUpdateQty(pi.item.id, v);
              }}
              className="w-16 h-7 text-xs px-2"
            />
            {pi.item.unit && (
              <span className="text-xs text-[#7E9FB7] shrink-0">
                {pi.item.unit}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleRemoveItem(pi.item.id)}
              aria-label={t("packageRemoveItem")}
              className="text-[#7E9FB7] hover:text-red-300 transition-colors shrink-0"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}

      {/* Actions */}
      <div className="space-y-2 pt-2 border-t border-[#9ED0FF]/15">
        {/* Send to another player */}
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={submitting}
          onClick={handleSend}
        >
          <PaperAirplaneIcon className="size-4 mr-1.5" />
          {tParcels("send")}
        </Button>
        <p className="text-xs text-[#7E9FB7]">{tParcels("sendHint")}</p>

        {/* Delete */}
        <Popover
          open={deleteOpen}
          onOpenChange={(v) => {
            setDeleteOpen(v);
            if (!v) setError(null);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full text-red-300 hover:text-red-200 hover:border-red-300/60"
            >
              <TrashIcon className="size-4 mr-1.5" />
              {t("packageDelete")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="center">
            <p className="text-sm font-medium mb-1">
              {t("packageDeleteConfirmTitle")}
            </p>
            <p className="text-xs mb-3">
              {t("packageDeleteConfirmDescription")}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => setDeleteOpen(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="flex-1"
                disabled={submitting}
                onClick={handleDelete}
              >
                {submitting ? t("saving") : t("confirm")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Move */}
        <Popover
          open={moveOpen}
          onOpenChange={(v) => {
            setMoveOpen(v);
            if (!v) {
              setMoveLocation(null);
              setError(null);
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <ArrowsRightLeftIcon className="size-4 mr-1.5" />
              {t("packageMove")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3" align="center">
            <p className="text-sm font-medium mb-2">{t("packageMoveTitle")}</p>
            <form onSubmit={handleMove} className="space-y-2">
              <LocationCombobox
                value={moveLocation}
                onChange={setMoveLocation}
                placeholder={t("fieldLocationPlaceholder")}
              />
              {error && <p className="text-xs text-red-300">{error}</p>}
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? t("saving") : t("confirm")}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  );
}

// ─── Grouping ─────────────────────────────────────────────────────────────────

/**
 * The same thing held at the same place, in the same unit: one card. Each
 * quality stays its own lot inside it — Sadaryx at 688, 510 and 256 is one
 * card of three lots, not three cards that look alike.
 */
export type ItemGroup<
  T extends InventoryItemWithLocation = InventoryItemWithLocation,
> = {
  key: string;
  name: string;
  unit?: string;
  lots: T[];
};

export type LocationSection<
  T extends InventoryItemWithLocation = InventoryItemWithLocation,
> = {
  key: string;
  location: Location | null;
  groups: ItemGroup<T>[];
  /** Cards, not lots: what the reader sees. */
  count: number;
  /** Sum of what is counted in SCU there, when anything is. */
  scu: number;
};

const NO_LOCATION = "none";

function locationKey(item: InventoryItemWithLocation) {
  return item.location?.id ?? NO_LOCATION;
}

export function groupByLocation<T extends InventoryItemWithLocation>(
  items: T[],
): LocationSection<T>[] {
  const sections = new Map<string, LocationSection<T>>();

  for (const item of items) {
    const key = locationKey(item);
    let section = sections.get(key);
    if (!section) {
      section = { key, location: item.location, groups: [], count: 0, scu: 0 };
      sections.set(key, section);
    }
    if (item.unit?.trim().toLowerCase() === "scu") section.scu += item.quantity;

    const groupKey = `${item.name.trim().toLowerCase()}|${(item.unit ?? "").trim().toLowerCase()}`;
    let group = section.groups.find((g) => g.key === groupKey);
    if (!group) {
      group = { key: groupKey, name: item.name, unit: item.unit, lots: [] };
      section.groups.push(group);
      section.count += 1;
    }
    group.lots.push(item);
  }

  for (const section of sections.values()) {
    for (const group of section.groups) {
      group.lots.sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
    }
  }

  // Places by name; a missing place last.
  return [...sections.values()].sort((a, b) => {
    if (!a.location) return 1;
    if (!b.location) return -1;
    return a.location.name.localeCompare(b.location.name);
  });
}

// ─── QualityBadge ─────────────────────────────────────────────────────────────

/** Out of 1000: gold from 700, blue from 500, grey below. */
function qualityTier(quality: number) {
  if (quality >= 700) {
    return { pill: "bg-amber-400/12 text-amber-300", bar: "bg-amber-300" };
  }
  if (quality >= 500) {
    return { pill: "bg-[#9ED0FF]/12 text-[#9ED0FF]", bar: "bg-[#9ED0FF]" };
  }
  return { pill: "bg-[#7E9FB7]/15 text-[#A9BFD0]", bar: "bg-[#A9BFD0]" };
}

export function QualityBadge({ quality }: { quality: number }) {
  const t = useTranslations("Inventory");
  const tier = qualityTier(quality);

  return (
    <span
      className="flex items-center gap-2"
      title={t("qualityTitle", { quality })}
    >
      <span
        className={cn(
          "rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
          tier.pill,
        )}
      >
        Q {quality}
      </span>
      <span
        aria-hidden
        className="h-1 w-12 overflow-hidden rounded-full bg-[#9ED0FF]/12"
      >
        <span
          className={cn("block h-full rounded-full", tier.bar)}
          style={{ width: `${Math.min(100, Math.max(0, quality / 10))}%` }}
        />
      </span>
    </span>
  );
}

// ─── InventoryGroupCard ───────────────────────────────────────────────────────

function InventoryGroupCard({
  group,
  packaged,
  onRefresh,
  onAddToPackage,
}: {
  group: ItemGroup;
  packaged: Map<string, number>;
  onRefresh: () => void;
  onAddToPackage: (item: InventoryItemWithLocation, quantity: number) => void;
}) {
  const t = useTranslations("Inventory");
  const locale = useLocale();
  const [editing, setEditing] = useState<InventoryItemWithLocation | null>(
    null,
  );
  const [activeId, setActiveId] = useState(group.lots[0].id);
  const [orgVisible, setOrgVisible] = useState<Record<string, boolean>>({});
  const [orgPending, setOrgPending] = useState(false);

  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  const multi = group.lots.length > 1;
  // The lot the footer acts on: the one picked, or the first if it is gone.
  const active = group.lots.find((lot) => lot.id === activeId) ?? group.lots[0];
  const total = roundQty(group.lots.reduce((sum, lot) => sum + lot.quantity, 0));
  const latest = group.lots.reduce((a, b) =>
    a.updatedAt > b.updatedAt ? a : b,
  );

  const visible = (lot: InventoryItemWithLocation) =>
    orgVisible[lot.id] ?? lot.orgVisible;
  const allVisible = group.lots.every(visible);
  const someVisible = group.lots.some(visible);

  const handleToggleOrgVisible = async () => {
    const next = !allVisible;
    const before = orgVisible;
    setOrgVisible(Object.fromEntries(group.lots.map((lot) => [lot.id, next])));
    setOrgPending(true);
    try {
      const results = await Promise.all(
        group.lots.map((lot) =>
          fetch(`/api/inventory/items/${lot.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ op: "setOrgVisible", orgVisible: next }),
          }),
        ),
      );
      if (results.some((res) => !res.ok)) setOrgVisible(before);
    } catch {
      setOrgVisible(before);
    } finally {
      setOrgPending(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-[#9ED0FF]/12 bg-[#0A2A42] p-4 pb-2.5 transition-colors hover:border-[#9ED0FF]/35">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold break-words text-[#CCE7FF]">
            {group.name}
          </h3>
          <p className="mt-1 text-xs text-[#7E9FB7]">
            {multi && <>{t("lotsCount", { count: group.lots.length })} · </>}
            {t("updatedAt", { date: date.format(new Date(latest.updatedAt)) })}
          </p>
        </div>
        <p className="shrink-0 text-right leading-none whitespace-nowrap">
          <span className="font-mono text-xl font-bold tracking-tight text-[#9ED0FF] tabular-nums">
            ×{number.format(total)}
          </span>
          {group.unit && (
            <span className="ml-1 text-xs font-semibold text-[#7E9FB7]">
              {group.unit}
            </span>
          )}
        </p>
      </header>

      {!multi && active.description && (
        <p className="line-clamp-2 text-xs text-[#A9BFD0]">
          {active.description}
        </p>
      )}

      <ul className="space-y-0.5">
        {group.lots.map((lot) => {
          const inPackage = packaged.get(lot.id);
          const detail = (
            <>
              {lot.quality != null ? (
                <QualityBadge quality={lot.quality} />
              ) : (
                <span className="text-xs text-[#7E9FB7]">{t("noQuality")}</span>
              )}
              {lot.reserved !== undefined && (
                <span
                  className="flex items-center gap-1 text-xs text-amber-300"
                  title={t("reservedInParcel", {
                    quantity: number.format(lot.reserved),
                  })}
                >
                  <PaperAirplaneIcon className="size-3.5" aria-hidden />
                  <span className="sr-only">
                    {t("reservedInParcel", {
                      quantity: number.format(lot.reserved),
                    })}
                  </span>
                </span>
              )}
              {inPackage !== undefined && (
                <span
                  className="flex items-center gap-1 text-xs text-[#9ED0FF]"
                  title={t("inPackage", {
                    quantity: number.format(inPackage),
                  })}
                >
                  <ArchiveBoxIcon className="size-3.5" aria-hidden />
                  <span className="sr-only">
                    {t("inPackage", { quantity: number.format(inPackage) })}
                  </span>
                </span>
              )}
              <span className="flex-1" />
              {multi && (
                <span className="font-mono text-[13px] font-semibold text-[#C9E4FF] tabular-nums">
                  ×{number.format(lot.quantity)}
                </span>
              )}
            </>
          );

          return (
            <li
              key={lot.id}
              className={cn(
                "-mx-1.5 flex min-h-8 items-center gap-1 rounded-lg px-1.5",
                multi && lot.id === active.id && "bg-[#9ED0FF]/8",
              )}
            >
              {multi ? (
                <button
                  type="button"
                  onClick={() => setActiveId(lot.id)}
                  aria-pressed={lot.id === active.id}
                  title={t("lotSelect")}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left"
                >
                  {detail}
                </button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2 py-1">
                  {detail}
                </div>
              )}
              <AdjustQuantityPopover
                item={lot}
                mode="remove"
                onUpdated={onRefresh}
              />
              <AdjustQuantityPopover item={lot} mode="add" onUpdated={onRefresh} />
            </li>
          );
        })}
      </ul>

      <footer className="mt-auto flex items-center gap-0.5 border-t border-[#9ED0FF]/10 pt-2">
        <label className="flex flex-1 cursor-pointer items-center gap-2 text-[13px] text-[#C9E4FF]">
          <input
            type="checkbox"
            checked={allVisible}
            ref={(el) => {
              if (el) el.indeterminate = someVisible && !allVisible;
            }}
            disabled={orgPending}
            onChange={handleToggleOrgVisible}
            className="size-3.5 accent-[#9ED0FF]"
          />
          {t("orgVisibleShort")}
        </label>
        <AddToPackagePopover
          item={active}
          onAdd={(qty) => onAddToPackage(active, qty)}
        />
        <MoveItemPopover item={active} onUpdated={onRefresh} />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={ICON_BUTTON}
          title={t("actionEdit")}
          aria-label={t("actionEdit")}
          onClick={() => setEditing(active)}
        >
          <PencilIcon className="size-3.5" />
        </Button>
        <DeleteConfirmPopover item={active} onDeleted={onRefresh} />
      </footer>

      {editing && (
        <EditItemDialog
          item={editing}
          onClose={() => setEditing(null)}
          onUpdated={() => {
            onRefresh();
            setEditing(null);
          }}
        />
      )}
    </article>
  );
}

// ─── InventoryGrid ────────────────────────────────────────────────────────────

export function InventoryGrid() {
  const t = useTranslations("Inventory");
  const locale = useLocale();

  const [items, setItems] = useState<InventoryItemWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [packageItems, setPackageItems] = useState<PackageItem[]>([]);
  const [sentParcel, setSentParcel] = useState<ParcelView | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  // A parcel link (`/inventory?parcel=K7QM2X9A`) opens the receiving dialog
  // with its code in; the address is cleaned, so a reload does not reopen it.
  const linkedCode = searchParams.get(PARCEL_PARAM) ?? undefined;
  const [receiveOpen, setReceiveOpen] = useState(linkedCode !== undefined);
  const [receiveCode, setReceiveCode] = useState(linkedCode);
  useEffect(() => {
    if (linkedCode === undefined) return;
    setReceiveCode(linkedCode);
    setReceiveOpen(true);
    router.replace("/inventory", { scroll: false });
  }, [linkedCode, router]);

  const handleAddToPackage = useCallback(
    (item: InventoryItemWithLocation, quantity: number) => {
      setPackageItems((prev) => {
        const existing = prev.find((pi) => pi.item.id === item.id);
        if (existing) {
          // Accumulate, capped to available stock
          const newQty = Math.min(
            existing.quantity + quantity,
            availableOf(item),
          );
          return prev.map((pi) =>
            pi.item.id === item.id ? { ...pi, quantity: newQty } : pi,
          );
        }
        return [...prev, { item, quantity }];
      });
    },
    [],
  );

  const debouncedQuery = useDebounce(searchQuery, 300);
  const debouncedQuality = useDebounce(qualityFilter, 300);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("query", debouncedQuery);
      if (debouncedQuality.trim()) params.set("quality", debouncedQuality.trim());

      const res = await fetch(`/api/inventory/items?${params.toString()}`);
      if (!res.ok) return;
      const data: InventoryItemWithLocation[] = await res.json();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, debouncedQuality]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const sections = useMemo(() => groupByLocation(items), [items]);
  const shown =
    locationFilter === "all"
      ? sections
      : sections.filter((section) => section.key === locationFilter);

  const packaged = useMemo(
    () => new Map(packageItems.map((pi) => [pi.item.id, pi.quantity])),
    [packageItems],
  );

  const number = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }),
    [locale],
  );

  const chips = [
    {
      key: "all",
      label: t("filterAll"),
      count: sections.reduce((sum, section) => sum + section.count, 0),
    },
    ...sections.map((section) => ({
      key: section.key,
      label: section.location?.name ?? t("locationUnknown"),
      count: section.count,
    })),
  ];

  return (
    <div className="flex gap-6 items-start">
      <div className="flex-1 min-w-0 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap gap-2.5 items-center">
          <label className="relative flex-1 min-w-48">
            <span className="sr-only">{t("searchPlaceholder")}</span>
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#7E9FB7] pointer-events-none" />
            <Input
              className="h-10 pl-9 bg-[#0A2A42] border-[#9ED0FF]/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
            />
          </label>

          <label className="flex h-10 items-center gap-2 rounded-md border border-[#9ED0FF]/20 bg-[#0A2A42] pl-3 pr-1.5 text-sm">
            <span className="text-[#7E9FB7] whitespace-nowrap">
              {t("filterQualityLabel")}
            </span>
            <Input
              type="number"
              min={0}
              step={1}
              value={qualityFilter}
              onChange={(e) => setQualityFilter(e.target.value)}
              placeholder="0"
              className="h-7 w-16 px-2 font-mono text-sm"
            />
            {qualityFilter && (
              <button
                type="button"
                onClick={() => setQualityFilter("")}
                aria-label={t("filterQualityClear")}
                className="text-[#7E9FB7] hover:text-[#CCE7FF]"
              >
                <XMarkIcon className="size-4" />
              </button>
            )}
          </label>

          <Button
            onClick={() => setShowAddDialog(true)}
            variant="outline"
            className="h-10 border-[#9ED0FF]/35 bg-transparent"
          >
            <PlusIcon className="size-4" />
            {t("addItemButton")}
          </Button>
          <Button asChild className="h-10">
            <Link href="/inventory/quick-add">
              <TableCellsIcon className="size-4" />
              {t("quickAddButton")}
            </Link>
          </Button>
          <Button
            variant="outline"
            className="h-10 border-[#9ED0FF]/35 bg-transparent"
            onClick={() => {
              setReceiveCode(undefined);
              setReceiveOpen(true);
            }}
          >
            <ArrowDownTrayIcon className="size-4" />
            {t("receiveParcel")}
          </Button>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            title={t("parcelsLink")}
          >
            <Link href="/inventory/parcels" aria-label={t("parcelsLink")}>
              <InboxStackIcon className="size-5" />
            </Link>
          </Button>
        </div>

        {/* Places */}
        {!loading && items.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => {
              const on = locationFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setLocationFilter(chip.key)}
                  className={cn(
                    "flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition-colors",
                    on
                      ? "border-[#9ED0FF] bg-[#9ED0FF] font-semibold text-[#061E30]"
                      : "border-[#9ED0FF]/25 text-[#C9E4FF] hover:border-[#9ED0FF]/55",
                  )}
                >
                  {chip.label}
                  <span className="font-mono text-xs opacity-70">
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-36 rounded-xl animate-pulse bg-[#0A2A42]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <CubeIcon className="size-10 mx-auto mb-3 text-[#7E9FB7]" />
            <p className="font-medium">{t("emptyTitle")}</p>
            <p className="text-sm mt-1 text-[#7E9FB7]">{t("emptySubtitle")}</p>
          </div>
        ) : (
          <div className="space-y-7">
            {shown.map((section) => (
              <section key={section.key} className="space-y-3">
                <div className="flex items-center gap-2.5">
                  <MapPinIcon className="size-4 shrink-0 text-[#7E9FB7]" />
                  <h2 className="text-[15px] font-semibold text-[#CCE7FF]">
                    {section.location?.name ?? t("locationUnknown")}
                  </h2>
                  <span className="font-mono text-xs text-[#7E9FB7]">
                    {t("sectionCount", { count: section.count })}
                    {section.scu > 0 &&
                      ` · ${number.format(roundQty(section.scu))} SCU`}
                  </span>
                  <span className="h-px flex-1 bg-[#9ED0FF]/12" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
                  {section.groups.map((group) => (
                    <InventoryGroupCard
                      key={group.key + group.lots.map((l) => l.id).join()}
                      group={group}
                      packaged={packaged}
                      onRefresh={fetchItems}
                      onAddToPackage={handleAddToPackage}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        <AddItemDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onCreated={fetchItems}
        />
      </div>
      {/* end main column */}

      {packageItems.length > 0 && (
        <PackageSidebar
          items={packageItems}
          onUpdate={setPackageItems}
          onRefresh={fetchItems}
          onSent={setSentParcel}
        />
      )}

      <SentParcelDialog
        parcel={sentParcel}
        onClose={() => setSentParcel(null)}
        onCancelled={fetchItems}
      />
      <ReceiveParcelDialog
        open={receiveOpen}
        initialCode={receiveCode}
        onOpenChange={setReceiveOpen}
        onReceived={fetchItems}
      />
    </div>
  );
}

// ─── useDebounce ──────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
