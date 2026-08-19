import type { ConfigLayer } from '../config/config';
import { isRecord } from '../config/config';
import type { HaBackend } from './types';

/**
 * Where the dashboard's personal settings live: Home Assistant's own frontend
 * storage, not the browser.
 *
 * **user data** — `frontend.user_data_{user_id}` on the server, scoped to the
 * logged-in account. Any user may read and write their own; available in every
 * HA this dashboard supports. It is a keyed dictionary, so the whole config
 * sits under one key.
 *
 * The household layer lives in the card's own YAML instead (edited visually
 * or by hand in the Lovelace card editor) — there is no server-side household
 * store here any more.
 */
const STORE_KEY = 'ha-dashboard';

/**
 * The stored value is an envelope rather than the bare config, so the shape can
 * be migrated in place. localStorage could be versioned by renaming the key
 * because a human could always paste a new blob into a console; nobody can
 * hand-edit HA's store that way, so the version travels with the data.
 */
const CONFIG_VERSION = 1;

interface Envelope {
  version: number;
  config: ConfigLayer;
}

/* ── local cache ───────────────────────────────────────────────────────────
   Not a source of truth and not an offline mode — purely a first-paint cache,
   the same bet `readSnapshot` makes for entity states. HA is one socket
   round trip away, and without this the dashboard paints derived defaults for
   that beat and then visibly re-sorts the room grid and re-tints it. */

const CACHE_PREFIX = 'ha-dashboard.cache.';
const LAST_USER_KEY = 'ha-dashboard.lastUser';

/** Pre-v5 storage: one un-namespaced blob for whoever held the browser. */
const LEGACY_KEY = 'ha-dashboard.config.v2';

/**
 * A read either reached the store or it did not, and the difference matters:
 * "HA says you have nothing stored" is what triggers the migration of a legacy
 * blob upward, while "HA cannot answer" (an install that has never heard of
 * `frontend/get_user_data`, vanishingly rare) must leave everything alone.
 */
export type StoreRead =
  | { ok: true; config: ConfigLayer | undefined }
  | { ok: false };

/**
 * Unwraps `{ value: { version, config } }`.
 *
 * Three shapes all mean "nothing stored" and none of them is an error: `value`
 * is `null` when the key was never written, the whole result is `undefined`
 * from a backend that does not implement the command (see `mock.ts`), and the
 * envelope may be from a future version this build cannot read.
 */
function unwrap(result: unknown): ConfigLayer | undefined {
  if (!isRecord(result)) return undefined;
  const value = result.value;
  if (!isRecord(value)) return undefined;
  const envelope = value as Partial<Envelope>;
  if (envelope.version !== CONFIG_VERSION) return undefined;
  return isRecord(envelope.config) ? (envelope.config as ConfigLayer) : undefined;
}

const envelope = (config: ConfigLayer): Envelope => ({
  version: CONFIG_VERSION,
  config,
});

async function read(backend: HaBackend, type: string): Promise<StoreRead> {
  try {
    const result = await backend.sendMessagePromise<unknown>({ type, key: STORE_KEY });
    return { ok: true, config: unwrap(result) };
  } catch {
    // `unknown_command` on an HA that predates the store. Not worth a banner:
    // the layer simply is not there.
    return { ok: false };
  }
}

/** This account's own settings. */
export const readPersonal = (backend: HaBackend): Promise<StoreRead> =>
  read(backend, 'frontend/get_user_data');

/** Rejects on failure — the caller turns that into a toast. */
export const writePersonal = (
  backend: HaBackend,
  config: ConfigLayer | null,
): Promise<unknown> =>
  backend.sendMessagePromise({
    type: 'frontend/set_user_data',
    key: STORE_KEY,
    value: config === null ? null : envelope(config),
  });

/**
 * Live updates, so a change made on a phone lands on the wall tablet without a
 * reload. HA replays the current value immediately on subscribe, which is why
 * the caller can treat the first event exactly like any other.
 *
 * Older HA has no `frontend/subscribe_*`; the one-shot read has already run by
 * then, so the fallback is simply not to sync.
 */
async function subscribe(
  backend: HaBackend,
  type: string,
  cb: (config: ConfigLayer | undefined) => void,
): Promise<() => void> {
  try {
    return await backend.subscribeMessage<unknown>((event) => cb(unwrap(event)), {
      type,
      key: STORE_KEY,
    });
  } catch {
    return () => undefined;
  }
}

