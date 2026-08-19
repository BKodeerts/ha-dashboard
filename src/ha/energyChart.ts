/**
 * Geometry for the Energie tab's charts. Pure functions, no React — the
 * "today" chart (solar + consumption sharing one 00u–24u axis) and the
 * device-trend small multiples both draw from `fetchDayBuckets`' hourly
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

/**
 * Maps an hourly bucket series (see `fetchDayBuckets`) onto an SVG path, 0 at
 * `height - pad` and `max` at `pad`. Consecutive defined buckets draw a
 * segment; a gap — most often the hours still ahead of "now" — lifts the pen
 * rather than interpolating a value nobody has read yet.
 */
export function bucketPath(
  values: (number | undefined)[],
  { width = 280, height = 92, max, pad = 4 }: { width?: number; height?: number; max: number; pad?: number },
): BucketPath {
  const n = values.length;
  if (n < 2 || max <= 0) return { line: '', area: '' };
  const usable = height - pad * 2;
  const baseline = height - pad;

  const toXY = (index: number, value: number) => ({
    x: (index / (n - 1)) * width,
    y: baseline - Math.max(0, Math.min(1, value / max)) * usable,
  });

  let line = '';
  let firstX: number | undefined;
  let lastPoint: { x: number; y: number } | undefined;
  let penDown = false;

  for (let i = 0; i < n; i += 1) {
    const value = values[i];
    if (value === undefined) {
      penDown = false;
      continue;
    }
    const point = toXY(i, value);
    line += `${penDown ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
    penDown = true;
    lastPoint = point;
    if (firstX === undefined) firstX = point.x;
  }

  if (!lastPoint || firstX === undefined) return { line: '', area: '' };
  const area = `${line.trim()} L${lastPoint.x.toFixed(1)},${baseline.toFixed(1)} L${firstX.toFixed(1)},${baseline.toFixed(1)} Z`;
  return { line: line.trim(), area, lastPoint };
}

/**
 * A day's consumption buckets, for a household with no whole-home sensor of
 * its own — the same `consumption = solar - net` physics `powerInfo()` uses
 * for the live "huis" reading, applied per hour instead of once. `net` here
 * is a grid sensor's history (positive = import), so `solar - net = solar +
 * grid`. Only defined where both series have a reading for that hour.
 */
export function deriveConsumptionSeries(
  solar: (number | undefined)[],
  grid: (number | undefined)[],
): (number | undefined)[] {
  const length = Math.max(solar.length, grid.length);
  const consumption: (number | undefined)[] = [];
  for (let i = 0; i < length; i += 1) {
    const s = solar[i];
    const g = grid[i];
    consumption.push(s === undefined || g === undefined ? undefined : s + g);
  }
  return consumption;
}

/** Today's self-consumption ratio (0–1): solar used directly, over total
    consumption — `min(solar, consumption)` summed across the hours both have
    a reading. Undefined until at least one hour has both. No battery in this
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
