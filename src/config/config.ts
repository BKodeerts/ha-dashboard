import type { AreaRegistryEntry, HassEntities } from '../ha/types';

/**
 * Everything that is a per-user preference rather than Home Assistant state.
 * Stored client-side (localStorage) — deliberately not YAML, so changing a
 * favourite or a tint never means editing a config file and restarting HA.
 */
export interface DashboardConfig {
  /** Area ids shown before the "Andere kamers" card. */
  favouriteAreas: string[];
  /** Accent edge colour per area id. */
  areaTint: Record<string, string>;
  /** Explicit ordering of area ids; unknown areas keep registry order after these. */
  roomOrder: string[];
  /** The one accent variable the design ships in four hues. */
  accent: string;
  /** Colour scheme. `auto` follows Home Assistant's own light/dark setting. */
  theme: ThemeSetting;
  /** Entity overrides. Left empty, each is auto-detected from the state machine. */
  alarmEntity?: string;
  personEntity?: string;
  weatherEntity?: string;
  power: {
    solar?: string;
    consumption?: string;
    /** Positive = importing from grid. Optional: derived from solar − consumption. */
    grid?: string;
    /** Sensors listed in the "top loads" block, sorted by value at render time. */
    loads: string[];
  };
  /** Radio presets per media_player entity id. */
  mediaPresets: Record<string, MediaPreset[]>;
  /** Lovelace card configs embedded in the sheets and the non-home tabs. */
  lovelace: {
    energy?: LovelaceCardConfig[];
    map?: LovelaceCardConfig;
    forecast?: LovelaceCardConfig;
    /** Rendered in the room sheet; `{{entity}}` is replaced with the temp sensor. */
    roomHistory?: LovelaceCardConfig;
    netwerk?: LovelaceCardConfig[];
    auto?: LovelaceCardConfig[];
  };
}

export interface MediaPreset {
  name: string;
  media_content_id: string;
  media_content_type: string;
}

export type LovelaceCardConfig = { type: string } & Record<string, unknown>;

export type ThemeSetting = 'auto' | 'light' | 'dark';

export const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'auto', label: 'Volg HA' },
  { value: 'light', label: 'Licht' },
  { value: 'dark', label: 'Donker' },
];

const STORAGE_KEY = 'ha-dashboard.config.v1';

/** The nine tints from the design, keyed by normalised area name. */
const TINT_BY_NAME: Record<string, string> = {
  living: 'oklch(0.78 0.07 250)',
  bureau: 'oklch(0.78 0.07 250)',
  slaapkamer: 'oklch(0.82 0.08 60)',
  clara: 'oklch(0.80 0.07 20)',
  oliver: 'oklch(0.82 0.07 150)',
  dressing: 'oklch(0.85 0.06 150)',
  waskot: 'oklch(0.82 0.06 250)',
  badkamer: 'oklch(0.82 0.06 220)',
  toilet: 'oklch(0.88 0.07 95)',
};

/** Hues cycled through for areas the design did not name. */
const TINT_CYCLE = [
  'oklch(0.78 0.07 250)',
  'oklch(0.82 0.08 60)',
  'oklch(0.80 0.07 20)',
  'oklch(0.82 0.07 150)',
  'oklch(0.88 0.07 95)',
  'oklch(0.82 0.06 220)',
];

export const ACCENTS = {
  amber: 'oklch(0.72 0.13 60)',
  blue: 'oklch(0.68 0.13 250)',
  green: 'oklch(0.70 0.12 150)',
  magenta: 'oklch(0.68 0.13 330)',
} as const;

export const DEFAULT_CONFIG: DashboardConfig = {
  favouriteAreas: [],
  areaTint: {},
  roomOrder: [],
  accent: ACCENTS.amber,
  theme: 'auto',
  power: { loads: [] },
  mediaPresets: {},
  lovelace: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Shallow-merges a stored (or YAML-supplied) partial over the defaults. */
export function mergeConfig(
  base: DashboardConfig,
  patch: Partial<DashboardConfig> | undefined,
): DashboardConfig {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    areaTint: { ...base.areaTint, ...(patch.areaTint ?? {}) },
    power: { ...base.power, ...(patch.power ?? {}) },
    mediaPresets: { ...base.mediaPresets, ...(patch.mediaPresets ?? {}) },
    lovelace: { ...base.lovelace, ...(patch.lovelace ?? {}) },
  };
}

