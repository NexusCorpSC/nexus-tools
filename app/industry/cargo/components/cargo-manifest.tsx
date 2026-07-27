"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { XMarkIcon } from "@heroicons/react/16/solid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  CargoLine,
  ContainerSize,
  CUSTOM_TRANSPORT_ID,
  getTransport,
  linesToCsv,
  ParsedBulkLine,
  splitVolume,
  totalVolume,
} from "@/lib/cargo";
import {
  getManifestServerSnapshot,
  getManifestSnapshot,
  subscribeToManifest,
  updateManifest,
} from "../storage";
import AddLineForm, { NewCargoLine } from "./add-line-form";
import BulkImportDialog from "./bulk-import-dialog";
import ManifestTable from "./manifest-table";
import ManifestToolbar from "./manifest-toolbar";

function buildLine(
  input: NewCargoLine,
  maxContainer: ContainerSize,
): CargoLine {
  return {
    id: nanoid(),
    destination: input.destination,
    content: input.content,
    location: input.location,
    volume: input.volume,
    maxContainer,
    quantities: splitVolume(input.volume, maxContainer),
  };
}

function distinct(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export default function CargoManifest() {
  const t = useTranslations("Cargo");

  // The manifest lives in the browser: it is a scratchpad, not shared data.
  const state = useSyncExternalStore(
    subscribeToManifest,
    getManifestSnapshot,
    getManifestServerSnapshot,
  );

  const capacity =
    state.transportId === CUSTOM_TRANSPORT_ID
      ? state.customCapacity
      : (getTransport(state.transportId)?.capacity ?? 0);

  const usedVolume = useMemo(() => totalVolume(state.lines), [state.lines]);

  const destinations = useMemo(
    () => distinct(state.lines.map((line) => line.destination)),
    [state.lines],
  );

  const locations = useMemo(
    () => distinct(state.lines.map((line) => line.location)),
    [state.lines],
  );

  function addLine(input: NewCargoLine) {
    updateManifest((current) => ({
      ...current,
      lines: [...current.lines, buildLine(input, current.maxContainer)],
    }));
  }

  function importLines(imported: ParsedBulkLine[]) {
    updateManifest((current) => ({
      ...current,
      lines: [
        ...current.lines,
        ...imported.map((line) => buildLine(line, current.maxContainer)),
      ],
    }));

    toast.success(t("bulkImportedTitle"), {
      description: t("bulkImportedDescription", { count: imported.length }),
    });
  }

  function deleteLine(id: string) {
    updateManifest((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    }));
  }

  function deleteByDestination(destination: string) {
    updateManifest((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.destination !== destination),
    }));
  }

  function deleteByLocation(location: string) {
    updateManifest((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.location !== location),
    }));
  }

  /** Re-splits every existing line with the currently selected maximum. */
  function recomputeAll() {
    updateManifest((current) => ({
      ...current,
      lines: current.lines.map((line) => ({
        ...line,
        maxContainer: current.maxContainer,
        quantities: splitVolume(line.volume, current.maxContainer),
      })),
    }));

    toast.success(t("recomputedTitle"), {
      description: t("recomputedDescription", { max: state.maxContainer }),
    });
  }

  function reset() {
    updateManifest((current) => ({ ...current, lines: [] }));
  }

  function exportCsv() {
    const blob = new Blob([linesToCsv(state.lines)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cargo-manifest.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="bg-nexus space-y-4 rounded-lg p-4">
        <ManifestToolbar
          transportId={state.transportId}
          customCapacity={state.customCapacity}
          capacity={capacity}
          maxContainer={state.maxContainer}
          usedVolume={usedVolume}
          onTransportChange={(transportId) =>
            updateManifest((current) => ({ ...current, transportId }))
          }
          onCustomCapacityChange={(customCapacity) =>
            updateManifest((current) => ({ ...current, customCapacity }))
          }
          onMaxContainerChange={(maxContainer) =>
            updateManifest((current) => ({ ...current, maxContainer }))
          }
        />
      </div>

      <div className="bg-nexus space-y-4 rounded-lg p-4">
        <h2 className="text-xl font-semibold">{t("addLine")}</h2>
        <AddLineForm maxContainer={state.maxContainer} onAdd={addLine} />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">{t("manifest")}</h2>

          <div className="flex flex-wrap gap-2">
            <BulkImportDialog onImport={importLines} />

            <Button
              type="button"
              variant="outline"
              onClick={recomputeAll}
              disabled={state.lines.length === 0}
            >
              {t("recompute")}
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={exportCsv}
              disabled={state.lines.length === 0}
            >
              {t("exportCsv")}
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={state.lines.length === 0}
                >
                  {t("reset")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("resetTitle")}</DialogTitle>
                  <DialogDescription>
                    {t("resetDescription", { count: state.lines.length })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      {t("cancel")}
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button type="button" variant="destructive" onClick={reset}>
                      {t("reset")}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <ManifestTable lines={state.lines} onDeleteLine={deleteLine} />

        {destinations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#9ED0FF]/70">
              {t("removeByDestination")}
            </span>
            {destinations.map((destination) => (
              <button
                key={destination}
                type="button"
                onClick={() => deleteByDestination(destination)}
                className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/25 bg-[#0B3A5A]/60 px-2.5 py-1 text-[#C9E4FF] transition-colors hover:border-red-400/60 hover:text-red-300"
              >
                {destination}
                <XMarkIcon className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        {locations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#9ED0FF]/70">{t("removeByLocation")}</span>
            {locations.map((location) => (
              <button
                key={location}
                type="button"
                onClick={() => deleteByLocation(location)}
                className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/25 bg-[#0B3A5A]/60 px-2.5 py-1 text-[#C9E4FF] transition-colors hover:border-red-400/60 hover:text-red-300"
              >
                {location}
                <XMarkIcon className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
