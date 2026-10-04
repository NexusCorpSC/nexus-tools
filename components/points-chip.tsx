/** Ce qu'une contribution rapporte, à côté de l'appel à la faire. */
export function PointsChip({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-amber-300/55 bg-amber-300/15 px-1.5 font-mono text-[11px] font-bold leading-4 text-amber-200">
      +{points}
    </span>
  );
}