export function loadStoredConfig(): Partial<DashboardConfig> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as Partial<DashboardConfig>) : undefined;
  } catch {
    return undefined;
  }
}

export function storeConfig(config: Partial<DashboardConfig>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    /* private mode / quota — the dashboard still works, it just won't remember */
  }
}

const firstEntityOfDomain = (states: HassEntities, domain: string): string | undefined =>
  Object.keys(states)
    .filter((id) => id.startsWith(`${domain}.`))
    .sort()[0];

const SOLAR_HINT = /(solar|zonnepane?l|pv|omvormer|inverter)/i;
const CONSUMPTION_HINT = /(verbruik|consumption|huis|house|total|totaal|load)/i;
const GRID_HINT = /(grid|net(to)?|injectie|afname|import|export)/i;

/**
 * Power sensors are picked by name, because HA has no device class that says
 * "this is the solar production". Anything unmatched becomes a candidate for the
 * top-loads list. Override any of it via `power` in the stored config.
 */
function derivePower(
  power: DashboardConfig['power'],
  states: HassEntities,
): DashboardConfig['power'] {
  const candidates = Object.keys(states).filter(
    (id) => id.startsWith('sensor.') && states[id]?.attributes?.device_class === 'power',
  );
  if (candidates.length === 0) return power;

  const nameOf = (id: string): string => {
    const friendly = states[id]?.attributes?.friendly_name;
    return `${id} ${typeof friendly === 'string' ? friendly : ''}`;
  };

  const solar = power.solar ?? candidates.find((id) => SOLAR_HINT.test(nameOf(id)));
  const consumption =
    power.consumption ??
    candidates.find((id) => id !== solar && CONSUMPTION_HINT.test(nameOf(id)));
  const grid =
    power.grid ??
    candidates.find((id) => id !== solar && id !== consumption && GRID_HINT.test(nameOf(id)));

  const loads =
    power.loads.length > 0
      ? power.loads
      : candidates.filter((id) => id !== solar && id !== consumption && id !== grid).slice(0, 8);

  const next: DashboardConfig['power'] = { loads };
  if (solar) next.solar = solar;
  if (consumption) next.consumption = consumption;
  if (grid) next.grid = grid;
  return next;
}

/**
 * Fills the blanks a fresh install leaves: which areas are favourites, what tint
 * each gets, and which alarm / person / weather entity to watch. Everything here
 * is overridable — this only decides what an unconfigured dashboard shows.
 */
export function withDerivedDefaults(
  config: DashboardConfig,
  areas: AreaRegistryEntry[],
  areaEntities: Map<string, string[]>,
  states: HassEntities,
): DashboardConfig {
  const areaTint = { ...config.areaTint };
  areas.forEach((area, index) => {
    if (areaTint[area.area_id]) return;
    const byName = TINT_BY_NAME[area.name.toLowerCase()];
    areaTint[area.area_id] = byName ?? TINT_CYCLE[index % TINT_CYCLE.length]!;
  });

  // Default favourites: the first five areas that actually have something to show.
  let favouriteAreas = config.favouriteAreas;
  if (favouriteAreas.length === 0) {
    favouriteAreas = areas
      .filter((area) => {
        const ids = areaEntities.get(area.area_id) ?? [];
        return ids.some(
          (id) =>
            id.startsWith('light.') ||
            id.startsWith('climate.') ||
            id.startsWith('media_player.'),
        );
      })
      .slice(0, 5)
      .map((area) => area.area_id);
  }

  const alarmEntity = config.alarmEntity ?? firstEntityOfDomain(states, 'alarm_control_panel');
  const personEntity = config.personEntity ?? firstEntityOfDomain(states, 'person');
  const weatherEntity = config.weatherEntity ?? firstEntityOfDomain(states, 'weather');

  const next: DashboardConfig = {
    ...config,
    areaTint,
    favouriteAreas,
    power: derivePower(config.power, states),
  };
  if (alarmEntity) next.alarmEntity = alarmEntity;
  if (personEntity) next.personEntity = personEntity;
  if (weatherEntity) next.weatherEntity = weatherEntity;
  return next;
}
