import type { AreaRegistryEntry, HassEntities } from '../ha/types';

/**
 * Everything that is a per-user preference rather than Home Assistant state.
 * Stored client-side (localStorage) — deliberately not YAML, so changing a
 * favourite or a tint never means editing a config file and restarting HA.
 */
export interface DashboardConfig {
  /** Area ids sorted to the front of the room grid. */
  favouriteAreas: string[];
  /** Tint spine colour per area id. */
  areaTint: Record<string, string>;
  /** Explicit ordering of area ids; unknown areas keep registry order after these. */
  roomOrder: string[];
  /** Colour scheme. `auto` follows Home Assistant's own light/dark setting. */
  theme: ThemeSetting;
  /**
   * Where the surfaces and text colours come from. `ha` reads them off Home
   * Assistant's active theme, so the dashboard matches the frontend around it;
   * `design` keeps the v2 handoff's palette regardless of the theme.
   *
   * Outside a panel there is no HA theme to read, and `ha` paints the handoff
   * palette anyway — see the `[data-palette='ha']` block in styles.css.
   */
  palette: PaletteSetting;
  /**
   * Which `person.*` entity is the user holding the phone. The presence pill
   * deliberately shows *the other one* — you already know where you are.
   */
  me?: string;
  /** Entity overrides. Left empty, each is auto-detected from the state machine. */
  alarmEntity?: string;
  weatherEntity?: string;
  power: {
    solar?: string;
    consumption?: string;
    /** Positive = importing from grid. Optional: derived from solar − consumption. */
    grid?: string;
    /** Sensors listed in the "top loads" block, sorted by value at render time. */
    loads: string[];
    /** Full scale of the two bars on the Energie tab, in watts. */
    scale: number;
  };
  /** The Auto tab's heading; the subtitle is built from whatever is set. */
  car: {
    name?: string;
    battery?: string;
    range?: string;
  };
  /** Radio presets per media_player entity id. */
  mediaPresets: Record<string, MediaPreset[]>;
  /**
   * Lovelace card configs. After v2 these are only the energy dashboard, the car
   * cards, and the two cards the weather and presence sheets embed — the room
   * card draws its own history line and Netwerk is not a card page at all.
   */
  lovelace: {
    energy?: LovelaceCardConfig[];
    map?: LovelaceCardConfig;
    forecast?: LovelaceCardConfig;
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

export type PaletteSetting = 'ha' | 'design';

export const PALETTES: { value: PaletteSetting; label: string }[] = [
  { value: 'ha', label: 'Home Assistant' },
  { value: 'design', label: 'Ontwerp' },
];

/** v2 renumbers the stored shape: accent and personEntity are gone. */
const STORAGE_KEY = 'ha-dashboard.config.v2';

/**
 * The nine tints from the v2 handoff, keyed by normalised area name — personal
 * rooms distinct, wet rooms cool, dry rooms warm.
 */
const TINT_BY_NAME: Record<string, string> = {
  living: 'oklch(0.74 0.07 70)',
  bureau: 'oklch(0.74 0.07 55)',
  dressing: 'oklch(0.76 0.06 95)',
  slaapkamer: 'oklch(0.62 0.10 300)',
  clara: 'oklch(0.72 0.11 350)',
  oliver: 'oklch(0.70 0.10 195)',
  badkamer: 'oklch(0.72 0.09 230)',
  waskot: 'oklch(0.70 0.09 245)',
  toilet: 'oklch(0.74 0.08 215)',
};

/** Hues cycled through for areas the design did not name. */
export const TINT_CYCLE = [
  'oklch(0.74 0.07 70)',
  'oklch(0.62 0.10 300)',
  'oklch(0.72 0.11 350)',
  'oklch(0.70 0.10 195)',
  'oklch(0.72 0.09 230)',
  'oklch(0.76 0.06 95)',
];

export const DEFAULT_CONFIG: DashboardConfig = {
  favouriteAreas: [],
  areaTint: {},
  roomOrder: [],
  theme: 'auto',
  palette: 'ha',
  power: { loads: [], scale: 2000 },
  car: {},
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
    car: { ...base.car, ...(patch.car ?? {}) },
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

  const next: DashboardConfig['power'] = { loads, scale: power.scale };
  if (solar) next.solar = solar;
  if (consumption) next.consumption = consumption;
  if (grid) next.grid = grid;
  return next;
}

/** Every `person.*` entity, sorted so the settings buttons keep a stable order. */
export const personEntities = (states: HassEntities): string[] =>
  Object.keys(states)
    .filter((id) => id.startsWith('person.'))
    .sort();

/** Every `weather.*` entity, for the picker in settings. */
export const weatherEntities = (states: HassEntities): string[] =>
  Object.keys(states)
    .filter((id) => id.startsWith('weather.'))
    .sort();

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
  const weatherEntity = config.weatherEntity ?? firstEntityOfDomain(states, 'weather');
  // Until the user says who they are in settings, assume the first person — the
  // pill then shows the second, which is the useful half of the pair.
  const me = config.me ?? personEntities(states)[0];

  const next: DashboardConfig = {
    ...config,
    areaTint,
    favouriteAreas,
    power: derivePower(config.power, states),
  };
  if (alarmEntity) next.alarmEntity = alarmEntity;
  if (weatherEntity) next.weatherEntity = weatherEntity;
  if (me) next.me = me;
  return next;
}
