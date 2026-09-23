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

/* ── last known value ────────────────────────────────────────────────────
   A device that drops off the network takes its battery sensor with it: the
   live state goes `unavailable`, and HA keeps no "last good value" on the
   state object. The recorder does, for as long as its retention (10 days by
   default) reaches back — so ask it. */

const LAST_KNOWN_LOOKBACK_MS = 30 * 24 * 3600e3;
const LAST_KNOWN_TTL_MS = 30 * 60 * 1000;

export interface LastKnown {
  value: number;
  /** When that value was recorded, in ms. */
  at: number;
}

interface LastKnownEntry {
  fetchedAt: number;
  value: LastKnown | undefined;
  promise?: Promise<LastKnown | undefined>;
}

const lastKnownCache = new Map<string, LastKnownEntry>();

/**
 * The most recent numeric state `entityId` had, or `undefined` when history
 * holds none (retention ran out, or the entity was never recorded). Cached
 * for half an hour — a silent device's last reading does not change.
 */
export async function fetchLastKnown(
  backend: HaBackend,
  entityId: string,
): Promise<LastKnown | undefined> {
  const now = Date.now();
  const hit = lastKnownCache.get(entityId);
  if (hit && now - hit.fetchedAt < LAST_KNOWN_TTL_MS) return hit.promise ?? hit.value;

  const promise = backend
    .sendMessagePromise<unknown>({
      type: 'history/history_during_period',
      start_time: new Date(now - LAST_KNOWN_LOOKBACK_MS).toISOString(),
      end_time: new Date(now).toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
    })
    .then((payload) => {
      const rows = parseHistoryTimed(payload, entityId);
      const last = rows[rows.length - 1];
      const value = last ? { value: last.value, at: last.time } : undefined;
      lastKnownCache.set(entityId, { fetchedAt: Date.now(), value });
      return value;
    })
    .catch(() => {
      lastKnownCache.set(entityId, { fetchedAt: Date.now(), value: undefined });
      return undefined;
    });

  lastKnownCache.set(entityId, { fetchedAt: now, value: hit?.value, promise });
  return promise;
}

/* ── when a tracker actually went quiet ──────────────────────────────────
   `last_changed` resets on every Home Assistant restart: the state object is
   rebuilt, so a tracker that has been `unavailable` for nine days reads as
   gone "since the reboot". The recorder still has the real transition, so
   the Netwerk tab asks it instead. */

const SILENCE_LOOKBACK_MS = 30 * 24 * 3600e3;

/** States a restart can bounce a tracker through without it having talked. */
const IN_BETWEEN = new Set(['unavailable', 'unknown']);

export interface SilentSince {
  /** When the current silence began, in ms. */
  since: number;
  /**
   * The silence reaches back to the oldest row history still holds — the
   * recorder's retention (10 days by default) cut it off, so the real
   * silence is at least this long.
   */
  atLeast: boolean;
}

interface SilentSinceEntry {
  value: SilentSince | undefined;
  promise?: Promise<SilentSince | undefined>;
}

/**
 * Keyed by entity *and* its `last_changed`: an answer holds for as long as
 * the live state object does. A restart, or the device coming back and
 * dropping off again, changes `last_changed` and so asks again — no TTL
 * needed, and no risk of a stale "since" from an earlier outage.
 */
const silentSinceCache = new Map<string, SilentSinceEntry>();

type StateRow = { state: string; time: number };

function parseHistoryStates(payload: unknown, entityId: string): StateRow[] {
  if (!payload || typeof payload !== 'object') return [];
  const rows = (payload as Record<string, unknown>)[entityId];
  if (!Array.isArray(rows)) return [];
  const out: StateRow[] = [];
  for (const row of rows as HistoryRow[]) {
    const state = row.s ?? row.state;
    if (typeof state === 'string' && typeof row.lu === 'number') {
      out.push({ state, time: row.lu * 1000 });
    }
  }
  return out;
}

/**
 * Start of the trailing run of rows that are the current (silent) state, or
 * `unavailable`/`unknown` around a restart. A connectivity sensor that reads
 * `off` goes `off → unavailable → off` across a reboot; that is still one
 * silence, not a fresh one.
 */
export function silentRunStart(rows: StateRow[], current: string): SilentSince | undefined {
  let start: number | undefined;
  let index = rows.length - 1;
  for (; index >= 0; index -= 1) {
    const { state, time } = rows[index]!;
    if (state !== current && !IN_BETWEEN.has(state)) break;
    start = time;
  }
  if (start === undefined) return undefined;
  return { since: start, atLeast: index < 0 };
}

/**
 * When `entityId` really went into its current state, looking past any
 * restarts. `undefined` when history can't tell (not recorded, call failed)
 * — the caller keeps using `last_changed` then.
 */
export async function fetchSilentSince(
  backend: HaBackend,
  entityId: string,
  current: string,
  lastChanged: string,
): Promise<SilentSince | undefined> {
  const key = `${entityId}@${lastChanged}`;
  const hit = silentSinceCache.get(key);
  if (hit) return hit.promise ?? hit.value;

  const now = Date.now();
  const promise = backend
    .sendMessagePromise<unknown>({
      type: 'history/history_during_period',
      start_time: new Date(now - SILENCE_LOOKBACK_MS).toISOString(),
      end_time: new Date(now).toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
    })
    .then((payload) => {
      const value = silentRunStart(parseHistoryStates(payload, entityId), current);
      silentSinceCache.set(key, { value });
      return value;
    })
    .catch(() => {
      // Not cached: a failed call is worth retrying on the next pass.
      silentSinceCache.delete(key);
      return undefined;
    });

  silentSinceCache.set(key, { value: undefined, promise });
  return promise;
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
 * Today's reading for `entityId`, averaged into `buckets` even slices across
 * the day (`buckets[0]` is 00:00–00:15 at the default). 96 rather than one
 * per hour: a power sensor logging roughly a point a minute has real
 * curvature within an hour — sunrise/sunset ramps, a midday cloud — that an
 * hourly mean flattens into a straight line, drawing a chart that looks
 * artificially jagged connecting only 24 points across a whole day. Slices
 * with no sample yet come back `undefined` rather than `0` — the rest of
 * today hasn't happened, and a chart reading this should stop its line there
 * instead of drawing a flat guess for the future. Cached five minutes, keyed
 * by the calendar day so the cache turns over at midnight instead of serving
 * yesterday's shape.
 */
export async function fetchDayBuckets(
  backend: HaBackend,
  entityId: string,
  buckets = 96,
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