export const subscribePersonal = (
  backend: HaBackend,
  cb: (config: ConfigLayer | undefined) => void,
): Promise<() => void> => subscribe(backend, 'frontend/subscribe_user_data', cb);

/* ── the local cache ───────────────────────────────────────────────────── */

/**
 * Cached per account, so a tablet several people log into never paints one
 * person's room order for another.
 *
 * Old caches may still carry a `{ household, personal }` envelope from before
 * the household store was removed — only `personal` is read out of it.
 */
export function readCache(userId: string | undefined): ConfigLayer | undefined {
  if (!userId) return undefined;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + userId);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    return isRecord(parsed.personal) ? (parsed.personal as ConfigLayer) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCache(userId: string | undefined, personal: ConfigLayer): void {
  if (!userId) return;
  try {
    localStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(personal));
    localStorage.setItem(LAST_USER_KEY, userId);
  } catch {
    /* private mode / quota — the cache is an optimisation, not a requirement */
  }
}

/**
 * Who this browser belongs to, as far as the last session could tell.
 *
 * Panel mode never needs this: HA sets `hass` — account included — before the
 * element starts, so the right cache is read with no round trip at all. It is
 * the standalone build that has nobody to ask until the socket answers, and
 * guessing the previous user beats painting defaults. The guess is corrected as
 * soon as `auth/current_user` comes back.
 */
export function lastUserId(): string | undefined {
  try {
    return localStorage.getItem(LAST_USER_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * The pre-v5 blob, read once so an existing install keeps its favourites, order
 * and tints when they move up to the server. Left in place rather than deleted:
 * it costs a few hundred bytes and it is the only way back if a migration goes
 * wrong.
 */
export function readLegacyConfig(): ConfigLayer | undefined {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return undefined;
    // v4 read the user off the account. A stored `me` from v3 is dropped rather
    // than migrated: it was a *guess* the user made about themselves, and
    // `hass.user` is the answer.
    const { me: _dropped, ...rest } = parsed as ConfigLayer & { me?: string };
    return Object.keys(rest).length > 0 ? rest : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Retires the legacy blob once its contents are safely on the server, by moving
 * it aside rather than deleting it. Without this, resetting your settings and
 * reloading would migrate the same pre-v5 blob back up and undo the reset.
 */
export function markLegacyMigrated(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw === null) return;
    localStorage.setItem(`${LEGACY_KEY}.migrated`, raw);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

/* ── pushing changes ───────────────────────────────────────────────────── */

/** Key order is not guaranteed to survive the round trip through HA's store. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Every settings tap used to be a synchronous `localStorage` write; each one is
 * now a websocket round trip, and the tint swatches and room-order chevrons fire
 * in bursts. This coalesces a burst into one write of the whole blob, and tells
 * the caller when an incoming subscription event is merely its own change coming
 * back.
 */
export interface ConfigPush {
  /** Queue the full blob. Later calls replace earlier ones. */
  queue(config: ConfigLayer): void;
  /** Our own write echoing back through the subscription. */
  isEcho(config: ConfigLayer | undefined): boolean;
  /** A queued write has not landed yet, so remote state is behind ours. */
  isPending(): boolean;
  /** Send anything queued, now. */
  flush(): void;
  /** Drop anything queued — the caller is about to write something else. */
  cancel(): void;
  dispose(): void;
}

const PUSH_DEBOUNCE_MS = 400;

export function createConfigPush(
  send: (config: ConfigLayer) => Promise<unknown>,
  onError: (error: unknown) => void,
): ConfigPush {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued: ConfigLayer | null = null;
  let lastSent: string | null = null;

  const flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (queued === null) return;
    const config = queued;
    queued = null;
    lastSent = canonical(config);
    send(config).catch(onError);
  };

  // A change made just before the tab is hidden or the panel is navigated away
  // from would otherwise sit in the timer and die with the page.
  const onHide = () => flush();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', onHide);

  return {
    queue(config) {
      queued = config;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(flush, PUSH_DEBOUNCE_MS);
    },
    isEcho: (config) => lastSent !== null && canonical(config ?? {}) === lastSent,
    isPending: () => queued !== null,
    flush,
    cancel() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      queued = null;
    },
    dispose() {
      flush();
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', onHide);
    },
  };
}
