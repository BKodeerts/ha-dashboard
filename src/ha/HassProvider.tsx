import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_CONFIG,
  loadStoredConfig,
  mergeConfig,
  storeConfig,
  withDerivedDefaults,
  type DashboardConfig,
} from '../config/config';
import { writeSnapshot } from './backend';
import { fetchRegistries, resolveAreaEntities } from './registry';
import { currentPerson } from './selectors';
import { execute, type ServiceCall } from './services';
import type {
  ConnectionStatus,
  CurrentUser,
  HaBackend,
  HassEntities,
  HomeAssistant,
  Registries,
} from './types';

interface Overlay {
  state?: string;
  attributes?: Record<string, unknown>;
  /** `last_updated` of the entity when the overlay was applied. */
  base?: string;
  expires: number;
}

/** How long an unconfirmed optimistic value survives before the truth wins. */
const OVERLAY_TTL_MS = 5000;

export interface Toast {
  id: number;
  message: string;
}

interface HassContextValue {
  backend: HaBackend;
  hass: HomeAssistant | null;
  entities: HassEntities;
  registries: Registries | null;
  areaEntities: Map<string, string[]>;
  /**
   * The logged-in Home Assistant account. v4 derives "who am I" from this
   * instead of asking for it in settings; `null` until it resolves, and
   * permanently `null` on a connection that will not say.
   */
  user: CurrentUser | null;
  config: DashboardConfig;
  updateConfig(patch: Partial<DashboardConfig>): void;
  resetConfig(): void;
  status: ConnectionStatus;
  ready: boolean;
  call(serviceCall: ServiceCall | null): Promise<void>;
  toasts: Toast[];
  notify(message: string): void;
}

const HassContext = createContext<HassContextValue | null>(null);

const EMPTY_AREA_ENTITIES = new Map<string, string[]>();

function applyOverlays(entities: HassEntities, overlays: Record<string, Overlay>): HassEntities {
  const ids = Object.keys(overlays);
  if (ids.length === 0) return entities;
  const next: HassEntities = { ...entities };
  for (const entityId of ids) {
    const base = next[entityId];
    const overlay = overlays[entityId]!;
    if (!base) continue;
    next[entityId] = {
      ...base,
      ...(overlay.state !== undefined ? { state: overlay.state } : {}),
      ...(overlay.attributes
        ? { attributes: { ...base.attributes, ...overlay.attributes } }
        : {}),
    };
  }
  return next;
}

/** Drops overlays the server has since answered, and ones that timed out. */
function pruneOverlays(
  overlays: Record<string, Overlay>,
  entities: HassEntities,
): Record<string, Overlay> {
  const now = Date.now();
  let changed = false;
  const next: Record<string, Overlay> = {};
  for (const [entityId, overlay] of Object.entries(overlays)) {
    const live = entities[entityId];
    const confirmed = live !== undefined && live.last_updated !== overlay.base;
    if (confirmed || overlay.expires <= now) changed = true;
    else next[entityId] = overlay;
  }
  return changed ? next : overlays;
}

