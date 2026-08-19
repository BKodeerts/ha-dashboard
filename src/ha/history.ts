import { toNumber } from './selectors';
import type { HaBackend } from './types';

/** Number of points the room card's polyline draws, per the design. */
export const SPARK_POINTS = 28;

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  values: number[];
  promise?: Promise<number[]>;
}

const cache = new Map<string, CacheEntry>();

type HistoryRow = { s?: string; state?: string; lu?: number };

/** WS `history/history_during_period` answers `{ entity_id: [{s, lu}, …] }`. */
function parseHistory(payload: unknown, entityId: string): number[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as Record<string, unknown>)[entityId];
  if (!Array.isArray(rows)) return [];
  const values: number[] = [];
  for (const row of rows as HistoryRow[]) {
    const value = toNumber(row.s ?? row.state);
    if (value !== undefined) values.push(value);
  }
  return values;
}

/** Evenly samples a series down to `count` points, keeping first and last. */
export function downsample(values: number[], count = SPARK_POINTS): number[] {
  if (values.length === 0) return [];
  if (values.length <= count) return values.slice();
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * values.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * values.length) / count));
    let sum = 0;
    for (let j = start; j < end; j += 1) sum += values[j]!;
    out.push(sum / (end - start));
  }
  return out;
}

/** 24 h of a temperature sensor, downsampled and cached for five minutes. */
export async function fetchSparkline(backend: HaBackend, entityId: string): Promise<number[]> {
  const hit = cache.get(entityId);
  const now = Date.now();
  if (hit && now - hit.fetchedAt < CACHE_TTL_MS) return hit.promise ?? hit.values;

  const promise = backend
    .sendMessagePromise<unknown>({
      type: 'history/history_during_period',
      start_time: new Date(now - 24 * 3600e3).toISOString(),
      end_time: new Date(now).toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
    })
    .then((payload) => {
      const values = downsample(parseHistory(payload, entityId));
      cache.set(entityId, { fetchedAt: Date.now(), values });
      return values;
    })
    .catch(() => {
      // A failed history call must not break the card — it just draws no line.
      cache.set(entityId, { fetchedAt: Date.now(), values: [] });
      return [];
    });

  cache.set(entityId, { fetchedAt: now, values: hit?.values ?? [], promise });
  return promise;
}

export function clearHistoryCache(): void {
  cache.clear();
}

/* ── today, by the hour ──────────────────────────────────────────────────
   The energy tab's "today" chart needs each sample on the wall-clock hour it
   happened in, not just evenly spread across however many rows history
   returned — that's what lets the chart share an 00u–24u axis across several
   entities and stop the line exactly at "now" instead of drawing a guess for
   the hours still ahead. `history_during_period` (not the statistics API) to
   match `fetchSparkline`'s call above — one history endpoint for the whole
   app, and a power sensor's raw rows are cheap enough for a single day. */

const DAY_CACHE_TTL_MS = 5 * 60 * 1000;

interface DayCacheEntry {
  fetchedAt: number;
  values: (number | undefined)[];
  promise?: Promise<(number | undefined)[]>;
}

const dayCache = new Map<string, DayCacheEntry>();

function parseHistoryTimed(payload: unknown, entityId: string): { value: number; time: number }[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as Record<string, unknown>)[entityId];
  if (!Array.isArray(rows)) return [];
  const out: { value: number; time: number }[] = [];
  for (const row of rows as HistoryRow[]) {
    const value = toNumber(row.s ?? row.state);
    const time = typeof row.lu === 'number' ? row.lu * 1000 : undefined;
    if (value !== undefined && time !== undefined) out.push({ value, time });
  }
  return out;
}

function startOfDay(at: number): Date {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Today's reading for `entityId`, averaged into one bucket per hour
 * (`buckets[0]` is 00:00–01:00). Hours with no sample yet come back
 * `undefined` rather than `0` — the rest of today hasn't happened, and a
 * chart reading this should stop its line there instead of drawing a flat
 * guess for the future. Cached five minutes, keyed by the calendar day so
 * the cache turns over at midnight instead of serving yesterday's shape.
 */
export async function fetchDayBuckets(
  backend: HaBackend,
  entityId: string,
  buckets = 24,
): Promise<(number | undefined)[]> {
  const now = Date.now();
  const dayStart = startOfDay(now);
  const cacheKey = `${entityId}@${dayStart.toDateString()}`;
  const hit = dayCache.get(cacheKey);
  if (hit && now - hit.fetchedAt < DAY_CACHE_TTL_MS) return hit.promise ?? hit.values;

  const promise = backend
    .sendMessagePromise<unknown>({
      type: 'history/history_during_period',
      start_time: dayStart.toISOString(),
      end_time: new Date(now).toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
    })
    .then((payload) => {
      const rows = parseHistoryTimed(payload, entityId);
      const msPerBucket = (24 * 3600e3) / buckets;
      const sums = new Array<number>(buckets).fill(0);
      const counts = new Array<number>(buckets).fill(0);
      for (const { value, time } of rows) {
        const index = Math.min(
          buckets - 1,
          Math.max(0, Math.floor((time - dayStart.getTime()) / msPerBucket)),
        );
        sums[index]! += value;
        counts[index]! += 1;
      }
      const values = sums.map((sum, i) => (counts[i]! > 0 ? sum / counts[i]! : undefined));
      dayCache.set(cacheKey, { fetchedAt: Date.now(), values });
      return values;
    })
    .catch(() => {
      // A failed history call must not break the chart — it just draws no line.
      const values = new Array<number | undefined>(buckets).fill(undefined);
      dayCache.set(cacheKey, { fetchedAt: Date.now(), values });
      return values;
    });

  dayCache.set(cacheKey, {
    fetchedAt: now,
    values: hit?.values ?? new Array(buckets).fill(undefined),
    promise,
  });
  return promise;
}

export function clearDayCache(): void {
  dayCache.clear();
}

/** The two figures printed beside the line. `undefined` for an empty series. */
export function seriesRange(values: number[]): { min: number; max: number } | undefined {
  if (values.length === 0) return undefined;
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * Maps a series onto the card's `0 0 100 24` viewBox. A flat series is drawn
 * through the middle rather than collapsing onto an edge.
 */
export function sparklinePoints(values: number[], width = 100, height = 24, pad = 2): string {
  if (values.length < 2) return '';
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  const usable = height - pad * 2;

  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const normalised = span < 1e-6 ? 0.5 : (value - min) / span;
      const y = height - pad - normalised * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}
