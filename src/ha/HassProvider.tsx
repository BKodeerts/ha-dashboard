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
  mergeConfig,
  mergeLayers,
  withDerivedDefaults,
  type ConfigLayer,
  type DashboardConfig,
} from '../config/config';
import { writeSnapshot } from './backend';
import {
  createConfigPush,
  EMPTY_LAYERS,
  lastUserId,
  markLegacyMigrated,
  readCache,
  readHousehold,
  readLegacyConfig,
  readPersonal,
  subscribeHousehold,
  subscribePersonal,
  writeCache,
  writeHousehold,
  writePersonal,
  type ConfigLayers,
  type ConfigPush,
} from './configStore';
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

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

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
  updateConfig(patch: ConfigLayer): void;
  /** Clears *your* layer, dropping you back to the household defaults. */
  resetConfig(): void;
  /**
   * Folds your layer into the household one, so every account inherits it.
   * Admin-only, and only on an HA new enough to have a system store — see
   * `householdAvailable`, which the settings view gates the button on.
   */
  publishHousehold(): Promise<void>;
  householdAvailable: boolean;
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
  yamlConfig?: ConfigLayer;
  children: ReactNode;
}) {
  const [rawEntities, setRawEntities] = useState<HassEntities>(initialEntities ?? {});
  const [overlays, setOverlays] = useState<Record<string, Overlay>>({});
  const [registries, setRegistries] = useState<Registries | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  /* Seeded from the local cache so the first paint is already the right
     dashboard. Panel mode knows the account synchronously; standalone has
     nobody to ask yet and falls back to whoever used this browser last, which
     the socket corrects a moment later. */
  const [layers, setLayers] = useState<ConfigLayers>(
    () => readCache(backend.hass?.user?.id ?? lastUserId()) ?? EMPTY_LAYERS,
  );
  const [householdAvailable, setHouseholdAvailable] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [live, setLive] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(() => backend.hass?.user ?? null);

  const entitiesRef = useRef(rawEntities);
  entitiesRef.current = rawEntities;

  const layersRef = useRef(layers);
  layersRef.current = layers;

  /** Coalesces bursts of settings taps into one write. Created with the socket. */
  const pushRef = useRef<ConfigPush | null>(null);

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);

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

  /* ── config, from Home Assistant ──────────────────────────────────────────
     Both stores are scoped by the *connection*, so neither read needs to wait
     for `auth/current_user` — only the local cache is keyed by account, and
     that is a separate effect below. */
  useEffect(() => {
    let cancelled = false;
    const push = createConfigPush(
      (config) => writePersonal(backend, config),
      (error) => notify(`instellingen bewaren mislukt — ${describe(error)}`),
    );
    pushRef.current = push;

    /* A subscription event that is merely our own write coming back, or one
       that arrives while a change of ours is still queued, would undo what the
       user just did. */
    const accept = (apply: (config: ConfigLayer) => void) => (config: ConfigLayer | undefined) => {
      if (cancelled || push.isPending() || push.isEcho(config)) return;
      apply(config ?? {});
    };
    const applyPersonal = (personal: ConfigLayer) =>
      setLayers((current) => ({ ...current, personal }));
    const applyHousehold = (household: ConfigLayer) =>
      setLayers((current) => ({ ...current, household }));

    const unsubscribers: (() => void)[] = [];
    const track = (unsubscribe: () => void) => {
      if (cancelled) unsubscribe();
      else unsubscribers.push(unsubscribe);
    };

    void (async () => {
      const household = await readHousehold(backend);
      if (cancelled) return;
      // `ok: false` is an HA older than the system store, not a failure. The
      // YAML block is the household layer there, and publishing is hidden.
      setHouseholdAvailable(household.ok);
      if (household.ok) applyHousehold(household.config ?? {});

      const personal = await readPersonal(backend);
      if (cancelled) return;
      if (personal.ok) {
        if (personal.config) {
          applyPersonal(personal.config);
        } else {
          /* Nothing on the server yet. An install upgrading from v4 has its
             settings in the old browser-local blob, so they move up here
             rather than being lost — once, after which the blob is retired. */
          const legacy = readLegacyConfig();
          if (legacy) {
            try {
              await writePersonal(backend, legacy);
              markLegacyMigrated();
            } catch {
              /* keep the blob; the next load tries again */
            }
            if (!cancelled) applyPersonal(legacy);
          } else {
            applyPersonal({});
          }
        }
      }

      if (household.ok) track(await subscribeHousehold(backend, accept(applyHousehold)));
      track(await subscribePersonal(backend, accept(applyPersonal)));
    })();

    return () => {
      cancelled = true;
      push.dispose();
      pushRef.current = null;
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [backend, notify]);

  /* Mirror whatever the server said into this account's cache, for the next
     cold start. Keyed by account, so a shared tablet never paints one person's
     dashboard for another. */
  useEffect(() => {
    writeCache(user?.id, layers);
  }, [user?.id, layers]);

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

  /* ── config: defaults ← panel YAML ← household ← account, then blanks derived ── */
  const config = useMemo(() => {
    const merged = mergeConfig(
      mergeConfig(mergeConfig(DEFAULT_CONFIG, yamlConfig), layers.household),
      layers.personal,
    );
    if (!registries) return merged;
    // Who to follow defaults to "everyone but me", so the account has to be
    // resolved before the blanks are filled — hence `user` in the deps.
    const me = currentPerson(entitiesRef.current, user).entityId;
    return withDerivedDefaults(merged, registries.areas, areaEntities, entitiesRef.current, me);
    // `live` is in the deps so derivation reruns once real states have landed.
  }, [yamlConfig, layers, registries, areaEntities, live, user]);

  /**
   * Optimistic: the UI flips now and the server catches up. Only what was
   * actually set lands in your layer — merging the defaults in would shadow the
   * household's choices with values nobody made.
   */
  const updateConfig = useCallback((patch: ConfigLayer) => {
    setLayers((current) => {
      const personal = mergeLayers(current.personal, patch);
      pushRef.current?.queue(personal);
      return { ...current, personal };
    });
  }, []);

  /** Clears your layer only, so you fall back to household → YAML → defaults. */
  const resetConfig = useCallback(() => {
    pushRef.current?.cancel();
    setLayers((current) => ({ ...current, personal: {} }));
    writePersonal(backend, null).catch((error: unknown) => {
      notify(`herstellen mislukt — ${describe(error)}`);
    });
  }, [backend, notify]);

  const publishHousehold = useCallback(async () => {
    // The stored layers, deliberately not the derived config: freezing today's
    // auto-detected alarm and power sensors into the household layer would stop
    // every other account from detecting its own.
    const { household, personal } = layersRef.current;
    const merged = mergeLayers(household, personal);
    pushRef.current?.cancel();
    await writeHousehold(backend, merged);
    // Clearing your own layer afterwards means you inherit what you just
    // published, rather than shadowing it with an identical copy that would
    // ignore every later household change.
    await writePersonal(backend, null);
    setLayers({ household: merged, personal: {} });
  }, [backend]);

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
        notify(`${serviceCall.domain}.${serviceCall.service} mislukt — ${describe(error)}`);
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
      publishHousehold,
      householdAvailable,
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
      publishHousehold,
      householdAvailable,
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
