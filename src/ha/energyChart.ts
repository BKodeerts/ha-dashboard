/**
 * Geometry for the Energie tab's charts. Pure functions, no React — the
 * "today" chart (solar + consumption sharing one 00u–24u axis) and the
 * device-trend small multiples both draw from `fetchDayBuckets`' day-sliced
 * arrays, so both go through `bucketPath` rather than the room card's
 * `sparklinePoints`, which assumes a dense series with no gaps and no shared
 * time axis.
 */

/** The four device-legend hues from the handoff, cycled for however many the
    household actually has configured — the design draws exactly four. */
export const DEVICE_COLORS = [
  'oklch(0.68 0.14 30)',
  'oklch(0.66 0.12 200)',
  'oklch(0.74 0.07 90)',
  'oklch(0.62 0.11 300)',
  'oklch(0.7 0.12 130)',
  'oklch(0.6 0.13 340)',
];

export const deviceColor = (index: number): string => DEVICE_COLORS[index % DEVICE_COLORS.length]!;

/** Today's progress as a 0–1 fraction of the 00u–24u axis, for the "now" marker. */
export function nowFraction(at: Date = new Date()): number {
  return (at.getHours() + at.getMinutes() / 60 + at.getSeconds() / 3600) / 24;
}

export interface BucketPath {
  /** SVG path `d` for the line, empty when the series has no reading yet. */
  line: string;
  /** Line closed down to the baseline, for a filled area — empty likewise. */
  area: string;
  /** Where the line's last defined point lands, for a "now" dot. */
  lastPoint?: { x: number; y: number };
}

type Point = { x: number; y: number };

/**
 * One run of consecutive defined buckets, as a smooth curve through every
 * point — Catmull-Rom converted to cubic Beziers, the standard way to do this
 * without reaching for a charting library. Straight `L` segments between
 * 15-minute buckets read as faceted/jagged even when the underlying reading
 * is smooth; real device power is often genuinely spiky (a compressor or a
 * heating element cycling), and the curve is what a normal reading of "this
 * chart" expects there too, the same way the household's own ApexCharts-style
 * cards render it.
 */
function smoothSegment(points: Point[]): string {
  const [first] = points;
  if (!first) return '';
  let d = `M${first.x.toFixed(1)},${first.y.toFixed(1)} `;
  // A run this short has nothing to curve through — draw a zero-length
  // segment rather than dropping it, so a single real reading still shows up
  // as a dot instead of vanishing (and instead of leaving `bucketPath`'s
  // `area` closing tail pointing at coordinates no visible line ever drew).
  if (points.length < 2) return `${d}L${first.x.toFixed(1)},${first.y.toFixed(1)}`;
  if (points.length === 2) {
    const [, second] = points;
    return `${d}L${second!.x.toFixed(1)},${second!.y.toFixed(1)}`;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} `;
  }
  return d.trim();
}

/**
 * Maps a day-bucket series (see `fetchDayBuckets`) onto an SVG path, 0 at
 * `height - pad` and `max` at `pad`. Consecutive defined buckets draw a
 * smooth curve (see `smoothSegment`); a gap — most often the slices still
 * ahead of "now" — starts a new one rather than interpolating a value nobody
 * has read yet.
 */
export function bucketPath(
  values: (number | undefined)[],
  { width = 280, height = 92, max, pad = 4 }: { width?: number; height?: number; max: number; pad?: number },
): BucketPath {
  const n = values.length;
  if (n < 2 || max <= 0) return { line: '', area: '' };
  const usable = height - pad * 2;
  const baseline = height - pad;

  const toXY = (index: number, value: number): Point => ({
    x: (index / (n - 1)) * width,
    y: baseline - Math.max(0, Math.min(1, value / max)) * usable,
  });

  // A real sensor's logging is "not super consistent" (per-minute-ish, but
  // with the odd missed slice) even while it is clearly still reporting —
  // breaking the line at every lone empty bucket would shatter a normal day
  // into a field of isolated dots. Only a longer silence — half an hour, most
  // often the slices still ahead of "now" — is treated as an actual gap.
  const MAX_BRIDGED_GAP = 2;
  const runs: Point[][] = [];
  let current: Point[] = [];
  let gap = 0;
  for (let i = 0; i < n; i += 1) {
    const value = values[i];
    if (value === undefined) {
      gap += 1;
      if (gap > MAX_BRIDGED_GAP && current.length > 0) {
        runs.push(current);
        current = [];
      }
      continue;
    }
    gap = 0;
    current.push(toXY(i, value));
  }
  if (current.length > 0) runs.push(current);

  if (runs.length === 0) return { line: '', area: '' };
  const line = runs.map(smoothSegment).join(' ');
  const firstPoint = runs[0]![0]!;
  const lastRun = runs[runs.length - 1]!;
  const lastPoint = lastRun[lastRun.length - 1]!;
  const area = `${line} L${lastPoint.x.toFixed(1)},${baseline.toFixed(1)} L${firstPoint.x.toFixed(1)},${baseline.toFixed(1)} Z`;
  return { line, area, lastPoint };
}

/**
 * A day's consumption buckets, for a household with no whole-home sensor of
 * its own — the same `consumption = solar - net` physics `powerInfo()` uses
 * for the live "huis" reading, applied per slice instead of once. `net` here
 * is a grid sensor's history (positive = import), so `solar - net = solar +
 * grid`.
 *
 * Only `grid` has to have a reading — solar defaults to 0 where it doesn't.
 * Plenty of inverters report *unavailable* rather than 0 once there is
 * nothing to produce (overnight, heavy cloud), and a solar reading with
 * nothing behind it is, for this purpose, indistinguishable from producing
 * nothing: the meter still knows exactly what the house drew regardless, and
 * a consumption line with a hole in it every time the inverter goes quiet
 * would be wrong far more often than it would be honest.
 */
export function deriveConsumptionSeries(
  solar: (number | undefined)[],
  grid: (number | undefined)[],
): (number | undefined)[] {
  const length = Math.max(solar.length, grid.length);
  const consumption: (number | undefined)[] = [];
  for (let i = 0; i < length; i += 1) {
    const g = grid[i];
    consumption.push(g === undefined ? undefined : (solar[i] ?? 0) + g);
  }
  return consumption;
}

/** Today's self-consumption ratio (0–1): solar used directly, over total
    consumption — `min(solar, consumption)` summed across the slices both
    have a reading. Undefined until at least one does. No battery in this
    household, so nothing solar produces is stored for later — it is either
    used as it's made or exported, which is exactly what `min` captures. */
export function selfConsumptionRatio(
  solar: (number | undefined)[],
  consumption: (number | undefined)[],
): number | undefined {
  let used = 0;
  let total = 0;
  for (let i = 0; i < Math.min(solar.length, consumption.length); i += 1) {
    const s = solar[i];
    const c = consumption[i];
    if (s === undefined || c === undefined) continue;
    used += Math.min(s, c);
    total += c;
  }
  return total > 0 ? used / total : undefined;
}
