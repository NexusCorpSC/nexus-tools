/**
 * Parse a human-readable crafting time string (e.g. "1j2h30m15s") into seconds.
 * Supports: j (days), h (hours), m (minutes), s (seconds) — all optional.
 */
export function parseCraftingTime(input: string): number {
  const trimmed = input.trim();
  if (!trimmed) return 0;
  const regex = /(?:(\d+)j)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i;
  const match = trimmed.match(regex);
  if (!match || match[0] === "") return 0;
  const days = parseInt(match[1] ?? "0");
  const hours = parseInt(match[2] ?? "0");
  const minutes = parseInt(match[3] ?? "0");
  const seconds = parseInt(match[4] ?? "0");
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

/**
 * Format a duration in seconds into a human-readable string (e.g. "1j4h30m15s").
 */
export function formatCraftingTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "";
  const d = Math.floor(totalSeconds / 86400);
  const h = Math.floor((totalSeconds % 86400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [
    d > 0 ? `${d}j` : "",
    h > 0 ? `${h}h` : "",
    m > 0 ? `${m}m` : "",
    s > 0 ? `${s}s` : "",
  ]
    .filter(Boolean)
    .join("");
}
