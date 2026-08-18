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
   * The `person.*` entities whose chips sit at the top right, **at most two**.
   * The cap is a layout constraint, not a taste: a third chip takes the space
   * the weather's hi/lo range needs, and that range is what the v3 header was
   * reshaped to buy.
   *
   * Who *you* are is not stored — v4 reads it off the logged-in Home Assistant
   * account (see `currentPerson` in `ha/selectors.ts`). A household of five
   * people has five accounts; asking each of them to pick themselves out of a
   * list is a setting that can be wrong.
   */
  tracked: string[];
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

/**
 * v2 renumbered the stored shape: accent and personEntity are gone. v4 drops
 * `me` and adds `tracked`, which is a migration rather than a new shape — see
 * `loadStoredConfig`, which strips `me` on the way in so an existing install
 * keeps its favourites, order and tints.
 */
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
  tracked: [],
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
    if (!isRecord(parsed)) return undefined;
    // v4 reads the user off the account. A stored `me` from v3 is dropped here
    // rather than migrated: it was a *guess* the user made about themselves,
    // and `hass.user` is the answer.
    const { me: _dropped, ...rest } = parsed as Partial<DashboardConfig> & { me?: string };
    return rest;
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

/**
 * How many person chips the header holds. Two, and it is not a preference: a
 * third chip costs the weather's hi/lo range the space it needs.
 */
export const MAX_TRACKED = 2;

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
  /** The `person.*` entity the logged-in account resolves to, when it does. */
  mePerson?: string,
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

  // Nobody has said who to follow yet: follow everybody else, up to the cap.
  // An empty header is a worse first run than a reasonable guess, and the guess
  // is one tap to change under "Wie volg je bovenaan".
  const tracked =
    config.tracked.length > 0
      ? config.tracked.slice(0, MAX_TRACKED)
      : personEntities(states)
          .filter((id) => id !== mePerson)
          .slice(0, MAX_TRACKED);

  const next: DashboardConfig = {
    ...config,
    areaTint,
    favouriteAreas,
    tracked,
    power: derivePower(config.power, states),
  };
  if (alarmEntity) next.alarmEntity = alarmEntity;
  if (weatherEntity) next.weatherEntity = weatherEntity;
  return next;
}
