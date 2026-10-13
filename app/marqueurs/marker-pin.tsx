/** L'épingle d'un marqueur, à la couleur de sa collection. */
export function MarkerPin({
  color,
  className = "size-4",
}: {
  color: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`shrink-0 ${className}`}
      style={{ color, filter: `drop-shadow(0 0 4px ${color}66)` }}
    >
      <path
        fill="currentColor"
        d="M12 22s-7-6.4-7-12a7 7 0 0 1 14 0c0 5.6-7 12-7 12z"
      />
      <circle cx="12" cy="10" r="2.6" fill="#06192a" />
    </svg>
  );
}
