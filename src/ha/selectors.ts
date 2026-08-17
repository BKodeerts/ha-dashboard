import type { DashboardConfig } from '../config/config';
import { bucketEntities } from './registry';
import type {
  AlarmState,
  HassEntities,
  HassEntity,
  Opening,
  Registries,
  Room,
} from './types';

export const UNAVAILABLE = new Set(['unavailable', 'unknown', '']);

export function numericState(entity: HassEntity | undefined): number | undefined {
  if (!entity || UNAVAILABLE.has(entity.state)) return undefined;
  const value = Number(entity.state);
  return Number.isFinite(value) ? value : undefined;
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
 * The room list the home screen renders: area registry order (config.roomOrder
 * first), each area resolved to its device buckets and current readings.
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

    const room: Room = {
      id: area.area_id,
      name: area.name,
      tint: config.areaTint[area.area_id] ?? 'oklch(0.80 0.06 250)',
      favourite: favourites.has(area.area_id),
      entities,
      lightsOn: entities.lights.some((id) => isOn(states[id])),
      climateOn: entities.climate.some((id) => {
        const state = states[id]?.state;
        return state !== undefined && state !== 'off' && !UNAVAILABLE.has(state);
      }),
      mediaPlaying: entities.mediaPlayers.some((id) => states[id]?.state === 'playing'),
      openingOpen: entities.openings.some((id) => isOn(states[id])),
      motionDetected: entities.motion.some((id) => isOn(states[id])),
      smokeDetected: entities.smoke.some((id) => isOn(states[id])),
    };
    if (temperature !== undefined) room.temperature = temperature;
    if (humidity !== undefined) room.humidity = humidity;
    return room;
  });

  // Areas with nothing to show would render an empty card; drop them.
  const visible = rooms.filter(
    (room) =>
      room.temperature !== undefined ||
      room.entities.lights.length > 0 ||
      room.entities.climate.length > 0 ||
      room.entities.mediaPlayers.length > 0,
  );

  return visible.sort((a, b) => {
    const ai = orderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bi = orderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return ai === bi ? 0 : ai - bi;
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

export function presenceInfo(states: HassEntities, config: DashboardConfig): PresenceInfo {
  const entityId = config.personEntity;
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
  const value = typeof bearing === 'number' ? bearing : Number(bearing);
  if (!Number.isFinite(value)) return typeof bearing === 'string' ? bearing : undefined;
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
  const temperature = Number(attributes.temperature);
  if (Number.isFinite(temperature)) info.temperature = temperature;
  const pressure = Number(attributes.pressure);
  if (Number.isFinite(pressure)) info.pressure = pressure;
  const windSpeed = Number(attributes.wind_speed);
  if (Number.isFinite(windSpeed)) info.windSpeed = windSpeed;
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

export const formatNumber = (value: number, digits = 0, grouping = true): string =>
  value.toLocaleString(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: grouping,
  });

/** Readings that are identifiers rather than quantities: no thousands separator. */
export const formatPlain = (value: number, digits = 0): string =>
  formatNumber(value, digits, false);

/** Card reading: rounded, no decimal. Sheet reading: one decimal. */
export const formatTemp = (value: number | undefined, digits = 0): string =>
  value === undefined ? '—' : `${formatNumber(value, digits)}°`;

export const formatHumidity = (value: number | undefined, digits = 1): string =>
  value === undefined ? '' : `${formatNumber(value, digits)}%`;
