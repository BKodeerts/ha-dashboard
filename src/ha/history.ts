import { toNumber } from './selectors';
import type { HaBackend } from './types';

/** Number of points the card's polyline draws, per the design. */
export const SPARK_POINTS = 22;

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
