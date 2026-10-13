"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listNpsBodiesAction } from "@/app/lieux/nps-actions";
import { parseShowLocation, positionOf } from "@/lib/nps-geometry";
import type { NpsBody, PlacePosition } from "@/types/places";

type Mode = "none" | "body" | "space";
type Unit = "m" | "km";
type Xyz = { x: string; y: string; z: string };

const EMPTY: Xyz = { x: "", y: "", z: "" };
const AXES = ["x", "y", "z"] as const;

/** Ce que le champ rend : une position, aucune, ou une saisie à reprendre. */
export type PositionValue = PlacePosition | null | "invalid";

function toFields(position: PlacePosition, unit: Unit): Xyz {
  const factor = unit === "km" ? 1000 : 1;
  const show = (value: number) =>
    String(Math.round((value / factor) * 1000) / 1000);
  return { x: show(position.x), y: show(position.y), z: show(position.z) };
}

function read(
  fields: Xyz,
  unit: Unit,
): { x: number; y: number; z: number } | null {
  const factor = unit === "km" ? 1000 : 1;
  const values = AXES.map((axis) =>
    Number(fields[axis].trim().replace(/\s/g, "").replace(",", ".")),
  );
  if (AXES.some((axis) => fields[axis].trim() === "")) return null;
  if (!values.every(Number.isFinite)) return null;
  const [x, y, z] = values.map((value) => value * factor);
  return { x, y, z };
}

/**
 * Où se trouve un lieu en jeu, au format du NPS : sur une planète ou une lune,
 * dans le repère de ce corps (les X, Y, Z que `r_displayInfo` affiche, en
 * kilomètres) ; dans l'espace, dans le repère du système, tel que
 * `/showlocation` le donne en mètres. Coller une ligne `/showlocation` prise
 * sur place fait la conversion, comme l'app au relevé.
 */
