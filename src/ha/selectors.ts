import { MAX_TRACKED, personEntities, type DashboardConfig } from '../config/config';
import { bucketEntities } from './registry';
import type { AlarmAction } from './services';
import type {
  AlarmState,
  CurrentUser,
  HassEntities,
  HassEntity,
  HvacMode,
  Opening,
  Registries,
  Room,
  RoomClimate,
  RoomLight,
  RoomMedia,
} from './types';

export const UNAVAILABLE = new Set(['unavailable', 'unknown', '']);

/** Narrows to a real, finite number — `null` and `NaN` are not readings. */
export const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Coerces a value out of an HA payload to a number, or `undefined` when there
 * is no reading. HA sends `null` for values it does not have (`templow` on a
 * forecast day, a climate target while the unit is off), and `Number(null)` is
 * `0` — so null, booleans and blank strings are rejected instead of silently
 * becoming zero.
 */
export function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || typeof value === 'boolean') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function numericState(entity: HassEntity | undefined): number | undefined {
  if (!entity || UNAVAILABLE.has(entity.state)) return undefined;
  return toNumber(entity.state);
}

export const isOn = (entity: HassEntity | undefined): boolean => entity?.state === 'on';

export function friendlyName(states: HassEntities, entityId: string): string {
  const name = states[entityId]?.attributes?.friendly_name;
  if (typeof name === 'string' && name.length > 0) return name;
  // Fall back to the object_id, de-slugged: `light.speelhoek` → `Speelhoek`.
  const objectId = entityId.slice(entityId.indexOf('.') + 1).replace(/_/g, ' ');
  return objectId.charAt(0).toUpperCase() + objectId.slice(1);
}

/** Strips a leading room name from an entity name: "Living Raam 2" → "Raam 2". */
export function shortName(full: string, roomName: string): string {
  const prefix = `${roomName.toLowerCase()} `;
  return full.toLowerCase().startsWith(prefix) ? full.slice(prefix.length) : full;
}

/**
 * Colour modes that carry a brightness. Anything reporting only `onoff` (or
 * nothing at all) gets a tap row instead of a drag — the design is explicit that
 * a non-dimmable lamp must never look draggable.
 */
const DIMMABLE_MODES = new Set([
  'brightness',
  'color_temp',
  'hs',
  'xy',
  'rgb',
  'rgbw',
  'rgbww',
  'white',
]);

export function isDimmable(entity: HassEntity | undefined): boolean {
  const modes = entity?.attributes?.supported_color_modes;
  if (Array.isArray(modes)) return modes.some((mode) => DIMMABLE_MODES.has(String(mode)));
  // Integrations that predate colour modes only ever show a brightness attribute.
  return toNumber(entity?.attributes?.brightness) !== undefined;
}

/** HA stores brightness as 0–255; every surface here works in percent. */
export function brightnessPercent(entity: HassEntity | undefined): number {
  if (!isOn(entity)) return 0;
  const raw = toNumber(entity?.attributes?.brightness);
  // A lamp that is on but has not reported a level yet reads as full.
  if (raw === undefined) return 100;
  return Math.max(1, Math.min(100, Math.round((raw / 255) * 100)));
}

function buildLight(entityId: string, roomName: string, states: HassEntities): RoomLight {
  const entity = states[entityId];
  return {
    entityId,
    name: shortName(friendlyName(states, entityId), roomName),
    on: isOn(entity),
    dimmable: isDimmable(entity),
    brightness: brightnessPercent(entity),
  };
}

const HVAC_MODES = new Set(['off', 'cool', 'heat', 'dry', 'fan_only']);

/** Narrows an `hvac_mode` to the five the design gives a treatment. */
export function hvacMode(state: string | undefined): HvacMode {
  if (state === undefined || UNAVAILABLE.has(state)) return 'off';
  return HVAC_MODES.has(state) ? (state as HvacMode) : 'other';
}

/**
 * The modes the sheet's dropdown offers. `hvac_modes` is what the unit says it
 * can do; the mode it is *in* is prepended when missing, so the dropdown can
 * always show the truth — an integration that omits its own current mode would
 * otherwise leave the control showing something the unit is not doing.
 */
function hvacModes(attributes: Record<string, unknown>, current: string): string[] {
  const reported = Array.isArray(attributes.hvac_modes)
    ? attributes.hvac_modes.filter((mode): mode is string => typeof mode === 'string')
    : [];
  return reported.includes(current) ? reported : [current, ...reported];
}

