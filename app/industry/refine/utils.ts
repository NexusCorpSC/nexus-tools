/**
 * Formats the remaining time in minutes to a human-readable string
 * @param minutes Remaining time in minutes
 * @returns Formatted time string (e.g., "2h 30m" or "45m")
 */
export function formatTimeRemaining(minutes: number): string {
  if (minutes <= 0) {
    return "Complete";
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.floor(minutes % 60);

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  } else {
    return `${remainingMinutes}m`;
  }
}