export function HassProvider({
  backend,
  initialEntities,
  yamlConfig,
  children,
}: {
  backend: HaBackend;
  initialEntities?: HassEntities;
  yamlConfig?: Partial<DashboardConfig>;
  children: ReactNode;
}) {
  const [rawEntities, setRawEntities] = useState<HassEntities>(initialEntities ?? {});
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({});
  const [registries, setRegistries] = useState<Registries | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [stored, setStored] = useState<Partial<DashboardConfig>>(() => loadStoredConfig() ?? {});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [live, setLive] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(() => backend.hass?.user ?? null);

  const entitiesRef = useRef(rawEntities);
  entitiesRef.current = rawEntities;

  /* ── the one subscription that feeds the whole home screen ──────────────── */
  useEffect(() => {
    const unsubscribe = backend.subscribeEntities((entities) => {
      setRawEntities(entities);
      setLive(true);
      setOverlays((current) =>
        Object.keys(current).length === 0 ? current : pruneOverlays(current, entities),
      );
    });
    return unsubscribe;
  }, [backend]);

  useEffect(() => backend.subscribeStatus(setStatus), [backend]);

  /* ── who is holding the phone ────────────────────────────────────────────
     Panel mode already has it on `hass`; standalone asks the socket. Either
     way it is read once — an account does not change under a running app. */
  useEffect(() => {
    const fromPanel = backend.hass?.user;
    if (fromPanel) {
      setUser(fromPanel);
      return;
    }
    let cancelled = false;
    backend
      .sendMessagePromise<CurrentUser | null>({ type: 'auth/current_user' })
      .then((current) => {
        // A backend that does not answer this resolves `undefined`, which is a
        // household without a name rather than an error worth a banner.
        if (!cancelled && current?.id) setUser(current);
      })
      .catch(() => {
        /* no account to read — settings says so, the header simply has no you */
      });
    return () => {
      cancelled = true;
    };
  }, [backend]);

  /* Snapshot the last known states so the next cold start paints real values. */
  useEffect(() => {
    if (!live) return;
    const id = setTimeout(() => writeSnapshot(rawEntities), 2000);
    return () => clearTimeout(id);
  }, [live, rawEntities]);

  /* ── registries, refetched whenever HA reports a registry change ─────────── */
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchRegistries(backend)
        .then((next) => {
          if (!cancelled) setRegistries(next);
        })
        .catch(() => {
          /* leave the previous registries in place; the banner shows the state */
        });
    };
    load();

    const unsubscribers: (() => void)[] = [];
    for (const type of [
      'area_registry_updated',
      'device_registry_updated',
      'entity_registry_updated',
    ]) {
      backend
        .subscribeMessage(load, { type: 'subscribe_events', event_type: type })
        .then((unsubscribe) => {
          if (cancelled) unsubscribe();
          else unsubscribers.push(unsubscribe);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [backend]);

  const areaEntities = useMemo(
    () => (registries ? resolveAreaEntities(registries) : EMPTY_AREA_ENTITIES),
    [registries],
  );

  const entities = useMemo(() => applyOverlays(rawEntities, overlays), [rawEntities, overlays]);

  /* ── config: defaults ← panel YAML ← localStorage, then blanks derived ───── */
  const config = useMemo(() => {
    const merged = mergeConfig(mergeConfig(DEFAULT_CONFIG, yamlConfig), stored);
    if (!registries) return merged;
    // Who to follow defaults to "everyone but me", so the account has to be
    // resolved before the blanks are filled — hence `user` in the deps.
    const me = currentPerson(entitiesRef.current, user).entityId;
    return withDerivedDefaults(merged, registries.areas, areaEntities, entitiesRef.current, me);
    // `live` is in the deps so derivation reruns once real states have landed.
  }, [yamlConfig, stored, registries, areaEntities, live, user]);

  const updateConfig = useCallback((patch: Partial<DashboardConfig>) => {
    setStored((current) => {
      const next = mergeConfig(mergeConfig(DEFAULT_CONFIG, current), patch);
      storeConfig(next);
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setStored({});
    storeConfig({});
  }, []);

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

  /* ── writes: flip locally, then reconcile (or revert with a toast) ───────── */
  const call = useCallback(
    async (serviceCall: ServiceCall | null) => {
      if (!serviceCall) return;
      const { optimistic } = serviceCall;

      if (optimistic.length > 0) {
        setOverlays((current) => {
          const next = { ...current };
          for (const patch of optimistic) {
            const entry: Overlay = { expires: Date.now() + OVERLAY_TTL_MS };
            if (patch.state !== undefined) entry.state = patch.state;
            if (patch.attributes) entry.attributes = patch.attributes;
            const base = entitiesRef.current[patch.entityId]?.last_updated;
            if (base !== undefined) entry.base = base;
            next[patch.entityId] = entry;
          }
          return next;
        });
      }

      try {
        await execute(backend, serviceCall);
      } catch (error) {
        setOverlays((current) => {
          const next = { ...current };
          for (const patch of optimistic) delete next[patch.entityId];
          return next;
        });
        const detail = error instanceof Error ? error.message : String(error);
        notify(`${serviceCall.domain}.${serviceCall.service} mislukt — ${detail}`);
      }
    },
    [backend, notify],
  );

  /* Expire overlays that no `state_changed` ever confirmed. */
  useEffect(() => {
    if (Object.keys(overlays).length === 0) return;
    const id = setTimeout(() => {
      setOverlays((current) => pruneOverlays(current, entitiesRef.current));
    }, OVERLAY_TTL_MS);
    return () => clearTimeout(id);
  }, [overlays]);

  const value = useMemo<HassContextValue>(
    () => ({
      backend,
      hass: backend.hass,
      entities,
      registries,
      areaEntities,
      user,
      config,
      updateConfig,
      resetConfig,
      status,
      ready: registries !== null && live,
      call,
      toasts,
      notify,
    }),
    [
      backend,
      entities,
      registries,
      areaEntities,
      user,
      config,
      updateConfig,
      resetConfig,
      status,
      live,
      call,
      toasts,
      notify,
    ],
  );

  return <HassContext.Provider value={value}>{children}</HassContext.Provider>;
}

export function useHass(): HassContextValue {
  const context = useContext(HassContext);
  if (!context) throw new Error('useHass must be used inside <HassProvider>');
  return context;
}
