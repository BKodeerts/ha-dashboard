import type { AreaRegistryEntry, HassEntities } from '../ha/types';

/**
 * Everything that is a per-user preference rather than Home Assistant state.
 *
 * Stored in Home Assistant itself, against the logged-in account — see
 * `ha/configStore.ts`. It is deliberately not YAML: changing a favourite or a
 * tint should never mean editing a config file and restarting HA. It is no
 * longer browser-local either, so the same account gets the same dashboard on
 * every device, and two accounts sharing a tablet get their own.
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
   * The `person.*` entity whose chip sits at the top right — **at most one**:
   * the v5 header (`TopLine`) only ever renders `people[0]`, so a second entry
   * here would be stored but never shown.
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
  /**
   * Media player per area id, overriding the auto-pick (the first
   * `media_player.*` the area's registry happens to list — a TV can easily
   * beat a Sonos this way). Admin-only, household-wide: see "Media per kamer"
   * in settings. `undefined` for a room clears the override.
   */
  mediaEntity: Record<string, string | undefined>;
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
  mediaEntity: {},
  theme: 'auto',
  palette: 'ha',
  power: { loads: [], scale: 2000 },
  car: {},
  mediaPresets: {},
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One layer of the config, holding only what was explicitly set on it.
 *
 * The dashboard stacks four: defaults ← `panel_custom` YAML ← household ←
 * account. A layer must never materialise the defaults, or setting a favourite
 * on your account would silently shadow the household's power scale with the
 * default nobody chose. `power` is the only member that is not already
 * all-optional, so it is the only one restated here.
 */
export type ConfigLayer = Omit<Partial<DashboardConfig>, 'power'> & {
  power?: Partial<DashboardConfig['power']>;
};

/** Shallow-merges one layer over a complete config. */
export function mergeConfig(
  base: DashboardConfig,
  patch: ConfigLayer | undefined,
): DashboardConfig {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    areaTint: { ...base.areaTint, ...(patch.areaTint ?? {}) },
    mediaEntity: { ...base.mediaEntity, ...(patch.mediaEntity ?? {}) },
    power: { ...base.power, ...(patch.power ?? {}) },
    car: { ...base.car, ...(patch.car ?? {}) },
    mediaPresets: { ...base.mediaPresets, ...(patch.mediaPresets ?? {}) },
  };
}

/**
 * Merges two layers into one, keeping it a layer — the nested objects merge, but
 * nothing absent on both sides is invented. This is what a settings tap does to
 * your account's layer, and what "publish as household default" does to fold an
 * account's layer into the household's.
 */
export function mergeLayers(base: ConfigLayer, patch: ConfigLayer): ConfigLayer {
  const next: ConfigLayer = { ...base, ...patch };
  if (base.areaTint ?? patch.areaTint) next.areaTint = { ...base.areaTint, ...patch.areaTint };
  if (base.mediaEntity ?? patch.mediaEntity) {
    next.mediaEntity = { ...base.mediaEntity, ...patch.mediaEntity };
  }
  if (base.power ?? patch.power) next.power = { ...base.power, ...patch.power };
  if (base.car ?? patch.car) next.car = { ...base.car, ...patch.car };
  if (base.mediaPresets ?? patch.mediaPresets) {
    next.mediaPresets = { ...base.mediaPresets, ...patch.mediaPresets };
  }
  return next;
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
 * How many person chips the header holds. One — `TopLine` only ever renders
 * `people[0]` — so this is what both the settings picker and the default
 * auto-pick cap themselves to.
 */
export const MAX_TRACKED = 1;

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
