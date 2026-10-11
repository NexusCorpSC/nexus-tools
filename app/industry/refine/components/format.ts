/** Une traduction du namespace Refining, quelle que soit son origine. */
type Translate = (
  key: "durationShort",
  values: { days: number; hours: number; minutes: number },
) => string;

/** Une durée en minutes, lisible : « 1 j 3 h », « 2 h 14 min », « 35 min ». */
export function formatMinutes(total: number, t: Translate): string {
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  // Au-delà d'un jour, les minutes n'apprennent plus rien.
  const minutes = days > 0 ? 0 : total % 60;
  return t("durationShort", { days, hours, minutes })
    .replace(/\s+/g, " ")
    .trim();
}
