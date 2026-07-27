"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTAINER_SIZES,
  ContainerSize,
  containerCount,
  MAX_VOLUME,
  ParsedBulkLine,
  splitVolume,
} from "@/lib/cargo";
import { parseQuickEntry } from "@/lib/mission-objectives";
import ScreenshotImportDialog from "./screenshot-import-dialog";

export interface NewCargoLine {
  destination: string;
  content: string;
  location: string;
  mission: string;
  volume: number;
}

interface AddLineFormProps {
  maxContainer: ContainerSize;
  /** Mission given to entries that leave the field empty. */
  currentMission: string;
  onAdd: (line: NewCargoLine) => void;
  onAddMany: (lines: ParsedBulkLine[]) => void;
  onNewMission: () => void;
}

export default function AddLineForm({
  maxContainer,
  currentMission,
  onAdd,
  onAddMany,
  onNewMission,
}: AddLineFormProps) {
  const t = useTranslations("Cargo");
  const [destination, setDestination] = useState("");
  const [content, setContent] = useState("");
  const [location, setLocation] = useState("");
  const [mission, setMission] = useState("");
  const [volume, setVolume] = useState("");
  const [quick, setQuick] = useState("");

  const parsedVolume = Number(volume);
  const isVolumeValid =
    volume.trim() !== "" &&
    Number.isFinite(parsedVolume) &&
    parsedVolume > 0 &&
    parsedVolume <= MAX_VOLUME;

  const preview = isVolumeValid
    ? splitVolume(parsedVolume, maxContainer)
    : null;

  const quickParse = parseQuickEntry(quick);
  const canSubmitQuick = quickParse.parsed.length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!destination.trim() || !isVolumeValid) {
      return;
    }

    onAdd({
      destination: destination.trim(),
      content: content.trim(),
      location: location.trim(),
      mission: mission.trim(),
      volume: Math.floor(parsedVolume),
    });

    // Destination, location and mission usually stay the same for
    // consecutive drops.
    setContent("");
    setVolume("");
  }

  function submitQuick() {
    if (!canSubmitQuick) {
      return;
    }

    onAddMany(quickParse.parsed);
    setQuick("");
  }

  function handleQuickKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends the line, Shift+Enter keeps typing a second one.
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitQuick();
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="cargo-quick">{t("quickEntry")}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Textarea
            id="cargo-quick"
            value={quick}
            onChange={(event) => setQuick(event.target.value)}
            onKeyDown={handleQuickKeyDown}
            rows={2}
            spellCheck={false}
            className="font-mono text-sm"
            placeholder={t("bulkFormat")}
          />
          <div className="flex gap-2 sm:flex-col sm:self-end">
            <Button
              type="button"
              onClick={submitQuick}
              disabled={!canSubmitQuick}
            >
              {t("quickAdd")}
            </Button>
            <ScreenshotImportDialog onImport={setQuick} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9ED0FF]/60">
          <p>
            {t("quickEntryHint")}
            {quickParse.source === "objectives" && (
              <span className="ml-2 text-emerald-300">
                {t("screenshotObjectives", { count: quickParse.parsed.length })}
              </span>
            )}
            {quickParse.invalid.length > 0 && (
              <span className="ml-2 text-red-400">
                {t("bulkInvalid", { count: quickParse.invalid.length })}
              </span>
            )}
          </p>

          <div className="flex items-center gap-2">
            <span>
              {t("currentMission")}{" "}
              <span className="font-medium text-[#C9E4FF]">
                {currentMission}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onNewMission}
            >
              {t("newMission")}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs text-[#9ED0FF]/50">
        <span className="h-px flex-1 bg-[#9ED0FF]/15" />
        {t("or")}
        <span className="h-px flex-1 bg-[#9ED0FF]/15" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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

          <div className="space-y-1">
            <Label htmlFor="cargo-mission">{t("mission")}</Label>
            <Input
              id="cargo-mission"
              value={mission}
              onChange={(event) => setMission(event.target.value)}
              placeholder={currentMission}
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

          <Button
            type="submit"
            disabled={!destination.trim() || !isVolumeValid}
          >
            {t("addLine")}
          </Button>
        </div>
      </form>
    </div>
  );
}