function buildClimate(entityId: string, states: HassEntities): RoomClimate {
  const entity = states[entityId];
  const attributes = entity?.attributes ?? {};
  // A missing or unavailable unit reads as off, exactly as `hvacMode` paints it.
  const raw = entity?.state;
  const modeId = raw === undefined || UNAVAILABLE.has(raw) ? 'off' : raw;
  const climate: RoomClimate = {
    entityId,
    mode: hvacMode(entity?.state),
    modeId,
    modes: hvacModes(attributes, modeId),
    min: toNumber(attributes.min_temp) ?? 16,
    max: toNumber(attributes.max_temp) ?? 30,
    step: toNumber(attributes.target_temp_step) ?? 0.5,
  };
  const target = toNumber(attributes.temperature);
  if (target !== undefined) climate.target = target;
  return climate;
}

function buildMedia(entityId: string, states: HassEntities): RoomMedia {
  const title = states[entityId]?.attributes?.media_title;
  return {
    entityId,
    playing: states[entityId]?.state === 'playing',
    station:
      typeof title === 'string' && title.length > 0 ? title : friendlyName(states, entityId),
  };
}

/**
 * The room list the home screen renders: favourites first, then the user's own
 * order within each group, each area resolved to its device buckets and readings.
 */
export function buildRooms(
  registries: Registries,
  areaEntities: Map<string, string[]>,
  states: HassEntities,
  config: DashboardConfig,
): Room[] {
  const orderIndex = new Map(config.roomOrder.map((id, index) => [id, index]));
  const favourites = new Set(config.favouriteAreas);

  const rooms = registries.areas.map((area): Room => {
    const entities = bucketEntities(areaEntities.get(area.area_id) ?? [], area.name, states);
    const temperature = entities.temperature
      ? numericState(states[entities.temperature])
      : undefined;
    const humidity = entities.humidity ? numericState(states[entities.humidity]) : undefined;

    const lights = entities.lights.map((id) => buildLight(id, area.name, states));
    const climateId = entities.climate[0];
    const mediaId = entities.mediaPlayers[0];

    const room: Room = {
      id: area.area_id,
      name: area.name,
      tint: config.areaTint[area.area_id] ?? 'oklch(0.74 0.07 70)',
      favourite: favourites.has(area.area_id),
      entities,
      lights,
      lightsOn: lights.some((light) => light.on),
      openingOpen: entities.openings.some((id) => isOn(states[id])),
    };
    if (temperature !== undefined) room.temperature = temperature;
    if (humidity !== undefined) room.humidity = humidity;
    if (climateId) room.climate = buildClimate(climateId, states);
    if (mediaId) room.media = buildMedia(mediaId, states);
    return room;
  });

  // Areas with nothing to show would render an empty tile; drop them.
  const visible = rooms.filter(
    (room) =>
      room.temperature !== undefined ||
      room.lights.length > 0 ||
      room.climate !== undefined ||
      room.media !== undefined,
  );

  const rank = (room: Room): number => orderIndex.get(room.id) ?? Number.MAX_SAFE_INTEGER;
  return visible.sort((a, b) => {
    if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
    return rank(a) - rank(b);
  });
}

const OPENING_CLASSES = new Set(['window', 'door', 'garage_door']);

export interface OpeningsSummary {
  open: Opening[];
  total: number;
}

/**
 * Every window/door/garage-door sensor in the house, with the open ones sorted
 * newest-first. `total` feeds the sheet's "3 van 13 open" line.
 */
export function collectOpenings(
  registries: Registries,
  areaEntities: Map<string, string[]>,
  states: HassEntities,
): OpeningsSummary {
  const areaName = new Map(registries.areas.map((a) => [a.area_id, a.name]));
  const open: Opening[] = [];
  let total = 0;

  for (const [areaId, entityIds] of areaEntities) {
    for (const entityId of entityIds) {
      if (!entityId.startsWith('binary_sensor.')) continue;
      const state = states[entityId];
      const deviceClass = state?.attributes?.device_class;
      if (typeof deviceClass !== 'string' || !OPENING_CLASSES.has(deviceClass)) continue;
      total += 1;
      if (state?.state !== 'on') continue;

      const room = areaName.get(areaId) ?? '';
      const lastChanged = new Date(state.last_changed).getTime();
      open.push({
        entityId,
        name: shortName(friendlyName(states, entityId), room),
        room,
        deviceClass: deviceClass as Opening['deviceClass'],
        since: formatTime(new Date(state.last_changed)),
        lastChanged: Number.isFinite(lastChanged) ? lastChanged : 0,
      });
    }
  }

  open.sort((a, b) => b.lastChanged - a.lastChanged);
  return { open, total };
}

