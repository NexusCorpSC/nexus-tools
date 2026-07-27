"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
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
  applyBulkChanges,
  BulkLineChanges,
  CargoLine,
  ContainerSize,
  CUSTOM_TRANSPORT_ID,
  findTransport,
  FIRST_MISSION_COUNTER,
  linesToCsv,
  missionName,
  nextMissionCounter,
  ParsedBulkLine,
  splitVolume,
  totalVolume,
  Transport,
} from "@/lib/cargo";
import {
  getManifestServerSnapshot,
  getManifestSnapshot,
  subscribeToManifest,
  updateManifest,
} from "../storage";
import AddLineForm, { NewCargoLine } from "./add-line-form";
import BulkImportDialog from "./bulk-import-dialog";
import EditLineDialog from "./edit-line-dialog";
import ManifestTable from "./manifest-table";
import ManifestToolbar from "./manifest-toolbar";

function buildLine(
  input: NewCargoLine,
  maxContainer: ContainerSize,
  defaultMission: string,
): CargoLine {
  return {
    id: nanoid(),
    destination: input.destination,
    content: input.content,
    location: input.location,
    // An entry that names no mission joins the one currently being filled.
    mission: input.mission.trim() || defaultMission,
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

interface CargoManifestProps {
  /** Ships offered in the transport picker, managed from the admin section. */
  transports: Transport[];
}

export default function CargoManifest({ transports }: CargoManifestProps) {
  const t = useTranslations("Cargo");
  const [editingLine, setEditingLine] = useState<CargoLine | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    field: "destination" | "location" | "mission";
    value: string;
  } | null>(null);

  // The manifest lives in the browser: it is a scratchpad, not shared data.
  const state = useSyncExternalStore(
    subscribeToManifest,
    getManifestSnapshot,
    getManifestServerSnapshot,
  );

  // A stored ship may have been renamed away or deleted by an administrator:
  // fall back to the first one still available rather than a 0 SCU capacity.
  const selectedTransport = findTransport(transports, state.transportId);
  const transportId =
    state.transportId === CUSTOM_TRANSPORT_ID || selectedTransport
      ? state.transportId
      : (transports[0]?.id ?? CUSTOM_TRANSPORT_ID);

  const capacity =
    transportId === CUSTOM_TRANSPORT_ID
      ? state.customCapacity
      : (findTransport(transports, transportId)?.capacity ?? 0);

  const usedVolume = useMemo(() => totalVolume(state.lines), [state.lines]);

  const destinations = useMemo(
    () => distinct(state.lines.map((line) => line.destination)),
    [state.lines],
  );

  const locations = useMemo(
    () => distinct(state.lines.map((line) => line.location)),
    [state.lines],
  );

  const missions = useMemo(
    () => distinct(state.lines.map((line) => line.mission)),
    [state.lines],
  );

  const pendingDeleteCount = pendingDelete
    ? state.lines.filter(
        (line) => line[pendingDelete.field] === pendingDelete.value,
      ).length
    : 0;

  const currentMission = missionName(state.missionCounter);

  function addLine(input: NewCargoLine) {
    updateManifest((current) => ({
      ...current,
      lines: [
        ...current.lines,
        buildLine(
          input,
          current.maxContainer,
          missionName(current.missionCounter),
        ),
      ],
    }));
  }

  /** Moves on to the next mission for everything entered from now on. */
  function startNewMission() {
    updateManifest((current) => ({
      ...current,
      missionCounter: nextMissionCounter(current.missionCounter, current.lines),
    }));
  }

  function importLines(imported: ParsedBulkLine[]) {
    updateManifest((current) => ({
      ...current,
      lines: [
        ...current.lines,
        ...imported.map((line) =>
          buildLine(
            line,
            current.maxContainer,
            missionName(current.missionCounter),
          ),
        ),
      ],
    }));

    toast.success(t("bulkImportedTitle"), {
      description: t("bulkImportedDescription", { count: imported.length }),
    });
  }

  /** Keeps the line in place and re-splits it with its own maximum size. */
  function editLine(id: string, values: NewCargoLine) {
    updateManifest((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === id
          ? {
              ...line,
              ...values,
              quantities: splitVolume(values.volume, line.maxContainer),
            }
          : line,
      ),
    }));

    setEditingLine(null);
  }

  function deleteLine(id: string) {
    updateManifest((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    }));
  }

  function bulkEdit(ids: string[], changes: BulkLineChanges) {
    updateManifest((current) => ({
      ...current,
      lines: applyBulkChanges(current.lines, ids, changes),
    }));

    toast.success(t("bulkEditedTitle"), {
      description: t("bulkEditedDescription", { count: ids.length }),
    });
  }

  /** Wiping a whole destination, location or mission asks first. */
  function confirmBulkDelete() {
    if (!pendingDelete) {
      return;
    }

    const { field, value } = pendingDelete;

    updateManifest((current) => ({
      ...current,
      lines: current.lines.filter((line) => line[field] !== value),
    }));

    setPendingDelete(null);
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
    // Starting over also restarts the mission numbering.
    updateManifest((current) => ({
      ...current,
      lines: [],
      missionCounter: FIRST_MISSION_COUNTER,
    }));
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
          transports={transports}
          transportId={transportId}
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
        <AddLineForm
          maxContainer={state.maxContainer}
          currentMission={currentMission}
          onAdd={addLine}
          onAddMany={importLines}
          onNewMission={startNewMission}
        />
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

        <ManifestTable
          lines={state.lines}
          onDeleteLine={deleteLine}
          onEditLine={setEditingLine}
          onBulkEdit={bulkEdit}
        />

        <EditLineDialog
          line={editingLine}
          onClose={() => setEditingLine(null)}
          onSave={editLine}
        />

        {destinations.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#9ED0FF]/70">
              {t("removeByDestination")}
            </span>
            {destinations.map((destination) => (
              <button
                key={destination}
                type="button"
                onClick={() =>
                  setPendingDelete({ field: "destination", value: destination })
                }
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
                onClick={() =>
                  setPendingDelete({ field: "location", value: location })
                }
                className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/25 bg-[#0B3A5A]/60 px-2.5 py-1 text-[#C9E4FF] transition-colors hover:border-red-400/60 hover:text-red-300"
              >
                {location}
                <XMarkIcon className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        {missions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#9ED0FF]/70">{t("removeByMission")}</span>
            {missions.map((mission) => (
              <button
                key={mission}
                type="button"
                onClick={() =>
                  setPendingDelete({ field: "mission", value: mission })
                }
                className="inline-flex items-center gap-1 rounded-full border border-[#9ED0FF]/25 bg-[#0B3A5A]/60 px-2.5 py-1 text-[#C9E4FF] transition-colors hover:border-red-400/60 hover:text-red-300"
              >
                {mission}
                <XMarkIcon className="h-3 w-3" />
              </button>
            ))}
          </div>
        )}

        <Dialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPendingDelete(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("bulkDeleteTitle", { value: pendingDelete?.value ?? "" })}
              </DialogTitle>
              <DialogDescription>
                {t("bulkDeleteDescription", { count: pendingDeleteCount })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t("cancel")}
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmBulkDelete}
              >
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