export function PlacePositionField({
  initial,
  systemSlug,
  required,
  onChange,
}: {
  initial?: PlacePosition;
  /** Le système du lieu, si on le sait : seuls ses corps sont proposés. */
  systemSlug?: string;
  /** Pas de choix « aucune » : un marqueur a toujours une position. */
  required?: boolean;
  onChange: (value: PositionValue) => void;
}) {
  const t = useTranslations("Places.Position");
  const [bodies, setBodies] = useState<NpsBody[] | null>(null);
  const [bodiesFailed, setBodiesFailed] = useState(false);
  const [mode, setMode] = useState<Mode>(
    initial ? (initial.body ? "body" : "space") : required ? "body" : "none",
  );
  const [bodySlug, setBodySlug] = useState(initial?.body ?? "");
  const [unit, setUnit] = useState<Unit>(
    initial ? (initial.body ? "km" : "m") : required ? "km" : "m",
  );
  const [fields, setFields] = useState<Xyz>(() =>
    initial ? toFields(initial, initial.body ? "km" : "m") : EMPTY,
  );
  const [paste, setPaste] = useState("");
  const [pasteError, setPasteError] = useState(false);

  useEffect(() => {
    listNpsBodiesAction()
      .then(setBodies)
      .catch(() => {
        setBodies([]);
        setBodiesFailed(true);
      });
  }, []);

  // Chaque système a son repère : un corps d'un autre système n'a rien à
  // voir avec ce lieu, et une ligne collée tomberait peut-être dans sa zone.
  const sorted = useMemo(
    () =>
      (bodies ?? [])
        .filter((body) => !systemSlug || body.systemSlug === systemSlug)
        .sort(
          (a, b) =>
            (a.systemName ?? "").localeCompare(b.systemName ?? "") ||
            a.name.localeCompare(b.name),
        ),
    [bodies, systemSlug],
  );

  // Un autre parent, un autre système : le corps choisi n'en est plus.
  const chosen =
    bodies === null || sorted.some((body) => body.slug === bodySlug)
      ? bodySlug
      : "";

  /** Change d'unité en gardant la même distance. */
  function switchUnit(next: Unit) {
    const point = read(fields, unit);
    setUnit(next);
    if (point) setFields(toFields(point, next));
  }

  // Ce que le formulaire enverra, recalculé à chaque saisie.
  useEffect(() => {
    if (mode === "none") return onChange(null);
    const point = read(fields, unit);
    if (!point || (mode === "body" && !chosen)) return onChange("invalid");
    onChange(mode === "body" ? { body: chosen, ...point } : point);
    // `onChange` change à chaque rendu du parent : seule la saisie compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, chosen, unit, fields]);

  function applyPaste(text: string) {
    setPaste(text);
    if (!text.trim()) return setPasteError(false);
    const reading = parseShowLocation(text);
    if (!reading) return setPasteError(true);
    setPasteError(false);
    const position = positionOf({ ...reading, at: Date.now() }, sorted);
    const nextUnit: Unit = position.body ? "km" : "m";
    setMode(position.body ? "body" : "space");
    setBodySlug(position.body ?? "");
    setUnit(nextUnit);
    setFields(toFields(position, nextUnit));
  }

  const choices: { key: Mode; label: string }[] = [
    ...(required ? [] : [{ key: "none" as const, label: t("none") }]),
    { key: "body", label: t("onBody") },
    { key: "space", label: t("inSpace") },
  ];

  return (
    <fieldset id="coordonnees" className="scroll-mt-24 space-y-3">
      <legend className="text-sm font-medium">{t("title")}</legend>

      <div className="space-y-1.5">
        <Label htmlFor="place-showlocation">{t("pasteLabel")}</Label>
        <Input
          id="place-showlocation"
          value={paste}
          // Sans les corps, une ligne prise sur une planète passerait pour
          // une position dans l'espace.
          disabled={bodies === null || bodiesFailed}
          placeholder="Coordinates: x:… y:… z:…"
          onChange={(event) => applyPaste(event.target.value)}
        />
        <p
          className={`text-xs ${pasteError || bodiesFailed ? "text-red-400" : "text-muted-foreground"}`}
        >
          {bodiesFailed
            ? t("bodiesFailed")
            : pasteError
              ? t("pasteInvalid")
              : t("pasteHint")}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            role="radio"
            aria-checked={mode === choice.key}
            onClick={() => {
              setMode(choice.key);
              if (choice.key === "space") switchUnit("m");
              if (choice.key === "body") switchUnit("km");
            }}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              mode === choice.key
                ? "border-[#C2E2FF]/60 bg-white/10"
                : "border-[#9ED0FF]/20 hover:bg-white/5"
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>

      {mode !== "none" && (
        <div className="space-y-3 rounded-lg border border-[#9ED0FF]/15 p-3">
          {mode === "body" && (
            <div className="space-y-1.5">
              <Label htmlFor="place-body">{t("body")}</Label>
              <select
                id="place-body"
                value={chosen}
                onChange={(event) => setBodySlug(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">{t("bodyPick")}</option>
                {sorted.map((body) => (
                  <option key={body.slug} value={body.slug}>
                    {body.systemName && !systemSlug
                      ? `${body.name} (${body.systemName})`
                      : body.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
            {AXES.map((axis) => (
              <div key={axis} className="space-y-1">
                <Label htmlFor={`place-${axis}`}>{axis.toUpperCase()}</Label>
                <Input
                  id={`place-${axis}`}
                  inputMode="decimal"
                  value={fields[axis]}
                  onChange={(event) =>
                    setFields((current) => ({
                      ...current,
                      [axis]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
            <select
              aria-label={t("unit")}
              value={unit}
              onChange={(event) => switchUnit(event.target.value as Unit)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="km">km</option>
              <option value="m">m</option>
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            {mode === "body" ? t("bodyHint") : t("spaceHint")}
          </p>
        </div>
      )}
    </fieldset>
  );
}
