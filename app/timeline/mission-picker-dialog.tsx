"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type MissionPick = { _id: string; title: string };
export type MissionPickerMode = "prefix" | "search";

/** Ce que l'API rend au plus d'un coup : un préfixe qui en touche plus doit s'affiner. */
const PAGE_SIZE = 100;

type Served = { key: string; missions: MissionPick[]; total: number; failed: boolean };

/**
 * Les fiches missions qui répondent à un texte : celles dont le titre commence
 * par lui (`prefix`), ou qui le contiennent (`search`).
 */
function useMissionResults(mode: MissionPickerMode, text: string) {
  const trimmed = text.trim();
  const key = `${mode}:${trimmed}`;
  const [served, setServed] = useState<Served>({ key: "", missions: [], total: 0, failed: false });

  useEffect(() => {
    if (trimmed.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        [mode === "prefix" ? "prefix" : "query"]: trimmed,
        limit: String(mode === "prefix" ? PAGE_SIZE : 30),
      });
      fetch(`/api/missions?${params}`)
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then((data: { missions?: MissionPick[]; total?: number }) => {
          const missions = (data.missions ?? []).map(({ _id, title }) => ({ _id, title }));
          if (current) {
            setServed({ key, missions, total: data.total ?? missions.length, failed: false });
          }
        })
        .catch(() => {
          if (current) setServed({ key, missions: [], total: 0, failed: true });
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [mode, trimmed, key]);

  const ready = trimmed.length >= 2 && served.key === key;
  return {
    loading: trimmed.length >= 2 && !ready,
    failed: ready && served.failed,
    missions: ready ? served.missions : [],
    total: ready ? served.total : 0,
  };
}

/**
 * Rattacher plusieurs contrats d'un coup à un évènement officiel : tous ceux
 * dont le nom commence par un texte (« RSI Disc. Month: »), avec l'aperçu de
 * ce qui sera ajouté, ou ceux cochés au fil d'une recherche. Les contrats déjà
 * rattachés et ce qui dépasse la place restante ne sont pas ajoutés.
 *
 * Le formulaire ne la monte que le temps d'un ajout : chaque ouverture repart
 * d'une saisie vide.
 */
export function MissionPickerDialog({
  onClose,
  initialMode,
  linkedIds,
  capacity,
  trackNames,
  onAdd,
}: {
  onClose: () => void;
  initialMode: MissionPickerMode;
  linkedIds: ReadonlySet<string>;
  capacity: number;
  trackNames: string[];
  onAdd: (missions: MissionPick[], track: string) => void;
}) {
  const t = useTranslations("Timeline.Form.Picker");
  const [mode, setMode] = useState<MissionPickerMode>(initialMode);
  const [text, setText] = useState("");
  const [track, setTrack] = useState("");
  // Préfixe : tout ce qui répond est pris, sauf ce que le joueur décoche.
  // Recherche : seulement ce qu'il coche, d'une recherche à l'autre.
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<MissionPick[]>([]);
  const results = useMissionResults(mode, text);

  const switchMode = (next: MissionPickerMode) => {
    if (next === mode) return;
    setMode(next);
    setExcluded(new Set());
  };

  const fresh = results.missions.filter((mission) => !linkedIds.has(mission._id));
  const chosen: MissionPick[] =
    mode === "prefix"
      ? fresh.filter((mission) => !excluded.has(mission._id))
      : selected.filter((mission) => !linkedIds.has(mission._id));
  const kept = chosen.slice(0, Math.max(0, capacity));
  const overflow = chosen.length - kept.length;

  const isChecked = (id: string) =>
    mode === "prefix" ? !excluded.has(id) : selected.some((mission) => mission._id === id);

  const toggle = (mission: MissionPick, checked: boolean) => {
    if (mode === "prefix") {
      setExcluded((current) => {
        const next = new Set(current);
        if (checked) next.delete(mission._id);
        else next.add(mission._id);
        return next;
      });
    } else {
      setSelected((current) =>
        checked
          ? [...current.filter((entry) => entry._id !== mission._id), mission]
          : current.filter((entry) => entry._id !== mission._id),
      );
    }
  };

  const tabClass = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm ${
      active ? "bg-[#9ED0FF]/15 text-[#E3F1FF]" : "text-muted-foreground hover:text-nexus"
    }`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl border-[#9ED0FF]/25 bg-[#0E2C45]">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {mode === "prefix" ? t("prefixHint") : t("searchHint")}
          </DialogDescription>
        </DialogHeader>

        <div role="tablist" className="flex gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "prefix"}
            onClick={() => switchMode("prefix")}
            className={tabClass(mode === "prefix")}
          >
            {t("modePrefix")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "search"}
            onClick={() => switchMode("search")}
            className={tabClass(mode === "search")}
          >
            {t("modeSearch")}
          </button>
        </div>

        <input
          aria-label={mode === "prefix" ? t("prefixLabel") : t("searchLabel")}
          placeholder={mode === "prefix" ? t("prefixPlaceholder") : t("searchPlaceholder")}
          value={text}
          autoFocus
          maxLength={100}
          onChange={(event) => {
            setText(event.target.value);
            setExcluded(new Set());
          }}
          className="h-9 w-full rounded-md border border-[#9ED0FF]/25 bg-[#071E30] px-2.5 text-sm text-[#E3F1FF]"
        />

        <div className="max-h-[45vh] min-h-24 overflow-auto rounded-md border border-[#9ED0FF]/15 bg-[#030912]/25 p-1">
          {text.trim().length < 2 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("typeMore")}</p>
          ) : results.loading ? (
            <p className="p-3 text-sm text-muted-foreground">{t("loading")}</p>
          ) : results.failed ? (
            <p role="alert" className="p-3 text-sm text-red-400">
              {t("failed")}
            </p>
          ) : results.missions.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">{t("noResults")}</p>
          ) : (
            <ul>
              {results.missions.map((mission) => {
                const linked = linkedIds.has(mission._id);
                return (
                  <li key={mission._id}>
                    <label
                      className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                        linked ? "opacity-60" : "cursor-pointer hover:bg-[#9ED0FF]/10"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={linked}
                        checked={linked || isChecked(mission._id)}
                        onChange={(event) => toggle(mission, event.target.checked)}
                      />
                      <span className="min-w-0 flex-1 truncate">{mission.title}</span>
                      {linked && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {t("alreadyLinked")}
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {results.total > results.missions.length && (
            <p>{t("moreResults", { count: results.total - results.missions.length })}</p>
          )}
          {mode === "search" && selected.length > 0 && (
            <p>{t("selectedCount", { count: chosen.length })}</p>
          )}
          {overflow > 0 && (
            <p className="text-amber-300">{t("overCapacity", { count: overflow, capacity })}</p>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <select
            aria-label={t("track")}
            value={track}
            onChange={(event) => setTrack(event.target.value)}
            className="h-9 rounded-md border border-[#9ED0FF]/25 bg-[#071E30] px-2.5 text-sm text-[#E3F1FF]"
          >
            <option value="">{t("noTrack")}</option>
            {trackNames.map((name) => (
              <option key={name} value={name}>
                {t("trackOption", { name })}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={kept.length === 0}
              onClick={() => {
                onAdd(kept, track);
                onClose();
              }}
            >
              {t("add", { count: kept.length })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
