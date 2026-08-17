import { personEntities, type DashboardConfig } from '../config/config';
import { bucketEntities } from './registry';
import type {
  AlarmState,
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

function buildClimate(entityId: string, states: HassEntities): RoomClimate {
  const entity = states[entityId];
  const attributes = entity?.attributes ?? {};
  const climate: RoomClimate = {
    entityId,
    mode: hvacMode(entity?.state),
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
    const lit = lights.filter((light) => light.on && light.dimmable);
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
      hasOpenings: entities.openings.length > 0,
      openingOpen: entities.openings.some((id) => isOn(states[id])),
    };
    if (temperature !== undefined) room.temperature = temperature;
    if (humidity !== undefined) room.humidity = humidity;
    if (lit.length > 0) {
      room.brightness = Math.round(
        lit.reduce((sum, light) => sum + light.brightness, 0) / lit.length,
      );
    }
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

export interface AlarmInfo {
  entityId?: string;
  state: AlarmState;
  /** Attention state — the pill lights up amber. */
  attention: boolean;
  label: string;
  codeFormat?: string;
  codeArmRequired: boolean;
}

const ALARM_LABELS: Record<string, string> = {
  disarmed: 'Alarm uit',
  armed_home: 'Alarm thuis',
  armed_away: 'Alarm afwezig',
  armed_night: 'Alarm nacht',
  armed_vacation: 'Alarm vakantie',
  arming: 'Wapenen…',
  pending: 'Pending…',
  triggered: 'Alarm!',
  unavailable: 'Alarm ?',
};

export function alarmInfo(states: HassEntities, config: DashboardConfig): AlarmInfo {
  const entityId = config.alarmEntity;
  const state = (entityId ? states[entityId]?.state : undefined) ?? 'unavailable';
  const attributes = entityId ? states[entityId]?.attributes : undefined;
  const codeFormat = attributes?.code_format;

  const info: AlarmInfo = {
    state: state as AlarmState,
    attention: state === 'disarmed' || state === 'arming' || state === 'pending' || state === 'triggered',
    label: ALARM_LABELS[state] ?? 'Alarm ?',
    codeArmRequired: attributes?.code_arm_required !== false,
  };
  if (entityId) info.entityId = entityId;
  if (typeof codeFormat === 'string') info.codeFormat = codeFormat;
  return info;
}

export interface PresenceInfo {
  entityId?: string;
  name: string;
  home: boolean;
  label: string;
}

/**
 * The pill shows whoever the user did *not* pick as themselves in settings —
 * telling you that you are home is not news. With only one person configured it
 * falls back to that one.
 */
export function presenceInfo(states: HassEntities, config: DashboardConfig): PresenceInfo {
  const persons = personEntities(states);
  const entityId = persons.find((id) => id !== config.me) ?? persons[0];
  const state = entityId ? states[entityId] : undefined;
  const name = entityId ? friendlyName(states, entityId) : 'Niemand';
  const home = state?.state === 'home';
  const info: PresenceInfo = { name, home, label: `${name} ${home ? 'thuis' : 'weg'}` };
  if (entityId) info.entityId = entityId;
  return info;
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
