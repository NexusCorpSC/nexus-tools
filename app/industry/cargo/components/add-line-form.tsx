"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONTAINER_SIZES,
  ContainerSize,
  containerCount,
  MAX_VOLUME,
  splitVolume,
} from "@/lib/cargo";

export interface NewCargoLine {
  destination: string;
  content: string;
  location: string;
  volume: number;
}

interface AddLineFormProps {
  maxContainer: ContainerSize;
  onAdd: (line: NewCargoLine) => void;
}

export default function AddLineForm({ maxContainer, onAdd }: AddLineFormProps) {
  const t = useTranslations("Cargo");
  const [destination, setDestination] = useState("");
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [volume, setVolume] = useState("");

  const parsedVolume = Number(volume);
  const isVolumeValid =
    volume.trim() !== "" &&
    Number.isFinite(parsedVolume) &&
    parsedVolume > 0 &&
    parsedVolume <= MAX_VOLUME;

  const preview = isVolumeValid
    ? splitVolume(parsedVolume, maxContainer)
    : null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!destination.trim() || !isVolumeValid) {
      return;
    }

    onAdd({
      destination: destination.trim(),
      content: content.trim(),
      location: location.trim(),
      volume: Math.floor(parsedVolume),
    });

    // Destination and location usually stay the same for consecutive drops.
    setContent("");
    setVolume("");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="cargo-destination">{t("destination")}</Label>
          <Input
            id="cargo-destination"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            placeholder={t("destinationPlaceholder")}
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="cargo-content">{t("content")}</Label>
          <Input
            id="cargo-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder={t("contentPlaceholder")}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="cargo-volume">{t("volume")}</Label>
          <Input
            id="cargo-volume"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_VOLUME}
            step={1}
            value={volume}
            onChange={(event) => setVolume(event.target.value)}
            placeholder="128"
            required
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="cargo-location">{t("location")}</Label>
          <Input
            id="cargo-location"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder={t("locationPlaceholder")}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#9ED0FF]/70">
          {preview ? (
            <>
              <span className="font-medium text-[#C9E4FF]">
                {t("boxes", { count: containerCount(preview) })}
              </span>{" "}
              {preview
                .map((quantity, index) =>
                  quantity > 0
                    ? `${quantity} × ${CONTAINER_SIZES[index]}`
                    : null,
                )
                .filter(Boolean)
                .join(" · ")}
            </>
          ) : (
            t("splitHint", { max: maxContainer })
          )}
        </p>

        <Button type="submit" disabled={!destination.trim() || !isVolumeValid}>
          {t("addLine")}
        </Button>
      </div>
    </form>
  );
}
