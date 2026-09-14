"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Viewport = { x: number; y: number; scale: number };

const START: Viewport = { x: 0, y: 0, scale: 1 };

/**
 * Déplacer et zoomer une image, à la molette, au doigt et au clavier.
 *
 * L'arithmétique vient du canvas de briefing (`app/squads/plans/canvas.tsx`) :
 * la molette ancrée sur le pointeur, la référence du point de départ du
 * déplacement, la capture du pointeur, `touch-action: none`. Le balisage, lui,
 * ne suit pas — là-bas c'est du SVG parce qu'il faut dessiner des vecteurs et
 * les rastériser ; ici on ne dessine rien. Une couche transformée en CSS laisse
 * les repères être de vrais boutons focusables, et `next/image` sait rendre
 * dedans, ce qu'il ne sait pas faire dans un `<image href>`.
 *
 * D'où deux abandons volontaires : `getScreenCTM()` et `DOMPoint`, qui
 * imposeraient un nœud SVG — `getBoundingClientRect()` répond la même chose en
 * trois lignes — et le doublage de chaque repère en transparent pour l'agrandir
 * au clic, remplacé par une zone de touche en pseudo-élément.
 *
 * Le pincement, lui, est neuf : le canvas de briefing s'en passe parce qu'il se
 * regarde sur un écran d'ordinateur. Un plan qui ne pince pas sur un téléphone
 * passe pour cassé bien avant qu'on trouve les boutons.
 */
export function useImageViewport({
  minScale = 1,
  maxScale = 12,
  enabled = true,
}: {
  minScale?: number;
  maxScale?: number;
  /** Coupé pendant qu'on pose un repère : sinon chaque dépôt déplace le plan. */
  enabled?: boolean;
} = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** La boîte au rapport d'aspect de l'image, que l'image remplit exactement. */
  const imageRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<Viewport>(START);
  const [isPanning, setIsPanning] = useState(false);

  const panFrom = useRef<{
    x: number;
    y: number;
    vx: number;
    vy: number;
  } | null>(null);
  /** Les pointeurs encore posés, pour distinguer un déplacement d'un pincement. */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchFrom = useRef<{ distance: number; scale: number } | null>(null);

  const clamp = useCallback(
    (scale: number) => Math.max(minScale, Math.min(maxScale, scale)),
    [minScale, maxScale],
  );

  /**
   * Zoome autour d'un point de l'écran, pour que le plan ne file pas sous le
   * curseur. L'origine de la transformation étant en haut à gauche, le point
   * reste fixe si l'on translate de la différence d'échelle.
   */
  const zoomAbout = useCallback(
    (client: { x: number; y: number }, factor: number) => {
      const node = containerRef.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      const px = client.x - box.left;
      const py = client.y - box.top;

      setView((current) => {
        const scale = clamp(current.scale * factor);
        const ratio = scale / current.scale;
        return {
          scale,
          x: px - (px - current.x) * ratio,
          y: py - (py - current.y) * ratio,
        };
      });
    },
    [clamp],
  );

  /** Zoome depuis le centre : ce que font les boutons et le clavier. */
  const zoomBy = useCallback(
    (factor: number) => {
      const node = containerRef.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      zoomAbout(
        { x: box.left + box.width / 2, y: box.top + box.height / 2 },
        factor,
      );
    },
    [zoomAbout],
  );

  const reset = useCallback(() => setView(START), []);

  // `{ passive: false }` est la seule façon d'empêcher la page de défiler sous
  // la molette : React pose ses écouteurs en passif.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAbout(
        { x: event.clientX, y: event.clientY },
        event.deltaY > 0 ? 0.89 : 1.12,
      );
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomAbout]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled) return;
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (pointers.current.size === 1) {
        panFrom.current = {
          x: event.clientX,
          y: event.clientY,
          vx: view.x,
          vy: view.y,
        };
        setIsPanning(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      } else if (pointers.current.size === 2) {
        // Un second doigt : ce n'est plus un déplacement, c'est un pincement.
        panFrom.current = null;
        setIsPanning(false);
        const [a, b] = [...pointers.current.values()];
        pinchFrom.current = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale: view.scale,
        };
      }
    },
    [enabled, view.scale, view.x, view.y],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });

      if (pointers.current.size >= 2 && pinchFrom.current) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance <= 0) return;

        const node = containerRef.current;
        if (!node) return;
        const box = node.getBoundingClientRect();
        const midX = (a.x + b.x) / 2 - box.left;
        const midY = (a.y + b.y) / 2 - box.top;
        const target = clamp(
          (pinchFrom.current.scale * distance) / pinchFrom.current.distance,
        );

        setView((current) => {
          const ratio = target / current.scale;
          return {
            scale: target,
            x: midX - (midX - current.x) * ratio,
            y: midY - (midY - current.y) * ratio,
          };
        });
        return;
      }

      const from = panFrom.current;
      if (!from) return;
      // La couche est translatée en pixels d'écran : le déplacement s'applique
      // tel quel, sans passer par l'échelle.
      setView((current) => ({
        ...current,
        x: from.vx + (event.clientX - from.x),
        y: from.vy + (event.clientY - from.y),
      }));
    },
    [clamp],
  );

  const endPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchFrom.current = null;
      if (pointers.current.size === 0) {
        panFrom.current = null;
        setIsPanning(false);
      }
    },
    [],
  );

  /** Flèches pour déplacer, + et − pour zoomer, Origine pour recentrer. */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 120 : 40;
      const moves: Record<string, [number, number]> = {
        ArrowUp: [0, step],
        ArrowDown: [0, -step],
        ArrowLeft: [step, 0],
        ArrowRight: [-step, 0],
      };

      if (moves[event.key]) {
        event.preventDefault();
        const [dx, dy] = moves[event.key];
        setView((current) => ({
          ...current,
          x: current.x + dx,
          y: current.y + dy,
        }));
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomBy(1.2);
      } else if (event.key === "-") {
        event.preventDefault();
        zoomBy(1 / 1.2);
      } else if (event.key === "Home" || event.key === "0") {
        event.preventDefault();
        reset();
      }
    },
    [reset, zoomBy],
  );

  /**
   * Un point de l'écran, en fraction de l'image. Mesuré sur la boîte de
   * l'image elle-même, dont le rectangle porte déjà la transformation : rien
   * à recalculer, et rien à désynchroniser.
   */
  const toNormalized = useCallback((clientX: number, clientY: number) => {
    const box = imageRef.current?.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (clientY - box.top) / box.height)),
    };
  }, []);

  return {
    containerRef,
    imageRef,
    view,
    isPanning,
    zoomBy,
    reset,
    toNormalized,
    stageProps: {
      style: {
        transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
        transformOrigin: "0 0",
        touchAction: "none" as const,
      },
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
    },
    keyboardProps: { onKeyDown },
  };
}
