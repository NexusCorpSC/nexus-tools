"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CONTAINER_SIZES,
  ContainerSize,
  CUSTOM_TRANSPORT_ID,
  isContainerSize,
  LOW_CAPACITY_THRESHOLD,
  Transport,
} from "@/lib/cargo";

interface ManifestToolbarProps {
  transports: Transport[];
  transportId: string;
  customCapacity: number;
  capacity: number;
  maxContainer: ContainerSize;
  usedVolume: number;
  onTransportChange: (transportId: string) => void;
  onCustomCapacityChange: (capacity: number) => void;
  onMaxContainerChange: (maxContainer: ContainerSize) => void;
}

export default function ManifestToolbar({
  transports,
  transportId,
  customCapacity,
  capacity,
  maxContainer,
  usedVolume,
  onTransportChange,
  onCustomCapacityChange,
  onMaxContainerChange,
}: ManifestToolbarProps) {
  const t = useTranslations("Cargo");

  const remaining = capacity - usedVolume;
  const fillRatio = capacity > 0 ? (usedVolume / capacity) * 100 : 0;

  const remainingTone =
    remaining < 0
      ? "text-red-400"
      : remaining <= LOW_CAPACITY_THRESHOLD
        ? "text-amber-300"
        : "text-emerald-400";

  const barTone =
    remaining < 0
      ? "bg-red-500"
      : remaining <= LOW_CAPACITY_THRESHOLD
        ? "bg-amber-400"
        : "bg-emerald-500";

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="cargo-transport">{t("transport")}</Label>
        <Select value={transportId} onValueChange={onTransportChange}>
          <SelectTrigger id="cargo-transport">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {transports.map((transport) => (
              <SelectItem key={transport.id} value={transport.id}>
                {transport.name} — {transport.capacity} SCU
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_TRANSPORT_ID}>{t("custom")}</SelectItem>
          </SelectContent>
        </Select>

        {transportId === CUSTOM_TRANSPORT_ID && (
          <Input
            aria-label={t("customCapacity")}
            className="mt-2"
            type="number"
            min={1}
            step={1}
            value={customCapacity}
            onChange={(event) => {
              const value = Number(event.target.value);
              onCustomCapacityChange(
                Number.isFinite(value) && value > 0 ? Math.floor(value) : 0,
              );
            }}
            placeholder={t("customCapacity")}
          />
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="cargo-max-container">{t("maxContainer")}</Label>
        <Select
          value={String(maxContainer)}
          onValueChange={(value) => {
            const size = Number(value);
            if (isContainerSize(size)) {
              onMaxContainerChange(size);
            }
          }}
        >
          <SelectTrigger id="cargo-max-container">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CONTAINER_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} SCU
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-[#9ED0FF]/60">{t("maxContainerHint")}</p>
      </div>

      <div className="space-y-1">
        <span className="text-sm font-medium">{t("capacity")}</span>
        <p className="text-sm">
          <span className={`text-lg font-semibold ${remainingTone}`}>
            {remaining}
          </span>{" "}
          <span className="text-[#9ED0FF]/70">
            {t("remaining", { capacity })}
          </span>
        </p>
        <div
          className="h-2 w-full overflow-hidden rounded-full bg-[#0B3A5A]"
          role="progressbar"
          aria-valuenow={Math.round(fillRatio)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("capacity")}
        >
          <div
            className={`h-full rounded-full transition-all ${barTone}`}
            style={{ width: `${Math.min(100, Math.max(0, fillRatio))}%` }}
          />
        </div>
        <p className="text-xs text-[#9ED0FF]/60">
          {t("loaded", { used: usedVolume, capacity })}
        </p>
      </div>
    </div>
  );
}
