"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  FormEvent,
} from "react";
import { useTranslations } from "next-intl";
import { InventoryItemWithLocation, Location } from "@/types/inventory";
import {
  MagnifyingGlassIcon,
  PlusIcon,
  XMarkIcon,
  MapPinIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

// ─── LocationCombobox ────────────────────────────────────────────────────────

function LocationCombobox({
  value,
  onChange,
  placeholder,
}: {
  value: Location | null;
  onChange: (loc: Location) => void;
  placeholder: string;
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
        `/api/inventory/locations?query=${encodeURIComponent(query)}`
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
    (s) => s.name.toLowerCase() === inputValue.trim().toLowerCase()
  );

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => {
          setInputValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (inputValue.length > 0 || suggestions.length > 0) && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-52 overflow-auto">
          {suggestions.map((loc) => (
            <button
              key={loc.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(loc);
                setInputValue(loc.name);
                setOpen(false);
              }}
            >
              <MapPinIcon className="size-4 text-gray-400 shrink-0" />
              <span>{loc.name}</span>
              {loc.userId && (
                <span className="ml-auto text-xs text-gray-400">
                  {t("locationPersonal")}
                </span>
              )}
            </button>
          ))}
          {inputValue.trim() && !exactMatch && (
            <button
              type="button"
              disabled={creating}
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 flex items-center gap-2 border-t border-gray-100"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleCreateLocation}
            >
              <PlusIcon className="size-4 shrink-0" />
              {t("locationCreate", { name: inputValue.trim() })}
            </button>
          )}
          {suggestions.length === 0 && !inputValue.trim() && (
            <p className="px-3 py-2 text-sm text-gray-500">
              {t("locationEmpty")}
            </p>
          )}
        </div>
      )}
    </div>
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setDescription("");
    setQuality("");
    setQuantity("");
    setUnit("");
    setLocation(null);
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
    if (parsedQuality !== undefined && (isNaN(parsedQuality) || parsedQuality < 0)) {
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
          {/* Name */}
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

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="item-description">
              {t("fieldDescription")}{" "}
              <span className="text-gray-400 font-normal">
                ({t("optional")})
              </span>
            </Label>
            <Textarea
              id="item-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder={t("fieldDescriptionPlaceholder")}
            />
          </div>

          {/* Quality + Quantity + Unit */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-quality">
                {t("fieldQuality")}{" "}
                <span className="text-gray-400 font-normal text-xs">
                  ({t("optional")})
                </span>
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
                <span className="text-gray-400 font-normal text-xs">
                  ({t("optional")})
                </span>
              </Label>
              <Input
                id="item-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={t("fieldUnitPlaceholder")}
              />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label>{t("fieldLocation")}</Label>
            <LocationCombobox
              value={location}
              onChange={setLocation}
              placeholder={t("fieldLocationPlaceholder")}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

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

// ─── InventoryItemCard ────────────────────────────────────────────────────────

function InventoryItemCard({ item }: { item: InventoryItemWithLocation }) {
  const t = useTranslations("Inventory");
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <CubeIcon className="size-5 text-gray-400 shrink-0" />
          <h3 className="font-semibold text-gray-900 truncate">{item.name}</h3>
        </div>
        {item.quality !== undefined && item.quality !== null && (
          <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
            {t("qualityLabel")}: {item.quality}
          </span>
        )}
      </div>

      {item.description && (
        <p className="text-sm text-gray-500 line-clamp-2">{item.description}</p>
      )}

      <div className="flex items-center justify-between text-sm pt-1">
        <span className="font-medium text-gray-800">
          {item.quantity}
          {item.unit ? ` ${item.unit}` : ""}
        </span>
        {item.location ? (
          <span className="flex items-center gap-1 text-gray-500">
            <MapPinIcon className="size-3.5" />
            {item.location.name}
          </span>
        ) : (
          <span className="text-gray-400 italic text-xs">
            {t("locationUnknown")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── InventoryGrid ────────────────────────────────────────────────────────────

export function InventoryGrid() {
  const t = useTranslations("Inventory");

  const [items, setItems] = useState<InventoryItemWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [qualityFilter, setQualityFilter] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const debouncedQuery = useDebounce(searchQuery, 300);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("query", debouncedQuery);
      if (locationFilter !== "all") params.set("locationId", locationFilter);
      if (qualityFilter.trim()) params.set("quality", qualityFilter.trim());

      const res = await fetch(`/api/inventory/items?${params.toString()}`);
      if (!res.ok) return;
      const data: InventoryItemWithLocation[] = await res.json();
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, locationFilter, qualityFilter]);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/inventory/locations");
      if (!res.ok) return;
      const data: Location[] = await res.json();
      setLocations(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400 pointer-events-none" />
          <Input
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </div>

        {/* Location filter */}
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filterAllLocations")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filterAllLocations")}</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={loc.id}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Quality filter */}
        <div className="relative w-36">
          <Input
            type="number"
            min={0}
            step={1}
            value={qualityFilter}
            onChange={(e) => setQualityFilter(e.target.value)}
            placeholder={t("filterQualityPlaceholder")}
          />
          {qualityFilter && (
            <button
              type="button"
              onClick={() => setQualityFilter("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="size-4" />
            </button>
          )}
        </div>

        {/* Add button */}
        <Button onClick={() => setShowAddDialog(true)} size="sm">
          <PlusIcon className="size-4 mr-1.5" />
          {t("addItemButton")}
        </Button>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-sm text-gray-500">
          {t("resultsCount", { count: items.length })}
        </p>
      )}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-gray-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <CubeIcon className="size-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium">{t("emptyTitle")}</p>
          <p className="text-sm mt-1">{t("emptySubtitle")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <InventoryItemCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <AddItemDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onCreated={() => {
          fetchItems();
          fetchLocations();
        }}
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