/* ── alarm ────────────────────────────────────────────────────────────────
   v4 moved the alarm out of the pill row and onto an icon-only chip beside the
   person chips, with its own state picker. Nothing here cycles: the chip opens
   the picker, and only a pick sends a command.                             */

/**
 * `AlarmEntityFeature`, as Home Assistant publishes it on the panel's
 * `supported_features` bitmask. Which options the picker offers comes from the
 * device, not from the design — a panel without `ARM_NIGHT` shows one chip
 * fewer rather than a command it would reject.
 */
export const ALARM_FEATURE = {
  ARM_HOME: 1,
  ARM_AWAY: 2,
  ARM_NIGHT: 4,
  TRIGGER: 8,
  ARM_CUSTOM_BYPASS: 16,
  ARM_VACATION: 32,
} as const;

/**
 * The treatments the chip has. Everything HA can report collapses onto one of
 * them: the glyph, the dot and the ground are all the chip has to say the state
 * with.
 *
 * Four of them are *states of rest* the user chose. `triggered` is not — it is
 * the alarm going off, and it is the only one that is neither a destination nor
 * a transition on the way to one.
 */
export type AlarmTone = 'disarmed' | 'arming' | 'away' | 'night' | 'triggered';

/** The tones a picker option can wear — the ones a user can actually ask for. */
export type AlarmModeTone = 'disarmed' | 'away' | 'night';

export interface AlarmMode {
  /** The service to call, minus its `alarm_` prefix. */
  action: AlarmAction;
  /** Picker label — 10px mono, so it is clipped short. */
  label: string;
  /** The tone whose full-chroma colour the option wears while it is active. */
  tone: AlarmModeTone;
  /** The states that make this option the current one. */
  states: string[];
}

/** Every arm mode, in picker order. Filtered by the panel's own bitmask below. */
const ALARM_MODES: (AlarmMode & { feature: number })[] = [
  { action: 'arm_away', label: 'Weg', tone: 'away', states: ['armed_away'], feature: ALARM_FEATURE.ARM_AWAY },
  { action: 'arm_night', label: 'Nacht', tone: 'night', states: ['armed_night'], feature: ALARM_FEATURE.ARM_NIGHT },
  { action: 'arm_home', label: 'Thuis', tone: 'night', states: ['armed_home'], feature: ALARM_FEATURE.ARM_HOME },
  {
    action: 'arm_vacation',
    label: 'Vakantie',
    tone: 'away',
    states: ['armed_vacation'],
    feature: ALARM_FEATURE.ARM_VACATION,
  },
  {
    action: 'arm_custom_bypass',
    label: 'Bypass',
    tone: 'away',
    states: ['armed_custom_bypass'],
    feature: ALARM_FEATURE.ARM_CUSTOM_BYPASS,
  },
];

/** `Uit` is always available — a panel that cannot be disarmed is not a panel. */
const DISARM: AlarmMode = {
  action: 'disarm',
  label: 'Uit',
  tone: 'disarmed',
  states: ['disarmed'],
};

const ALARM_TONES: Record<string, AlarmTone> = {
  disarmed: 'disarmed',
  unavailable: 'disarmed',
  unknown: 'disarmed',
  arming: 'arming',
  // The *entry* delay: the panel has been tripped and is counting down to
  // trigger while it waits for a code. It is on its way to `triggered`, not to
  // an armed state, so it reads red from the start rather than amber — by the
  // time it turns red on its own, the countdown it was warning about is over.
  pending: 'triggered',
  armed_away: 'away',
  armed_vacation: 'away',
  armed_custom_bypass: 'away',
  // Its own treatment, and the loudest thing on the screen: the alarm is going
  // off. The handoff gives the pulsing dot to `arming` alone and says no other
  // state animates, but that rule was written about states of rest — a tripped
  // alarm reading as a still chip is the one place the restraint is wrong.
  triggered: 'triggered',
  armed_home: 'night',
  armed_night: 'night',
};

