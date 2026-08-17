import {
  callService,
  createConnection,
  createLongLivedTokenAuth,
  getAuth,
  subscribeEntities,
  ERR_HASS_HOST_REQUIRED,
  type Auth,
  type AuthData,
  type Connection,
} from 'home-assistant-js-websocket';
import type { ConnectionStatus, HaBackend, HassEntities, HomeAssistant } from './types';

/** Wraps a live `Connection` (from either mount mode) in the `HaBackend` shape. */
function fromConnection(connection: Connection, hass: HomeAssistant | null): HaBackend {
  return {
    hass,
    subscribeEntities: (cb) => subscribeEntities(connection, cb),
    callService: (domain, service, data, target) =>
      callService(connection, domain, service, data, target),
    sendMessagePromise: (message) => connection.sendMessagePromise(message),
    subscribeMessage: (cb, message) => connection.subscribeMessage(cb, message),
    subscribeStatus: (cb) => {
      const onReady = () => cb('connected');
      const onDisconnected = () => cb('disconnected');
      connection.addEventListener('ready', onReady);
      connection.addEventListener('disconnected', onDisconnected);
      connection.addEventListener('reconnect-error', onDisconnected);
      cb(connection.connected ? 'connected' : 'connecting');
      return () => {
        connection.removeEventListener('ready', onReady);
        connection.removeEventListener('disconnected', onDisconnected);
        connection.removeEventListener('reconnect-error', onDisconnected);
      };
    },
  };
}

/**
 * Panel mode: HA already authenticated us and handed over a live connection.
 * No token ever touches this code.
 *
 * `hass` is read through a getter because HA replaces the object on every state
 * change, and the embedded Lovelace cards need the current one.
 */
export function panelBackend(
  getHass: () => HomeAssistant,
  onDarkMode?: (cb: (dark: boolean | undefined) => void) => () => void,
): HaBackend {
  const base = fromConnection(getHass().connection, null);
  return {
    ...base,
    get hass() {
      return getHass();
    },
    ...(onDarkMode ? { subscribeDarkMode: onDarkMode } : {}),
  };
}

const TOKEN_KEY = 'ha-dashboard.auth.v1';
const HOST_KEY = 'ha-dashboard.hassUrl';

const saveTokens = (data: unknown): void => {
  try {
    if (data === null) localStorage.removeItem(TOKEN_KEY);
    else localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
};

const loadTokens = async (): Promise<AuthData | null> => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? (JSON.parse(raw) as AuthData) : null;
  } catch {
    return null;
  }
};

/**
 * Standalone mode: the app is hosted outside HA, so it runs the OAuth (indieauth)
 * flow itself and stores the refresh token locally. A long-lived token is only
 * read from the build env for kiosk deployments — see README on why that should
 * sit behind a proxy rather than in a public bundle.
 */
export async function standaloneBackend(): Promise<HaBackend> {
  const longLived = import.meta.env.VITE_HASS_TOKEN as string | undefined;
  const envUrl = import.meta.env.VITE_HASS_URL as string | undefined;
  const hassUrl = envUrl ?? localStorage.getItem(HOST_KEY) ?? undefined;

  let auth: Auth;
  if (longLived && hassUrl) {
    auth = createLongLivedTokenAuth(hassUrl, longLived);
  } else {
    try {
      auth = await getAuth({ hassUrl, saveTokens, loadTokens });
    } catch (err) {
      if (err === ERR_HASS_HOST_REQUIRED) {
        const entered = prompt('Home Assistant URL', 'http://homeassistant.local:8123');
        if (!entered) throw err;
        localStorage.setItem(HOST_KEY, entered);
        auth = await getAuth({ hassUrl: entered, saveTokens, loadTokens });
      } else {
        throw err;
      }
    }
  }

  const connection = await createConnection({ auth });
  return fromConnection(connection, null);
}

const SNAPSHOT_KEY = 'ha-dashboard.snapshot.v1';

/**
 * Last known entity snapshot, so the first paint shows real values instead of
 * placeholders while the socket comes up.
 */
export function readSnapshot(): HassEntities | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as HassEntities) : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(entities: HassEntities): void {
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(entities));
  } catch {
    /* quota — snapshots are an optimisation, not a requirement */
  }
}

export type { ConnectionStatus };
