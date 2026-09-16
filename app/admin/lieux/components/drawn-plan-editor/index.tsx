"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { nanoid } from "nanoid";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { upload } from "@vercel/blob/client";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowsPointingOutIcon,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  PhotoIcon,
  PlusIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useImageViewport } from "@/app/lieux/use-image-viewport";
import {
  PLAN_THEME,
  planLabel,
  roomLabel,
  stairs,
  type PlateOptions,
} from "@/lib/plan-render";
import {
  PLACE_SERVICE_GLYPHS,
  PLAN_GLYPHS,
  TOOL_GLYPHS,
  TOOL_KEYS,
  type PlanGlyph,
} from "@/lib/plan-symbols";
import {
  DOOR_KINDS,
  PLACE_SERVICES,
  ROOM_FILLS,
  ROOM_KINDS,
  type DrawnPlacePlan,
  type DoorKind,
  type PlacePlanMarker,
  type PlanDoor,
  type PlanRoom,
  type RoomFill,
  type RoomKind,
} from "@/types/places";
import { nearestEdge } from "@/lib/plan-geometry";
import { downloadPlatePng } from "./export";
import {
  PLAN_TOOLS,
  SNAP_CM,
  SNAP_DEG,
  snapTo,
  usePlanDraft,
  wrapDegrees,
  type LayerKey,
  type PlanTool,
} from "./use-plan-draft";

/**
 * L'éditeur d'un relevé dessiné, en plein écran.
 *
 * Le dessin vit dans une couche transformée en CSS, pour la raison que
 * `use-image-viewport.ts` donne déjà : une pièce est alors un vrai nœud du
 * document, qui reçoit le pointeur et le focus. Une seule exception, assumée :
 * **ce qui n'est pas une boîte alignée sur les axes** — pièces libres et cotes —
 * passe par une couche SVG posée par-dessus, parce qu'un `<div>` ne sait pas
 * dessiner un hexagone ni une diagonale. Les deux couches partagent le même
 * repère, celui de l'emprise en centimètres.
 *
 * Les coordonnées manipulées ici sont **toujours des centimètres du relevé**.
 * La conversion depuis l'écran passe par `toNormalized`, qui mesure sur la boîte
 * du plan : rien à recalculer quand on zoome, rien à désynchroniser.
 */

/** La taille d'une porte posée d'un clic, en centimètres. */
const DOOR_CM = { w: 130, h: 40 };

/**
 * À quelle distance d'une paroi un clic compte encore comme « sur ce mur », en
 * centimètres. Une demi-porte : au-delà, on visait manifestement autre chose, et
 * accrocher quand même donnerait une porte posée de travers au milieu du vide.
 */
const DOOR_REACH_CM = DOOR_CM.w / 2;

/** En deçà, un glisser est un clic qui a tremblé, pas une pièce. */
const MIN_ROOM_CM = 50;

/** La graduation des règles, en pixels d'écran à l'échelle 1. */
const RULER_STEP = 60;

/**
 * Les types d'image que `app/api/lieux/upload/route.ts` accepte, et
 * l'extension que chacun donne au fichier déposé.
 */
const UNDERLAY_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

type Drag =
  | { kind: "draw"; tool: PlanTool; x: number; y: number }
  /*
   * Un déplacement porte l'état de la pièce **au début du geste**, pas son
   * état courant. Une pièce libre garde ses sommets en centimètres absolus :
   * la bouger, c'est translater le contour autant que la boîte, et recalculer
   * la translation depuis l'origine plutôt que de la cumuler à chaque
   * correctif — un glissement en produit une soixantaine, et les cumuler
   * dérive.
   */
  | {
      kind: "move";
      id: string;
      dx: number;
      dy: number;
      x0: number;
      y0: number;
      points?: number[];
    }
  | { kind: "vertex"; id: string; index: number }
  | { kind: "resize"; id: string }
  | { kind: "rotate"; id: string; cx: number; cy: number }
  | null;

function fillStyle(fill: RoomFill): { background: string; border: string } {
  switch (fill) {
    case "mass":
      return { background: PLAN_THEME.mass, border: PLAN_THEME.wall };
    case "corridor":
      return { background: PLAN_THEME.corridor, border: PLAN_THEME.wall };
    case "objective":
      return {
        background: "rgba(242, 180, 65, 0.16)",
        border: PLAN_THEME.accent,
      };
    case "access":
      return {
        background: "rgba(79, 217, 138, 0.14)",
        border: PLAN_THEME.access,
      };
    case "none":
      return { background: "transparent", border: PLAN_THEME.wall };
    default:
      return { background: PLAN_THEME.room, border: PLAN_THEME.wall };
  }
}

/** Des centimètres en mètres, écrits comme le reste de l'interface. */
function metres(cm: number): string {
  return (cm / 100).toFixed(2).replace(".", ",");
}

/**
 * Une graduation, en mètres. Sous les dix mètres l'entier ment trop — à fort
 * zoom, trois graduations d'affilée diraient « 0 » —, au-dessus la décimale ne
 * sert à rien.
 */
function rulerLabel(metresFromOrigin: number): string {
  if (metresFromOrigin === 0) return "0";
  return metresFromOrigin < 10
    ? metresFromOrigin.toFixed(1).replace(".", ",")
    : String(Math.round(metresFromOrigin));
}

/** Le tracé d'un repère, quelle que soit la nature de ce qu'il désigne. */
function markerPath(marker: PlacePlanMarker): string {
  if (marker.glyph) return PLAN_GLYPHS[marker.glyph];
  if (marker.service) return PLACE_SERVICE_GLYPHS[marker.service];
  return PLAN_GLYPHS.spawn;
}

/** La boîte englobante d'une suite de sommets, pour une pièce libre. */
function boundsOf(points: number[]) {
  const xs = points.filter((unused, index) => index % 2 === 0);
  const ys = points.filter((unused, index) => index % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(1, Math.max(...xs) - x),
    h: Math.max(1, Math.max(...ys) - y),
  };
}