export interface AlarmInfo {
  entityId?: string;
  state: AlarmState;
  /** Which of the four chip treatments to paint. */
  tone: AlarmTone;
  /** `arming` only — the dot pulses through the panel's *exit* delay. */
  pulsing: boolean;
  label: string;
  /** The options the picker offers, in order, `Uit` last. */
  modes: AlarmMode[];
  codeFormat?: string;
  codeArmRequired: boolean;
}

const ALARM_LABELS: Record<string, string> = {
  disarmed: 'Alarm uit',
  armed_home: 'Alarm thuis',
  armed_away: 'Alarm weg',
  armed_night: 'Alarm nacht',
  armed_vacation: 'Alarm vakantie',
  armed_custom_bypass: 'Alarm bypass',
  arming: 'Alarm wapenen',
  pending: 'Alarm telt af',
  triggered: 'Alarm!',
  unavailable: 'Alarm ?',
};

export function alarmInfo(states: HassEntities, config: DashboardConfig): AlarmInfo {
  const entityId = config.alarmEntity;
  const state = (entityId ? states[entityId]?.state : undefined) ?? 'unavailable';
  const attributes = entityId ? states[entityId]?.attributes : undefined;
  const codeFormat = attributes?.code_format;
  const features = toNumber(attributes?.supported_features) ?? 0;

  // A panel that publishes nothing is not a panel that supports nothing: fall
  // back to the two modes every alarm has rather than offering only `Uit`.
  const advertised = ALARM_MODES.filter(({ feature }) =>
    features === 0 ? feature === ALARM_FEATURE.ARM_AWAY : (features & feature) !== 0,
  );

  const info: AlarmInfo = {
    state: state as AlarmState,
    tone: ALARM_TONES[state] ?? 'disarmed',
    pulsing: state === 'arming',
    label: ALARM_LABELS[state] ?? 'Alarm ?',
    modes: [...advertised.map(({ feature: _feature, ...mode }) => mode), DISARM],
    codeArmRequired: attributes?.code_arm_required !== false,
  };
  if (entityId) info.entityId = entityId;
  if (typeof codeFormat === 'string') info.codeFormat = codeFormat;
  return info;
}

/* ── presence ─────────────────────────────────────────────────────────────
   v4 makes presence a *list*: the header shows the people the user chose to
   follow, and who the user is comes from the account rather than a setting. */

export interface PersonInfo {
  entityId?: string;
  name: string;
  home: boolean;
  label: string;
}

/**
 * Who is holding the phone, derived rather than asked for: the `person` entity
 * whose `user_id` attribute is the logged-in account's id.
 *
 * With no match — a household account, a user with no person — the account's
 * own name stands in and there is no entity id to print. That is still better
 * than a setting: this one cannot be *wrong*, only incomplete.
 */
export function currentPerson(states: HassEntities, user: CurrentUser | null): PersonInfo {
  const entityId = user
    ? personEntities(states).find((id) => states[id]?.attributes?.user_id === user.id)
    : undefined;
  const name = entityId ? friendlyName(states, entityId) : (user?.name ?? 'Onbekend');
  const home = entityId ? states[entityId]?.state === 'home' : false;
  const info: PersonInfo = { name, home, label: `${name} ${home ? 'thuis' : 'weg'}` };
  if (entityId) info.entityId = entityId;
  return info;
}

/**
 * The chips at the top right: the followed people, in the order they were
 * chosen, capped at two.
 *
 * The logged-in user is never one of them — telling you where you are is not
 * news, and it is the whole reason the cap can be two.
 */
export function trackedPeople(
  states: HassEntities,
  config: DashboardConfig,
  me: PersonInfo,
): PersonInfo[] {
  return config.tracked
    .filter((id) => id !== me.entityId && states[id] !== undefined)
    .slice(0, MAX_TRACKED)
    .map((entityId) => {
      const home = states[entityId]?.state === 'home';
      const name = friendlyName(states, entityId);
      return { entityId, name, home, label: `${name} ${home ? 'thuis' : 'weg'}` };
    });
}

export interface WeatherInfo {
  entityId?: string;
  condition: string;
  temperature?: number;
  high?: number;
  low?: number;
  pressure?: number;
  pressureUnit: string;
  windSpeed?: number;
  windUnit: string;
  windBearing?: string;
  name: string;
}

// International abbreviations, as the design specifies (`10 KM/H SW`).
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function bearingToCompass(bearing: unknown): string | undefined {
  const value = toNumber(bearing);
  // Integrations that report a cardinal name ("SW") pass it through unchanged.
  if (value === undefined) {
    return typeof bearing === 'string' && bearing.length > 0 ? bearing : undefined;
  }
  return COMPASS[Math.round(((value % 360) + 360) % 360 / 45) % 8];
}

