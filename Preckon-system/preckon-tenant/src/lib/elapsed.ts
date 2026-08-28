// How long something took, said two ways.
//
// Split out of the stage header because these are the only arithmetic in it,
// and a formatter that decides whether a number reads as "0:09" or "9s" is
// worth testing without mounting a React tree to do it.

/**
 * A running clock: m:ss, or h:mm:ss past the hour.
 *
 * Zero-padded, and rendered in tabular numerals by the caller, so a stage
 * header keeps its width while it counts instead of nudging the chips beside it
 * once a second.
 */
export function fmtClock(msSpan: number): string {
  const s = Math.max(0, Math.round(msSpan / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * A finished span, in prose: "48s", "2m 14s", "1h 3m".
 *
 * A duration that is over reads better with units than as a clock face — "took
 * 2m 14s" is a sentence, "took 2:14" invites being read as a time of day.
 * Seconds are dropped past the hour, where they are noise.
 */
export function fmtTook(msSpan: number): string {
  const s = Math.max(0, Math.round(msSpan / 1000));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m ${sec}s`;
}

/** A timestamp from the API as epoch ms, or null if it is absent or unparseable. */
export function epoch(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(v as string).getTime();
  return Number.isNaN(t) ? null : t;
}