export function DrawnPlanEditor({
  plan,
  slug,
  plate,
  onChange,
  readOnly = false,
}: {
  plan: DrawnPlacePlan;
  /** Le lieu à qui ce relevé appartient : il nomme les fichiers téléversés. */
  slug: string;
  /** L'habillage de la planche — titre, légende, mentions. */
  plate: Omit<PlateOptions, "fontCss">;
  onChange: (next: DrawnPlacePlan) => void;
  readOnly?: boolean;
}) {
  const t = useTranslations("Places");
  const draft = usePlanDraft(plan, onChange);
  const { level, tool, setTool, selection, setSelection, snap, angleSnap } =
    draft;

  /** Le rectangle qu'on est en train de tirer. Rien à voir avec `plan.preview`. */
  const [sketch, setSketch] = useState<PlanRoom | null>(null);
  /** Les sommets déjà posés d'une pièce libre en cours. */
  const [poly, setPoly] = useState<number[]>([]);
  const [exporting, setExporting] = useState(false);
  const [uploading, setUploading] = useState(false);

  /** Ce que désignait le dernier repère réglé : la nature du prochain posé. */
  const [lastMarker, setLastMarker] = useState<
    Pick<PlacePlanMarker, "service" | "glyph">
  >({ service: "asop" });

  /**
   * L'origine du plan à l'écran et l'échelle mesurée, pour les règles. Les
   * valeurs de départ n'ont pas à être justes : le premier `useLayoutEffect`
   * les remplace avant que quiconque les lise.
   */
  const [ruler, setRuler] = useState({
    x: 0,
    y: 0,
    pxPerMetre: RULER_STEP,
    width: 0,
    height: 0,
  });
  const drag = useRef<Drag>(null);
  const file = useRef<HTMLInputElement>(null);

  const {
    containerRef,
    imageRef,
    view,
    isPanning,
    zoomBy,
    reset,
    toNormalized,
    stageProps,
    keyboardProps,
  } = useImageViewport({ enabled: tool === "select", minScale: 0.2 });

  /** Un point de l'écran, en centimètres du relevé. */
  const toCm = useCallback(
    (clientX: number, clientY: number) => {
      const fraction = toNormalized(clientX, clientY);
      return { x: fraction.x * plan.widthCm, y: fraction.y * plan.heightCm };
    },
    [plan.heightCm, plan.widthCm, toNormalized],
  );

  const selectedRoom =
    selection?.kind === "room"
      ? (level?.rooms.find((room) => room.id === selection.id) ?? null)
      : null;
  const selectedMarker =
    selection?.kind === "marker"
      ? (plan.markers.find((marker) => marker.id === selection.id) ?? null)
      : null;
  const selectedDoor =
    selection?.kind === "door"
      ? (level?.doors.find((door) => door.id === selection.id) ?? null)
      : null;

  const shows = useCallback(
    (layer: LayerKey) => !draft.hidden.includes(layer),
    [draft.hidden],
  );

  /** Ferme la pièce libre en cours, si elle a de quoi faire une surface. */
  const closePoly = useCallback(() => {
    if (poly.length >= 6) {
      const box = boundsOf(poly);
      const added = draft.addRoom({
        name: "",
        kind: "technical",
        ...box,
        rot: 0,
        fill: "plain",
        label: true,
        points: poly,
      });
      // Un niveau plein refuse la pièce : le dire, sinon le tracé disparaît
      // sans que rien ne l'explique.
      if (!added) toast.error(t("Admin.levelFull"));
    }
    setPoly([]);
  }, [draft, poly, t]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return;
      const meta = event.metaKey || event.ctrlKey;

      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) draft.redo();
        else draft.undo();
        return;
      }
      if (event.key === "Enter" && poly.length) {
        event.preventDefault();
        closePoly();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (selection) {
          event.preventDefault();
          draft.removeSelected();
        }
        return;
      }
      if (event.key === "Escape") {
        setPoly([]);
        setSelection(null);
        return;
      }

      // Les lettres du rail, celles-là mêmes qui s'affichent sur les boutons.
      const shortcut = PLAN_TOOLS.find(
        (entry) => TOOL_KEYS[entry].toLowerCase() === event.key.toLowerCase(),
      );
      if (shortcut && !meta) {
        event.preventDefault();
        setTool(shortcut);
        return;
      }

      keyboardProps.onKeyDown(event);
    },
    [
      closePoly,
      draft,
      keyboardProps,
      poly.length,
      readOnly,
      selection,
      setSelection,
      setTool,
    ],
  );

  /* ── Le geste sur la scène ───────────────────────────────────────────── */

  /**
   * Prendre une pièce pour la déplacer — rectangle comme pièce libre.
   *
   * L'instantané des sommets est pris ici : la translation se calcule depuis
   * l'origine du geste, jamais en la cumulant correctif après correctif.
   *
   * Le `updateRoom` non silencieux ouvre l'entrée d'historique. Sans lui, tout
   * le glissement passait en silencieux et Ctrl+Z sautait par-dessus le
   * déplacement entier — ce que l'en-tête de `use-plan-draft.ts` dit pourtant
   * vouloir éviter.
   */
  const beginMove = (room: PlanRoom, event: React.PointerEvent<Element>) => {
    if (readOnly || tool !== "select") return;
    event.stopPropagation();
    const point = toCm(event.clientX, event.clientY);
    drag.current = {
      kind: "move",
      id: room.id,
      dx: point.x - room.x,
      dy: point.y - room.y,
      x0: room.x,
      y0: room.y,
      points: room.points?.length ? [...room.points] : undefined,
    };
    setSelection({ kind: "room", id: room.id });
    draft.updateRoom(room.id, {});
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const endDrag = (event: React.PointerEvent<Element>) => {
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (readOnly) return;

    if (tool === "select") {
      setSelection(null);
      stageProps.onPointerDown(event);
      return;
    }

    const point = toCm(event.clientX, event.clientY);
    const x = snapTo(point.x, SNAP_CM, snap);
    const y = snapTo(point.y, SNAP_CM, snap);

    if (tool === "poly") {
      // Un clic sur le premier sommet referme, comme dans tout éditeur vectoriel.
      if (
        poly.length >= 6 &&
        Math.hypot(x - poly[0], y - poly[1]) < SNAP_CM * 4
      ) {
        closePoly();
        return;
      }
      setPoly((current) => [...current, x, y]);
      return;
    }
    if (tool === "door") {
      /*
       * Une porte s'accroche à la paroi qu'on vise. On cherche le segment le
       * plus proche du point **non aimanté** : l'aimant de 25 cm tirerait le
       * clic hors d'un mur en biais, donc hors de la paroi qu'on désigne.
       *
       * Et on pose la porte **centrée** sur la projection. Elle était posée par
       * son coin haut gauche, donc déjà décalée d'une demi-porte avant même
       * qu'on parle d'angle — un décalage que la rotation autour du centre
       * rendait franchement visible.
       */
      const edge = nearestEdge(level.rooms, point);
      const onWall = edge && edge.distSq <= DOOR_REACH_CM * DOOR_REACH_CM;
      const cx = onWall ? edge.x : x;
      const cy = onWall ? edge.y : y;

      if (
        !draft.addDoor({
          kind: "single",
          x: cx - DOOR_CM.w / 2,
          y: cy - DOOR_CM.h / 2,
          ...DOOR_CM,
          rot: onWall ? wrapDegrees(Math.round(edge.angleDeg)) : 0,
        })
      ) {
        toast.error(t("Admin.levelFull"));
      }
      return;
    }
    if (tool === "label") {
      if (!draft.addLabel({ text: t("Admin.planLabelNew"), x, y, rot: 0 })) {
        toast.error(t("Admin.levelFull"));
      }
      return;
    }
    if (tool === "marker") {
      const marker: PlacePlanMarker = {
        id: nanoid(),
        x: Number((point.x / plan.widthCm).toFixed(4)),
        y: Number((point.y / plan.heightCm).toFixed(4)),
        levelId: level?.id,
        // Le choix fait dans l'inspecteur tient pour les suivants : poser dix
        // caméras d'affilée ne doit pas demander dix fois le même clic.
        ...lastMarker,
      };
      draft.apply((current) => ({
        ...current,
        markers: [...current.markers, marker],
      }));
      setSelection({ kind: "marker", id: marker.id });
      return;
    }

    // Les outils qui tirent : pièce, mur, escalier, cote.
    drag.current = { kind: "draw", tool, x, y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onStagePointerMove = (event: React.PointerEvent<Element>) => {
    const current = drag.current;
    if (!current) {
      stageProps.onPointerMove(event as React.PointerEvent<HTMLDivElement>);
      return;
    }

    const point = toCm(event.clientX, event.clientY);

    if (current.kind === "draw") {
      const x = snapTo(point.x, SNAP_CM, snap);
      const y = snapTo(point.y, SNAP_CM, snap);
      setSketch({
        id: "sketch",
        name: "",
        kind: current.tool === "stair" ? "circulation" : "technical",
        x: current.tool === "measure" ? current.x : Math.min(current.x, x),
        y: current.tool === "measure" ? current.y : Math.min(current.y, y),
        w:
          current.tool === "measure" ? x : Math.max(1, Math.abs(x - current.x)),
        h:
          current.tool === "measure" ? y : Math.max(1, Math.abs(y - current.y)),
        rot: 0,
        fill: "plain",
        label: true,
      });
      return;
    }

    if (current.kind === "move") {
      const nx = snapTo(point.x - current.dx, SNAP_CM, snap);
      const ny = snapTo(point.y - current.dy, SNAP_CM, snap);
      draft.updateRoom(
        current.id,
        {
          x: nx,
          y: ny,
          // Le contour suit la boîte, sinon les deux se désaccordent et le
          // pivot, l'étiquette et les poignées suivent un rectangle qui n'est
          // plus celui de la pièce.
          ...(current.points
            ? {
                points: current.points.map((value, index) =>
                  index % 2
                    ? value + (ny - current.y0)
                    : value + (nx - current.x0),
                ),
              }
            : {}),
        },
        true,
      );
      return;
    }

    if (current.kind === "vertex") {
      const room = level?.rooms.find((entry) => entry.id === current.id);
      if (!room?.points?.length) return;
      const points = [...room.points];
      points[current.index * 2] = snapTo(point.x, SNAP_CM, snap);
      points[current.index * 2 + 1] = snapTo(point.y, SNAP_CM, snap);
      // La boîte englobante n'est pas saisie : elle se déduit du contour.
      draft.updateRoom(current.id, { points, ...boundsOf(points) }, true);
      return;
    }

    if (current.kind === "resize") {
      const room = level?.rooms.find((entry) => entry.id === current.id);
      if (!room) return;
      draft.updateRoom(
        current.id,
        {
          w: Math.max(MIN_ROOM_CM, snapTo(point.x - room.x, SNAP_CM, snap)),
          h: Math.max(MIN_ROOM_CM, snapTo(point.y - room.y, SNAP_CM, snap)),
        },
        true,
      );
      return;
    }

    if (current.kind === "rotate") {
      const angle =
        (Math.atan2(point.y - current.cy, point.x - current.cx) * 180) /
          Math.PI +
        90;
      draft.updateRoom(
        current.id,
        { rot: wrapDegrees(snapTo(angle, SNAP_DEG, angleSnap)) },
        true,
      );
    }
  };

  const onStagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    drag.current = null;

    if (current?.kind === "draw" && sketch) {
      if (current.tool === "measure") {
        // Pour une cote, le croquis porte les deux extrémités, pas une boîte.
        if (
          Math.hypot(sketch.w - sketch.x, sketch.h - sketch.y) >= MIN_ROOM_CM
        ) {
          if (
            !draft.addMeasure({
              x1: sketch.x,
              y1: sketch.y,
              x2: sketch.w,
              y2: sketch.h,
            })
          ) {
            toast.error(t("Admin.levelFull"));
          }
        }
      } else if (sketch.w >= MIN_ROOM_CM && sketch.h >= MIN_ROOM_CM) {
        const added = draft.addRoom({
          name: "",
          kind: current.tool === "stair" ? "circulation" : "technical",
          x: sketch.x,
          y: sketch.y,
          w: sketch.w,
          h: sketch.h,
          rot: 0,
          fill: current.tool === "wall" ? "mass" : "plain",
          stair: current.tool === "stair" ? "up" : undefined,
          label: true,
        });
        if (!added) toast.error(t("Admin.levelFull"));
      }
      setSketch(null);
      setTool("select");
      return;
    }

    stageProps.onPointerUp(event);
  };

  /* ── Le fond de calque ───────────────────────────────────────────────── */

  async function pickUnderlay(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = "";
    if (!picked) return;

    // L'extension vient du type du fichier, jamais de son nom : un nom sans
    // point donnerait le nom entier pour extension, et la route d'envoi
    // refuserait le chemin sans pouvoir dire pourquoi.
    const extension = UNDERLAY_EXTENSIONS[picked.type];
    if (!extension) {
      toast.error(t("Admin.imageTypeRejected"));
      return;
    }

    setUploading(true);
    try {
      const size = await new Promise<{ width: number; height: number }>(
        (resolve, reject) => {
          const url = URL.createObjectURL(picked);
          const image = new window.Image();
          // L'URL se libère sur les deux issues : la garder après un échec
          // retient le fichier en mémoire jusqu'au rechargement de la page.
          const settle = (finish: () => void) => {
            URL.revokeObjectURL(url);
            finish();
          };
          image.onload = () =>
            settle(() =>
              resolve({
                width: image.naturalWidth,
                height: image.naturalHeight,
              }),
            );
          image.onerror = () =>
            settle(() => reject(new Error("fond de calque illisible")));
          image.src = url;
        },
      );
      // Une image que le navigateur décode sans lui trouver de dimensions
      // donnerait une échelle infinie.
      if (!size.width || !size.height) {
        throw new Error("fond de calque sans dimensions");
      }

      const blob = await upload(
        `lieux/${slug}/plans/${plan.id}-calque.${extension}`,
        picked,
        { access: "public", handleUploadUrl: "/api/lieux/upload" },
      );
      draft.setUnderlay({
        url: blob.url,
        width: size.width,
        height: size.height,
        x: 0,
        y: 0,
        scale: plan.widthCm / size.width,
        opacity: 0.4,
      });
    } catch {
      toast.error(t("Admin.imageUploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  /* ── Le dessin ───────────────────────────────────────────────────────── */

  const pct = (value: number, span: number) => `${(value / span) * 100}%`;

  const roomBox = (room: {
    x: number;
    y: number;
    w: number;
    h: number;
    rot?: number;
  }) => ({
    left: pct(room.x, plan.widthCm),
    top: pct(room.y, plan.heightCm),
    width: pct(room.w, plan.widthCm),
    height: pct(room.h, plan.heightCm),
    transform: room.rot ? `rotate(${room.rot}deg)` : undefined,
  });

  useEffect(() => {
    if (tool !== "select") setSelection(null);
    if (tool !== "poly") setPoly([]);
  }, [setSelection, tool]);

  /*
   * Les règles se mesurent. La boîte du plan est dimensionnée par la mise en
   * page — hauteur du conteneur, rapport d'aspect de l'emprise — puis mise à
   * l'échelle par la transformation CSS : aucune constante ne dit combien de
   * pixels vaut un mètre. Le déduire d'une valeur écrite en dur donnerait des
   * graduations fausses, et une règle qui ment est pire que pas de règle.
   */
  useLayoutEffect(() => {
    const measure = () => {
      const stage = containerRef.current?.getBoundingClientRect();
      const box = imageRef.current?.getBoundingClientRect();
      if (!stage || !box || box.width <= 0) return;
      setRuler({
        x: box.left - stage.left,
        y: box.top - stage.top,
        // Le rectangle porte déjà le zoom : la mesure suit toute seule.
        pxPerMetre: box.width / (plan.widthCm / 100),
        width: stage.width,
        height: stage.height,
      });
    };

    measure();
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef, imageRef, level?.id, plan.heightCm, plan.widthCm, view]);

  if (!level) return null;

  /** Ce qu'une graduation de 60 px vaut en mètres, à l'échelle courante. */
  const rulerStepMetres = RULER_STEP / ruler.pxPerMetre;
  const ticksX = Math.ceil(Math.max(0, ruler.width - ruler.x) / RULER_STEP) + 1;
  const ticksY =
    Math.ceil(Math.max(0, ruler.height - ruler.y) / RULER_STEP) + 1;
  /** Le pas du magnétisme, en pixels d'écran : la maille fine de la grille. */
  const gridFine = (ruler.pxPerMetre * SNAP_CM) / 100;
  const markers = plan.markers.filter(
    (marker) => !marker.levelId || marker.levelId === level.id,
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ══ Le rail d'outils ══ */}
      <nav className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-r border-[#9ED0FF]/15 bg-card py-2">
        {PLAN_TOOLS.map((entry, index) => (
          <div key={entry} className="contents">
            {index === 4 && <div className="my-1 h-px w-5 bg-[#9ED0FF]/15" />}
            <button
              type="button"
              title={`${t(`Admin.tool.${entry}`)} — ${TOOL_KEYS[entry]}`}
              aria-label={t(`Admin.tool.${entry}`)}
              aria-pressed={tool === entry}
              disabled={readOnly}
              onClick={() => setTool(entry)}
              className={`relative flex size-9 items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
                tool === entry
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={TOOL_GLYPHS[entry]} />
              </svg>
              <span className="absolute bottom-0 right-0.5 font-mono text-[8px] font-semibold opacity-55">
                {TOOL_KEYS[entry]}
              </span>
            </button>
          </div>
        ))}
        <div className="my-1 h-px w-5 bg-[#9ED0FF]/15" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("Admin.undo")}
          disabled={readOnly || !draft.canUndo}
          onClick={draft.undo}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("Admin.redo")}
          disabled={readOnly || !draft.canRedo}
          onClick={draft.redo}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />
          </svg>
        </Button>
      </nav>

      {/* ══ Niveaux, calques, fond ══ */}
      <aside className="flex w-[232px] shrink-0 flex-col overflow-y-auto border-r border-[#9ED0FF]/15">
        <p className="px-3 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("Admin.levels")}
        </p>
        <div className="px-2">
          {plan.levels.map((entry, index) => (
            <div
              key={entry.id}
              className={`mb-1 rounded-md border p-2 transition-colors ${
                entry.id === level.id
                  ? "border-primary/50 bg-white/5"
                  : "border-transparent hover:bg-accent/40"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  draft.setLevelId(entry.id);
                  setSelection(null);
                }}
                className="flex w-full items-center gap-2 text-left"
              >
                <span
                  className={`flex size-6 shrink-0 items-center justify-center rounded font-mono text-[10px] ${
                    entry.id === level.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-[#9ED0FF]/10 text-muted-foreground"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {entry.name || t("Admin.levelUnnamed")}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {t("Admin.levelCount", { rooms: entry.rooms.length })}
                  </span>
                </span>
              </button>
              {entry.id === level.id && !readOnly && (
                <div className="mt-1 flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("Admin.planMoveUp")}
                    disabled={index === 0}
                    onClick={() => draft.moveLevel(entry.id, -1)}
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("Admin.planMoveDown")}
                    disabled={index === plan.levels.length - 1}
                    onClick={() => draft.moveLevel(entry.id, 1)}
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("Admin.levelDelete")}
                    disabled={plan.levels.length <= 1}
                    onClick={() => draft.removeLevel(entry.id)}
                    className="text-red-400 hover:text-red-300"
                  >
                    <TrashIcon />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={draft.addLevel}
            >
              <PlusIcon className="size-4" />
              {t("Admin.levelAdd")}
            </Button>
          )}
        </div>

        <div className="mx-3 my-3 h-px bg-[#9ED0FF]/15" />

        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("Admin.layers")}
        </p>
        <div className="px-2">
          {(
            [
              ["rooms", PLAN_THEME.wall, level.rooms.length],
              ["markers", PLAN_THEME.accent, markers.length],
              ["labels", "#6FB6F0", level.labels.length],
              ["measures", PLAN_THEME.access, level.measures.length],
            ] as [LayerKey, string, number][]
          ).map(([layer, colour, count]) => (
            <button
              key={layer}
              type="button"
              aria-pressed={shows(layer)}
              onClick={() => draft.toggleLayer(layer)}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/40 ${
                shows(layer) ? "" : "opacity-45"
              }`}
            >
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: colour }}
              />
              <span className="flex-1 text-left">
                {t(`Admin.layer.${layer}`)}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {count}
              </span>
              {shows(layer) ? (
                <EyeIcon className="size-3.5 text-muted-foreground" />
              ) : (
                <EyeSlashIcon className="size-3.5 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>

        <div className="mx-3 my-3 h-px bg-[#9ED0FF]/15" />

        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("Admin.underlay")}
        </p>
        <div className="mx-3 mb-4 rounded-lg border border-dashed border-[#9ED0FF]/25 p-2.5">
          <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
            {t("Admin.underlayHint")}
          </p>
          <input
            ref={file}
            type="file"
            accept="image/*"
            hidden
            onChange={pickUnderlay}
          />
          {plan.underlay ? (
            <>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                {t("Admin.underlayOpacity", {
                  percent: Math.round(plan.underlay.opacity * 100),
                })}
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(plan.underlay.opacity * 100)}
                disabled={readOnly}
                onChange={(event) =>
                  plan.underlay &&
                  draft.setUnderlay({
                    ...plan.underlay,
                    opacity: Number(event.target.value) / 100,
                  })
                }
                className="w-full accent-[#C2E2FF]"
              />
              <Button
                variant="outline"
                size="sm"
                className="mt-2 w-full text-red-400"
                disabled={readOnly}
                onClick={() => draft.setUnderlay(undefined)}
              >
                <TrashIcon className="size-4" />
                {t("Admin.underlayRemove")}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={readOnly || uploading}
              onClick={() => file.current?.click()}
            >
              <PhotoIcon className="size-4" />
              {uploading ? t("Admin.imageUploading") : t("Admin.underlayAdd")}
            </Button>
          )}
        </div>
      </aside>

      {/* ══ La scène ══ */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div
          ref={containerRef}
          onKeyDown={onKeyDown}
          tabIndex={0}
          role="application"
          aria-label={t("Admin.stageLabel")}
          className="relative flex-1 overflow-hidden bg-[#061E2F] focus-visible:outline-none"
        >
          {/* Les règles, graduées en mètres, calées sur le bord du plan. */}
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[22px] items-end overflow-hidden border-b border-[#9ED0FF]/15 bg-[#092E49]/90">
            <div className="flex h-2 shrink-0" style={{ marginLeft: ruler.x }}>
              {Array.from({ length: ticksX }, (unused, index) => (
                <div
                  key={index}
                  className="relative h-2 w-[60px] shrink-0 border-l border-[#9ED0FF]/25"
                >
                  <span className="absolute -top-[11px] left-1 font-mono text-[8px] text-muted-foreground">
                    {rulerLabel(index * rulerStepMetres)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-20 w-[22px] overflow-hidden border-r border-[#9ED0FF]/15 bg-[#092E49]/90">
            <div style={{ marginTop: ruler.y }}>
              {Array.from({ length: ticksY }, (unused, index) => (
                <div
                  key={index}
                  className="relative h-[60px] border-t border-[#9ED0FF]/25"
                >
                  <span className="absolute left-1 top-0.5 font-mono text-[8px] text-muted-foreground">
                    {rulerLabel(index * rulerStepMetres)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute left-0 top-0 z-30 size-[22px] border-b border-r border-[#9ED0FF]/15 bg-[#092E49]/90" />

          {/*
            La grille, sous le plan et jamais dessus. Son pas fin est celui du
            magnétisme et son pas large en vaut cinq : ce qu'elle montre, ce
            sont les positions où une pièce va effectivement se poser. Elle est
            calée sur l'origine du plan, sinon elle quadrillerait l'écran sans
            rien dire de l'emprise — et elle s'efface quand la maille descend
            sous quelques pixels, où elle ne serait plus qu'un aplat.
          */}
          {draft.grid && gridFine >= 4 && (
            <div
              className="pointer-events-none absolute bottom-0 left-[22px] right-0 top-[22px]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(158,208,255,0.07) 1px, transparent 1px)," +
                  "linear-gradient(to bottom, rgba(158,208,255,0.07) 1px, transparent 1px)," +
                  "linear-gradient(to right, rgba(158,208,255,0.035) 1px, transparent 1px)," +
                  "linear-gradient(to bottom, rgba(158,208,255,0.035) 1px, transparent 1px)",
                backgroundSize:
                  `${gridFine * 5}px ${gridFine * 5}px, ${gridFine * 5}px ${gridFine * 5}px, ` +
                  `${gridFine}px ${gridFine}px, ${gridFine}px ${gridFine}px`,
                backgroundPosition: `${ruler.x - 22}px ${ruler.y - 22}px`,
              }}
            />
          )}

          <div
            {...stageProps}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            className={`absolute bottom-0 left-[22px] right-0 top-[22px] flex items-center justify-center p-10 ${
              tool === "select"
                ? isPanning
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-crosshair"
            }`}
          >
            <div
              ref={imageRef}
              className="relative max-h-full max-w-full bg-[#04121D] ring-1 ring-[#9ED0FF]/20"
              style={{
                aspectRatio: `${plan.widthCm} / ${plan.heightCm}`,
                height: "100%",
              }}
            >
              {plan.underlay ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={plan.underlay.url}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute select-none"
                  style={{
                    left: pct(plan.underlay.x, plan.widthCm),
                    top: pct(plan.underlay.y, plan.heightCm),
                    width: pct(
                      plan.underlay.width * plan.underlay.scale,
                      plan.widthCm,
                    ),
                    opacity: plan.underlay.opacity,
                  }}
                />
              ) : null}

              {shows("rooms") &&
                level.rooms
                  .filter((room) => !room.points?.length)
                  .map((room) => {
                    const paint = fillStyle(room.fill);
                    const chosen =
                      selection?.kind === "room" && selection.id === room.id;
                    return (
                      <div
                        key={room.id}
                        role="button"
                        tabIndex={-1}
                        aria-label={room.name || t("Admin.roomUnnamed")}
                        onPointerDown={(event) => beginMove(room, event)}
                        onPointerMove={onStagePointerMove}
                        onPointerUp={endDrag}
                        className="absolute flex items-center justify-center overflow-hidden text-center"
                        style={{
                          ...roomBox(room),
                          background: paint.background,
                          outline: `2px solid ${chosen ? PLAN_THEME.fg : paint.border}`,
                          outlineOffset: "-2px",
                          boxShadow: chosen
                            ? "0 0 0 2px rgba(143, 203, 255, 0.55)"
                            : undefined,
                        }}
                      />
                    );
                  })}

              {/*
                Ce qui n'est pas une boîte alignée sur les axes : pièces libres,
                cotes, et le tracé en cours. Même repère que les `<div>` — celui
                de l'emprise en centimètres.
              */}
              <svg
                viewBox={`0 0 ${plan.widthCm} ${plan.heightCm}`}
                className="pointer-events-none absolute inset-0 size-full"
              >
                {shows("rooms") &&
                  level.rooms
                    .filter((room) => room.points?.length)
                    .map((room) => {
                      const paint = fillStyle(room.fill);
                      const chosen =
                        selection?.kind === "room" && selection.id === room.id;
                      const spin = room.rot
                        ? `rotate(${room.rot} ${room.x + room.w / 2} ${room.y + room.h / 2})`
                        : undefined;
                      return (
                        <Fragment key={room.id}>
                          {/*
                            La forme et son hachurage tournent avec la pièce ;
                            le nom, lui, porte déjà sa propre rotation — celle
                            qui se retourne pour rester lisible — et le mettre
                            dans ce groupe la lui appliquerait deux fois.
                          */}
                          <g transform={spin}>
                            <polygon
                              points={(room.points ?? []).join(" ")}
                              fill={paint.background}
                              stroke={chosen ? PLAN_THEME.fg : paint.border}
                              strokeWidth={Math.max(
                                2,
                                Math.min(room.w, room.h) * 0.02,
                              )}
                              strokeLinejoin="round"
                              className="pointer-events-auto"
                              aria-label={room.name || t("Admin.roomUnnamed")}
                              onPointerDown={(event) => beginMove(room, event)}
                              onPointerMove={onStagePointerMove}
                              onPointerUp={endDrag}
                            />
                            {room.stair ? (
                              <g
                                className="pointer-events-none"
                                dangerouslySetInnerHTML={{
                                  __html: stairs(room, PLAN_THEME),
                                }}
                              />
                            ) : null}
                          </g>
                          {shows("labels") ? (
                            <g
                              className="pointer-events-none"
                              dangerouslySetInnerHTML={{
                                __html: roomLabel(room, PLAN_THEME),
                              }}
                            />
                          ) : null}
                        </Fragment>
                      );
                    })}

                {/*
                  Nom et hachurage des pièces rectangulaires. Elles sont
                  dessinées en `<div>` dans la couche du dessous, qui ne sait
                  tracer ni des marches ni un nom incliné ; cette couche-ci
                  partage le repère du moteur et passe au-dessus, donc elle
                  montre exactement ce que la planche montrera.

                  Le nom était jusqu'ici un `<span>` centré dans le `<div>`.
                  C'était une deuxième mise en page de l'étiquette, qui ignorait
                  que le moteur remonte un nom au-dessus du hachurage d'un
                  escalier — les deux se seraient chevauchés dès que l'éditeur
                  s'est mis à dessiner les marches.
                */}
                {shows("rooms") &&
                  level.rooms
                    .filter((room) => !room.points?.length)
                    .map((room) => (
                      <Fragment key={`decor-${room.id}`}>
                        {room.stair ? (
                          <g
                            className="pointer-events-none"
                            transform={
                              room.rot
                                ? `rotate(${room.rot} ${room.x + room.w / 2} ${room.y + room.h / 2})`
                                : undefined
                            }
                            dangerouslySetInnerHTML={{
                              __html: stairs(room, PLAN_THEME),
                            }}
                          />
                        ) : null}
                        {shows("labels") ? (
                          <g
                            className="pointer-events-none"
                            dangerouslySetInnerHTML={{
                              __html: roomLabel(room, PLAN_THEME),
                            }}
                          />
                        ) : null}
                      </Fragment>
                    ))}

                {/*
                  Les poignées d'une pièce libre sélectionnée : un sommet se
                  reprend sans avoir à effacer et retracer toute la pièce.
                */}
                {!readOnly &&
                tool === "select" &&
                selectedRoom?.points?.length &&
                selectedRoom.points.length >= 6
                  ? Array.from(
                      { length: selectedRoom.points.length / 2 },
                      (unused, index) => (
                        <circle
                          key={`vertex-${index}`}
                          cx={selectedRoom.points![index * 2]}
                          cy={selectedRoom.points![index * 2 + 1]}
                          r={Math.max(12, plan.widthCm * 0.006)}
                          fill={PLAN_THEME.field}
                          stroke={PLAN_THEME.accent}
                          strokeWidth={Math.max(3, plan.widthCm * 0.0016)}
                          className="pointer-events-auto cursor-move"
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            drag.current = {
                              kind: "vertex",
                              id: selectedRoom.id,
                              index,
                            };
                            draft.updateRoom(selectedRoom.id, {});
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                          }}
                          onPointerMove={onStagePointerMove}
                          onPointerUp={endDrag}
                        />
                      ),
                    )
                  : null}

                {/*
                  Les mentions libres. L'outil « Étiquette » en posait, la barre
                  des calques les comptait, et rien ne les dessinait : on
                  écrivait du texte invisible.
                */}
                {shows("labels") &&
                  level.labels.map((label) => (
                    <g
                      key={label.id}
                      className="pointer-events-auto cursor-pointer"
                      onPointerDown={(event) => {
                        if (readOnly || tool !== "select") return;
                        event.stopPropagation();
                        setSelection({ kind: "label", id: label.id });
                      }}
                      dangerouslySetInnerHTML={{
                        __html: planLabel(label, PLAN_THEME),
                      }}
                    />
                  ))}

                {shows("measures") &&
                  level.measures.map((measure) => {
                    const chosen =
                      selection?.kind === "measure" &&
                      selection.id === measure.id;
                    return (
                      <g
                        key={measure.id}
                        className="pointer-events-auto"
                        onPointerDown={(event) => {
                          if (readOnly || tool !== "select") return;
                          event.stopPropagation();
                          setSelection({ kind: "measure", id: measure.id });
                        }}
                      >
                        <line
                          x1={measure.x1}
                          y1={measure.y1}
                          x2={measure.x2}
                          y2={measure.y2}
                          stroke={chosen ? PLAN_THEME.fg : PLAN_THEME.access}
                          strokeWidth={Math.max(4, plan.widthCm * 0.003)}
                        />
                        <text
                          x={(measure.x1 + measure.x2) / 2}
                          y={(measure.y1 + measure.y2) / 2}
                          dy={-plan.heightCm * 0.015}
                          fill={PLAN_THEME.access}
                          fontSize={plan.widthCm * 0.022}
                          fontFamily="var(--font-geist-mono), monospace"
                          textAnchor="middle"
                        >
                          {metres(
                            Math.hypot(
                              measure.x2 - measure.x1,
                              measure.y2 - measure.y1,
                            ),
                          )}{" "}
                          m
                        </text>
                      </g>
                    );
                  })}

                {poly.length >= 2 && (
                  <polyline
                    points={poly.join(" ")}
                    fill="rgba(242, 180, 65, 0.1)"
                    stroke={PLAN_THEME.accent}
                    strokeWidth={Math.max(3, plan.widthCm * 0.002)}
                    strokeDasharray={`${plan.widthCm * 0.006} ${plan.widthCm * 0.004}`}
                  />
                )}

                {sketch && tool === "measure" && (
                  <line
                    x1={sketch.x}
                    y1={sketch.y}
                    x2={sketch.w}
                    y2={sketch.h}
                    stroke={PLAN_THEME.accent}
                    strokeWidth={Math.max(4, plan.widthCm * 0.003)}
                    strokeDasharray={`${plan.widthCm * 0.006} ${plan.widthCm * 0.004}`}
                  />
                )}
              </svg>

              {level.doors.map((door) => (
                <div
                  key={door.id}
                  onPointerDown={(event) => {
                    if (readOnly || tool !== "select") return;
                    event.stopPropagation();
                    setSelection({ kind: "door", id: door.id });
                  }}
                  className="absolute"
                  style={{
                    ...roomBox(door),
                    background:
                      door.kind === "opening" ? "#061E2F" : PLAN_THEME.wall,
                    outline:
                      selection?.kind === "door" && selection.id === door.id
                        ? `2px solid ${PLAN_THEME.accent}`
                        : undefined,
                  }}
                />
              ))}

              {shows("markers") &&
                markers.map((marker) => (
                  <button
                    key={marker.id}
                    type="button"
                    aria-label={
                      marker.label ?? marker.service ?? t("Admin.markerTitle")
                    }
                    onPointerDown={(event) => {
                      if (readOnly) return;
                      event.stopPropagation();
                      setSelection({ kind: "marker", id: marker.id });
                    }}
                    className="absolute flex size-[22px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border"
                    style={{
                      left: `${marker.x * 100}%`,
                      top: `${marker.y * 100}%`,
                      borderColor: PLAN_THEME.accent,
                      color: PLAN_THEME.accent,
                      background: "rgba(6, 30, 47, 0.9)",
                      boxShadow:
                        selection?.kind === "marker" &&
                        selection.id === marker.id
                          ? "0 0 0 2px rgba(143, 203, 255, 0.55)"
                          : undefined,
                    }}
                  >
                    {/*
                      Le repère montre ce qu'il désigne. C'était un carré vide
                      de 12 px : on posait des symboles qu'on ne voyait jamais.
                    */}
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d={markerPath(marker)} />
                    </svg>
                  </button>
                ))}

              {sketch && tool !== "measure" ? (
                <div
                  className="pointer-events-none absolute border-2 border-dashed"
                  style={{
                    ...roomBox(sketch),
                    borderColor: PLAN_THEME.accent,
                    background: "rgba(242, 180, 65, 0.1)",
                  }}
                />
              ) : null}

              {selectedRoom && !readOnly ? (
                <div
                  className="pointer-events-none absolute"
                  style={roomBox(selectedRoom)}
                >
                  <button
                    type="button"
                    aria-label={t("Admin.rotate")}
                    className="pointer-events-auto absolute -top-6 left-1/2 size-3.5 -translate-x-1/2 cursor-grab rounded-full border-2 bg-[#061E2F]"
                    style={{ borderColor: PLAN_THEME.fg }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      drag.current = {
                        kind: "rotate",
                        id: selectedRoom.id,
                        cx: selectedRoom.x + selectedRoom.w / 2,
                        cy: selectedRoom.y + selectedRoom.h / 2,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={onStagePointerMove}
                    onPointerUp={(event) => {
                      drag.current = null;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                    }}
                  />
                  {!selectedRoom.points?.length && (
                    <button
                      type="button"
                      aria-label={t("Admin.resize")}
                      className="pointer-events-auto absolute -bottom-1.5 -right-1.5 size-3 cursor-nwse-resize rounded-sm border"
                      style={{
                        borderColor: PLAN_THEME.fg,
                        background: PLAN_THEME.fg,
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        drag.current = { kind: "resize", id: selectedRoom.id };
                        event.currentTarget.setPointerCapture(event.pointerId);
                      }}
                      onPointerMove={onStagePointerMove}
                      onPointerUp={(event) => {
                        drag.current = null;
                        event.currentTarget.releasePointerCapture(
                          event.pointerId,
                        );
                      }}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Le HUD : ce que fait l'outil en main, et comment. */}
          <div className="pointer-events-none absolute left-[34px] top-[34px] z-10 max-w-[260px] rounded-lg border border-[#9ED0FF]/15 bg-[#143B57]/92 px-3 py-2">
            <b className="block text-xs font-semibold">
              {t(`Admin.tool.${tool}`)}
            </b>
            <span className="text-[11px] leading-snug text-muted-foreground">
              {t(`Admin.toolHint.${tool}`)}
            </span>
          </div>

          <div className="absolute right-3 top-8 z-10 flex flex-col gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("planZoomIn")}
              onClick={() => zoomBy(1.2)}
            >
              <MagnifyingGlassPlusIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("planZoomOut")}
              onClick={() => zoomBy(1 / 1.2)}
            >
              <MagnifyingGlassMinusIcon className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={t("planReset")}
              onClick={reset}
            >
              <ArrowsPointingOutIcon className="size-4" />
            </Button>
          </div>
        </div>

        {/* ══ La barre d'état ══ */}
        <div className="flex h-9 shrink-0 items-center gap-2 border-t border-[#9ED0FF]/15 bg-card px-2 text-[11px] text-muted-foreground">
          {(
            [
              [
                draft.grid,
                () => draft.setGrid(!draft.grid),
                t("Admin.gridToggle"),
              ],
              [
                snap,
                () => draft.setSnap(!snap),
                t("Admin.snapCm", { step: SNAP_CM }),
              ],
              [
                angleSnap,
                () => draft.setAngleSnap(!angleSnap),
                t("Admin.snapAngle", { step: SNAP_DEG }),
              ],
            ] as [boolean, () => void, string][]
          ).map(([on, toggle, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={toggle}
              className={`h-6 shrink-0 rounded border px-2 ${on ? "border-[#9ED0FF]/40 bg-white/10 text-foreground" : "border-[#9ED0FF]/15"}`}
            >
              {label}
            </button>
          ))}
          <span className="shrink-0 font-mono">{level.name}</span>
          <span className="grow" />
          <span className="shrink-0 font-mono">
            {t("Admin.extent", {
              width: metres(plan.widthCm),
              height: metres(plan.heightCm),
            })}
          </span>
          <span className="shrink-0 font-mono">
            {Math.round(view.scale * 100)} %
          </span>
          <button
            type="button"
            disabled={exporting}
            onClick={async () => {
              setExporting(true);
              try {
                await downloadPlatePng(plan, `${slug}-${plan.id}.png`, plate);
              } catch {
                toast.error(t("Admin.exportFailed"));
              } finally {
                setExporting(false);
              }
            }}
            className="h-6 shrink-0 rounded border border-[#9ED0FF]/15 px-2 hover:bg-accent disabled:opacity-50"
          >
            {exporting ? t("Admin.exporting") : t("Admin.exportPng")}
          </button>
        </div>
      </main>

      {/* ══ L'inspecteur ══ */}
      <aside className="w-[296px] shrink-0 space-y-3 overflow-y-auto border-l border-[#9ED0FF]/15 p-3">
        {selectedRoom ? (
          <RoomInspector
            room={selectedRoom}
            readOnly={readOnly}
            onPatch={(patch) => draft.updateRoom(selectedRoom.id, patch)}
            onDelete={draft.removeSelected}
          />
        ) : selectedDoor ? (
          <DoorInspector
            door={selectedDoor}
            readOnly={readOnly}
            onPatch={(patch) => draft.updateDoor(selectedDoor.id, patch)}
            onDelete={draft.removeSelected}
          />
        ) : selectedMarker ? (
          <MarkerInspector
            marker={selectedMarker}
            readOnly={readOnly}
            onPatch={(patch) => {
              if ("service" in patch || "glyph" in patch) {
                setLastMarker({
                  service: patch.service,
                  glyph: patch.glyph,
                });
              }
              draft.apply((current) => ({
                ...current,
                markers: current.markers.map((entry) =>
                  entry.id === selectedMarker.id
                    ? { ...entry, ...patch }
                    : entry,
                ),
              }));
            }}
            onDelete={draft.removeSelected}
          />
        ) : (
          <PlanInspector
            plan={plan}
            readOnly={readOnly}
            onPatch={(patch) =>
              draft.apply((current) => ({ ...current, ...patch }))
            }
            onRenameLevel={(name) => draft.renameLevel(level.id, name)}
            levelName={level.name}
          />
        )}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Les trois visages de l'inspecteur                                   */
/* ------------------------------------------------------------------ */

/**
 * Le réglage d'orientation, commun à une pièce et à une porte.
 *
 * Une porte accrochée à un mur en biais en prend l'angle toute seule ; ce champ
 * est là pour la reprendre quand l'accrochage a visé le mauvais mur, ou quand on
 * veut une porte que rien ne porte.
 */
function OrientationField({
  rot,
  readOnly,
  onChange,
}: {
  rot: number;
  readOnly: boolean;
  onChange: (rot: number) => void;
}) {
  const t = useTranslations("Places");

  return (
    <div className="space-y-1.5">
      <Label>{t("Admin.orientation")}</Label>
      <div className="grid grid-cols-[auto_1fr_auto] gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={readOnly}
          onClick={() => onChange(wrapDegrees(rot - SNAP_DEG))}
        >
          −{SNAP_DEG}°
        </Button>
        <div className="flex h-8 items-center justify-center rounded-md border border-input bg-input/30 font-mono text-xs">
          {rot}°
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={readOnly}
          onClick={() => onChange(wrapDegrees(rot + SNAP_DEG))}
        >
          +{SNAP_DEG}°
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {[0, 15, 30, 45, 90].map((angle) => (
          <button
            key={angle}
            type="button"
            disabled={readOnly}
            onClick={() => onChange(angle)}
            className={`h-6 rounded border px-2 text-[11px] ${rot === angle ? "border-[#9ED0FF]/45 bg-white/10 text-foreground" : "border-[#9ED0FF]/15 text-muted-foreground"}`}
          >
            {angle}°
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {t("Admin.orientationHint")}
      </p>
    </div>
  );
}

/**
 * Une porte : sa nature, et son angle.
 *
 * Il n'y en avait aucun. La sélection d'une porte existait déjà mais n'ouvrait
 * rien, donc ni sa nature — simple, double, sas — ni son orientation n'étaient
 * modifiables une fois posée.
 */
function DoorInspector({
  door,
  readOnly,
  onPatch,
  onDelete,
}: {
  door: PlanDoor;
  readOnly: boolean;
  onPatch: (patch: Partial<PlanDoor>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Places");

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-nexus-primary">
        {t("Admin.doorTitle")}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="door-kind">{t("Admin.doorKind")}</Label>
        <select
          id="door-kind"
          value={door.kind}
          disabled={readOnly}
          onChange={(event) =>
            onPatch({ kind: event.target.value as DoorKind })
          }
          className="h-8 w-full rounded-md border border-input bg-input/30 px-2 text-sm"
        >
          {DOOR_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`Admin.doorKinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>

      <OrientationField
        rot={door.rot}
        readOnly={readOnly}
        onChange={(rot) => onPatch({ rot })}
      />

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-400"
          onClick={onDelete}
        >
          <TrashIcon className="size-4" />
          {t("Admin.doorDelete")}
        </Button>
      )}
    </div>
  );
}

function RoomInspector({
  room,
  readOnly,
  onPatch,
  onDelete,
}: {
  room: PlanRoom;
  readOnly: boolean;
  onPatch: (patch: Partial<PlanRoom>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Places");

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-nexus-primary">
        {t("Admin.roomTitle")}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="room-name">{t("Admin.roomName")}</Label>
        <Input
          id="room-name"
          value={room.name}
          disabled={readOnly}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="room-kind">{t("Admin.roomKind")}</Label>
        <select
          id="room-kind"
          value={room.kind}
          disabled={readOnly}
          onChange={(event) =>
            onPatch({ kind: event.target.value as RoomKind })
          }
          className="h-9 w-full rounded-md border border-input bg-input/30 px-2 text-sm"
        >
          {ROOM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`Admin.roomKinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>{t("Admin.roomFill")}</Label>
        <div className="flex gap-1.5">
          {ROOM_FILLS.map((fill) => {
            const paint = fillStyle(fill);
            return (
              <button
                key={fill}
                type="button"
                aria-label={t(`Admin.roomFills.${fill}`)}
                title={t(`Admin.roomFills.${fill}`)}
                aria-pressed={room.fill === fill}
                disabled={readOnly}
                onClick={() => onPatch({ fill })}
                className={`size-8 rounded-md border-2 ${room.fill === fill ? "ring-2 ring-ring" : ""}`}
                style={{
                  background: paint.background,
                  borderColor: paint.border,
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>{t("Admin.roomSize")}</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["x", "y", "w", "h"] as const).map((axis) => (
            <label key={axis} className="block">
              <span className="sr-only">{axis}</span>
              <Input
                inputMode="decimal"
                disabled={readOnly || !!room.points?.length}
                className="h-8 px-1.5 text-center font-mono text-[11px]"
                value={metres(room[axis])}
                onChange={(event) => {
                  const parsed = Number(event.target.value.replace(",", "."));
                  if (Number.isFinite(parsed)) {
                    onPatch({
                      [axis]: Math.round(parsed * 100),
                    } as Partial<PlanRoom>);
                  }
                }}
              />
            </label>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {room.points?.length
            ? t("Admin.roomFreeHint")
            : t("Admin.roomSizeHint")}
        </p>
      </div>

      <OrientationField
        rot={room.rot}
        readOnly={readOnly}
        onChange={(rot) => onPatch({ rot })}
      />

      <div className="flex items-center justify-between text-sm">
        <span>{t("Admin.roomLabelShown")}</span>
        <input
          type="checkbox"
          checked={room.label}
          disabled={readOnly}
          onChange={(event) => onPatch({ label: event.target.checked })}
          className="size-4 accent-[#C2E2FF]"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span>{t("Admin.roomStair")}</span>
        <select
          value={room.stair ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onPatch({
              stair: (event.target.value || undefined) as PlanRoom["stair"],
            })
          }
          className="h-8 rounded-md border border-input bg-input/30 px-2 text-sm"
        >
          <option value="">{t("Admin.roomStairNone")}</option>
          <option value="up">{t("Admin.roomStairUp")}</option>
          <option value="down">{t("Admin.roomStairDown")}</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="room-note">{t("Admin.roomNote")}</Label>
        <Input
          id="room-note"
          value={room.note ?? ""}
          disabled={readOnly}
          onChange={(event) => onPatch({ note: event.target.value })}
        />
      </div>

      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-400"
          onClick={onDelete}
        >
          <TrashIcon className="size-4" />
          {t("Admin.roomDelete")}
        </Button>
      )}
    </div>
  );
}

type MarkerKind = "service" | "glyph";

/**
 * Les symboles qu'un repère peut porter quand il ne désigne pas un service.
 *
 * Tous les glyphes du plan n'ont pas leur place ici : une porte ou un escalier
 * se dessinent, ils ne se piquent pas sur une carte. Ceux-ci marquent ce qu'on
 * vient chercher dans un lieu, et ce qui s'y oppose.
 */
const MARKER_GLYPHS = [
  "crate",
  "container",
  "locker",
  "terminal",
  "key",
  "objective",
  "supply",
  "deposit",
  "wreck",
  "care",
  "spawn",
  "exit",
  "ladder",
  "lift",
  "camera",
  "turret",
  "breaker",
  "lockedDoor",
  "listening",
  "hazard",
] as const satisfies readonly PlanGlyph[];

/** Une grille de symboles cliquables, celle de la maquette. */
function SymbolGrid({
  entries,
  readOnly,
}: {
  entries: {
    key: string;
    d: string;
    title: string;
    on: boolean;
    pick: () => void;
  }[];
  readOnly: boolean;
}) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {entries.map((entry) => (
        <button
          key={entry.key}
          type="button"
          title={entry.title}
          aria-label={entry.title}
          aria-pressed={entry.on}
          disabled={readOnly}
          onClick={entry.pick}
          className={`flex aspect-square items-center justify-center rounded border transition-colors disabled:opacity-40 ${
            entry.on
              ? "border-[#9ED0FF]/50 bg-white/10 text-foreground"
              : "border-[#9ED0FF]/15 text-muted-foreground hover:bg-accent"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={entry.d} />
          </svg>
        </button>
      ))}
    </div>
  );
}

function MarkerInspector({
  marker,
  readOnly,
  onPatch,
  onDelete,
}: {
  marker: PlacePlanMarker;
  readOnly: boolean;
  onPatch: (patch: Partial<PlacePlanMarker>) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("Places");
  const kind: MarkerKind = marker.glyph ? "glyph" : "service";

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-nexus-primary">
        {t("Admin.markerTitle")}
      </p>

      {/*
        Ce que le repère désigne. Il n'y avait pas de choix du tout : tout
        repère naissait « terminal vaisseaux » et le restait.
      */}
      <div className="flex gap-1 rounded-md border border-input p-0.5">
        {(["service", "glyph"] as const).map((entry) => (
          <button
            key={entry}
            type="button"
            aria-pressed={kind === entry}
            disabled={readOnly}
            onClick={() =>
              onPatch(
                entry === "service"
                  ? { service: "asop", glyph: undefined }
                  : { service: undefined, glyph: "crate" },
              )
            }
            className={`h-7 flex-1 rounded text-[11px] font-medium transition-colors ${
              kind === entry
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {t(`Admin.markerKind.${entry}`)}
          </button>
        ))}
      </div>

      <SymbolGrid
        readOnly={readOnly}
        entries={
          kind === "service"
            ? PLACE_SERVICES.map((service) => ({
                key: service,
                d: PLACE_SERVICE_GLYPHS[service],
                title: t(`services.${service}`),
                on: marker.service === service,
                pick: () => onPatch({ service, glyph: undefined }),
              }))
            : MARKER_GLYPHS.map((name) => ({
                key: name,
                d: PLAN_GLYPHS[name],
                title: t(`Admin.glyphs.${name}`),
                on: marker.glyph === name,
                pick: () => onPatch({ glyph: name, service: undefined }),
              }))
        }
      />

      <div className="space-y-1.5">
        <Label htmlFor="marker-label">{t("Admin.markerLabel")}</Label>
        <Input
          id="marker-label"
          value={marker.label ?? ""}
          disabled={readOnly}
          onChange={(event) => onPatch({ label: event.target.value })}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        {t("Admin.markerLabelHint")}
      </p>
      <p className="font-mono text-[11px] text-muted-foreground">
        {marker.x.toFixed(3)} · {marker.y.toFixed(3)}
      </p>
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-red-400"
          onClick={onDelete}
        >
          <TrashIcon className="size-4" />
          {t("Admin.markerDelete")}
        </Button>
      )}
    </div>
  );
}

function PlanInspector({
  plan,
  levelName,
  readOnly,
  onPatch,
  onRenameLevel,
}: {
  plan: DrawnPlacePlan;
  levelName: string;
  readOnly: boolean;
  onPatch: (patch: Partial<DrawnPlacePlan>) => void;
  onRenameLevel: (name: string) => void;
}) {
  const t = useTranslations("Places");
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-nexus-primary">
        {t("Admin.planSettings")}
      </p>
      <p className="text-xs text-muted-foreground">
        {t("Admin.nothingSelected")}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="plan-name-drawn">{t("Admin.planName")}</Label>
        <Input
          id="plan-name-drawn"
          value={plan.name}
          disabled={readOnly}
          onChange={(event) => onPatch({ name: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="level-name">{t("Admin.levelName")}</Label>
        <Input
          id="level-name"
          value={levelName}
          disabled={readOnly}
          onChange={(event) => onRenameLevel(event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label>{t("Admin.planExtent")}</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {(["widthCm", "heightCm"] as const).map((axis) => (
            <Input
              key={axis}
              inputMode="decimal"
              disabled={readOnly}
              className="h-8 text-center font-mono text-[11px]"
              value={metres(plan[axis])}
              onChange={(event) => {
                const parsed = Number(event.target.value.replace(",", "."));
                if (Number.isFinite(parsed) && parsed > 0) {
                  onPatch({
                    [axis]: Math.round(parsed * 100),
                  } as Partial<DrawnPlacePlan>);
                }
              }}
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t("Admin.planExtentHint")}
        </p>
      </div>
    </div>
  );
}