export function weatherInfo(states: HassEntities, config: DashboardConfig): WeatherInfo {
  const entityId = config.weatherEntity;
  const state = entityId ? states[entityId] : undefined;
  const attributes = state?.attributes ?? {};
  const info: WeatherInfo = {
    condition: state?.state ?? 'unknown',
    pressureUnit: String(attributes.pressure_unit ?? 'hPa'),
    windUnit: String(attributes.wind_speed_unit ?? 'km/h'),
    name: entityId ? friendlyName(states, entityId) : 'Weer',
  };
  if (entityId) info.entityId = entityId;
  const temperature = toNumber(attributes.temperature);
  if (temperature !== undefined) info.temperature = temperature;
  const pressure = toNumber(attributes.pressure);
  if (pressure !== undefined) info.pressure = pressure;
  const windSpeed = toNumber(attributes.wind_speed);
  if (windSpeed !== undefined) info.windSpeed = windSpeed;
  const bearing = bearingToCompass(attributes.wind_bearing);
  if (bearing) info.windBearing = bearing;
  return info;
}

export interface PowerLoad {
  entityId: string;
  name: string;
  watts: number;
}

export interface PowerInfo {
  solar?: number;
  consumption?: number;
  /** Positive = exporting to the grid. */
  net?: number;
  loads: PowerLoad[];
}

/** Normalises a power sensor to watts, so kW sensors don't blow up the bar. */
function watts(states: HassEntities, entityId: string | undefined): number | undefined {
  if (!entityId) return undefined;
  const state = states[entityId];
  const value = numericState(state);
  if (value === undefined) return undefined;
  const unit = String(state?.attributes?.unit_of_measurement ?? 'W');
  return unit.toLowerCase().startsWith('kw') ? value * 1000 : value;
}

export function powerInfo(states: HassEntities, config: DashboardConfig): PowerInfo {
  const solar = watts(states, config.power.solar);
  const consumption = watts(states, config.power.consumption);
  const gridSensor = watts(states, config.power.grid);

  const info: PowerInfo = {
    loads: config.power.loads
      .map((entityId) => {
        const value = watts(states, entityId);
        return value === undefined
          ? null
          : { entityId, name: friendlyName(states, entityId), watts: value };
      })
      .filter((load): load is PowerLoad => load !== null)
      .sort((a, b) => b.watts - a.watts),
  };
  if (solar !== undefined) info.solar = solar;
  if (consumption !== undefined) info.consumption = consumption;
  // A grid sensor is authoritative when present (positive = import, so negate).
  if (gridSensor !== undefined) info.net = -gridSensor;
  else if (solar !== undefined && consumption !== undefined) info.net = solar - consumption;
  return info;
}

/* ── formatting ──────────────────────────────────────────────────────────── */

const LOCALE = 'nl-BE';

export const formatTime = (date: Date): string =>
  date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });

export const formatClock = formatTime;

export function formatDate(date: Date): string {
  return date
    .toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '')
    .toUpperCase();
}

/** The header's date line — spelled out, unlike the short form above. Case is
    left to the caller's CSS (`text-transform: uppercase`), same as every
    other mono label. */
export const formatFullDate = (date: Date): string =>
  date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

/** Shown wherever a reading is missing. */
export const NO_READING = '—';

/**
 * Formats a reading. Missing values render as a dash rather than throwing: HA
 * hands the panel `null` for readings it does not have, and a `TypeError` here
 * takes the whole dashboard down with it.
 */
export const formatNumber = (
  value: number | null | undefined,
  digits = 0,
  grouping = true,
): string =>
  isNumber(value)
    ? value.toLocaleString(LOCALE, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
        useGrouping: grouping,
      })
    : NO_READING;

/** Readings that are identifiers rather than quantities: no thousands separator. */
export const formatPlain = (value: number | null | undefined, digits = 0): string =>
  formatNumber(value, digits, false);

/** Card reading: rounded, no decimal. Sheet reading: one decimal. */
export const formatTemp = (value: number | null | undefined, digits = 0): string =>
  isNumber(value) ? `${formatNumber(value, digits)}°` : NO_READING;

export const formatHumidity = (value: number | null | undefined, digits = 1): string =>
  isNumber(value) ? `${formatNumber(value, digits)}%` : '';
