import type { SilentSince } from './history';
import { friendlyName, toNumber } from './selectors';
import type { HassEntities, HassEntity, Registries } from './types';

/**
 * The Netwerk tab: everything that has stopped talking. Not a Lovelace page —
 * a flat list of the devices `sensor.disconnected_devices` currently flags,
 * one row per device.
 *
 * The list itself is computed in Home Assistant, not here. An earlier version
 * of this module did its own scan — "no entity on this device has updated in
 * 24 h" — and that flagged far too much: a closed door or a steady
 * temperature reading are silent for entirely innocent reasons.
 * `sensor.disconnected_devices` already knows which entities are dedicated
 * connectivity trackers (its `entities` attribute lists them), so this
 * module only turns that list into rows: grouping by device, finding each
 * device's battery, and working out how long it's actually been gone.
 */

/** Default source entity — override via `DashboardConfig.staleDevicesEntity`. */
export const DISCONNECTED_SENSOR = 'sensor.disconnected_devices';

/** Past this the badge turns amber. */
export const ALARM_AFTER_MS = 48 * 3600e3;

/**
 * Under this the battery line turns amber, however long the device has been
 * silent: a flat battery is usually *why* a device goes quiet, so it is
 * flagged before the silence reaches 48 h.
 */
export const LOW_BATTERY_PCT = 15;

export interface StaleDevice {
  /** The device id, or the entity id when the entity has no device. */
  key: string;
  name: string;
  area: string;
  /** The HA area id, when the device (or entity) has one — for its tint. */
  areaId?: string;
  /** The flagged entity this row's silence is measured from. */
  entityId: string;
  silentMs: number;
  /** History ran out before the silence did: it is at least `silentMs`. */
  silenceAtLeast?: boolean;
  /**
   * What the dashboard knows about how the device is powered. `mains` only
   * means no battery entity was found on the device — HA has no positive
   * "on mains" signal to read.
   */
  power: DevicePower;
}

/**
 * - `mains`: the device has no battery entity at all.
 * - `battery`: it has one. `percent` is the live reading when there is one;
 *   `entityId` is the percentage sensor, so the view can fall back to its
 *   last known value in history when the live state is `unavailable` — which
 *   is exactly what a device that dropped off the network reports. `low`
 *   comes from a `binary_sensor` battery-low entity, for devices that expose
 *   no percentage.
 */
export type DevicePower =
  | { kind: 'mains' }
  | { kind: 'battery'; percent?: number; entityId?: string; low?: boolean };

/**
 * Judged per registry entry, not only per state: a disabled battery entity has
 * no state, but its presence still says the device runs on a battery. Without
 * a state the entity id's suffix is all there is to go on.
 */
function batteryDomain(entityId: string, states: HassEntities): 'sensor' | 'binary' | undefined {
  const byClass = states[entityId]?.attributes?.device_class === 'battery';
  if (entityId.startsWith('sensor.') && (byClass || entityId.endsWith('_battery'))) {
    return 'sensor';
  }
  if (
    entityId.startsWith('binary_sensor.') &&
    (byClass || entityId.endsWith('_battery') || entityId.endsWith('_battery_low'))
  ) {
    return 'binary';
  }
  return undefined;
}

/**
 * The device's battery, from every battery entity on it rather than the first
 * one the registry happens to list. That first one used to be taken as-is,
 * so a `binary_sensor.*_battery_low` (state `off`), a disabled sensor, or a
 * sensor gone `unavailable` along with its device all read as "no battery" —
 * and the row said `netstroom`.
 */
function powerOf(
  deviceId: string,
  registries: Registries,
  states: HassEntities,
): DevicePower {
  const sensors: string[] = [];
  const binaries: string[] = [];
  for (const entry of registries.entities) {
    if (entry.device_id !== deviceId) continue;
    const domain = batteryDomain(entry.entity_id, states);
    if (domain === 'sensor') sensors.push(entry.entity_id);
    else if (domain === 'binary') binaries.push(entry.entity_id);
  }
  if (sensors.length === 0 && binaries.length === 0) return { kind: 'mains' };

  const power: DevicePower = { kind: 'battery' };
  // A sensor with a live reading wins; otherwise any sensor that has a state
  // at all (a disabled one has none), so history has something to look up.
  const live = sensors.find((id) => toNumber(states[id]?.state) !== undefined);
  const entityId = live ?? sensors.find((id) => states[id]) ?? sensors[0];
  if (entityId) {
    power.entityId = entityId;
    const percent = toNumber(states[entityId]?.state);
    if (percent !== undefined) power.percent = percent;
  }
  const binary = binaries.find((id) => {
    const state = states[id]?.state;
    return state === 'on' || state === 'off';
  });
  if (binary) power.low = states[binary]!.state === 'on';
  return power;
}

/**
 * `6 d` / `31 u` / `12 min` — the v7 badge. Days from 48 h on. `atLeast`
 * adds a `+` (`10+ d`) for a silence older than the history that measured it.
 */
export function formatSilence(ms: number, atLeast = false): string {
  const plus = atLeast ? '+' : '';
  const minutes = Math.floor(ms / 60e3);
  if (minutes < 60) return `${minutes}${plus} min`;
  const hours = Math.floor(ms / 3600e3);
  if (hours < 48) return `${hours}${plus} u`;
  return `${Math.floor(hours / 24)}${plus} d`;
}

/**
 * `3d ago` / `2w ago` — some connectivity trackers format their own state
 * this way rather than going `unavailable`, and that text survives a Home
 * Assistant restart. `last_changed` does not: everything reads as "just
 * changed" for a day after every reboot, which is exactly what makes a
 * `state == 'unavailable' and last_changed < 24h ago` check forget devices
 * that were already gone before the restart.
 */
const AGO_PATTERN = /^(\d+)\s*([dw])\s*ago$/i;

/**
 * A "last seen" sensor (`device_class: timestamp`) carries the answer in its
 * own state — while it has one. Zigbee2MQTT's `*_last_seen` goes
 * `unavailable` with the rest of the device once Z2M's availability check
 * gives up on it, and a restart brings it back that way with a fresh
 * `last_changed`; history then still holds the last timestamp it showed.
 */
export function isLastSeenTracker(entity: HassEntity): boolean {
  return entity.attributes?.device_class === 'timestamp';
}

function lastSeenOf(entity: HassEntity): number | undefined {
  if (!isLastSeenTracker(entity)) return undefined;
  const seen = Date.parse(entity.state);
  return Number.isFinite(seen) ? seen : undefined;
}

/**
 * Whether this tracker's silence has to come from history. The two state
 * formats above already say how long it has been; everything else only has
 * `last_changed`, which a restart resets.
 */
export function needsSilenceHistory(entity: HassEntity): boolean {
  return !AGO_PATTERN.test(entity.state.trim()) && lastSeenOf(entity) === undefined;
}

function silenceOf(
  entity: HassEntity,
  now: number,
  known: SilentSince | undefined,
): { ms: number; atLeast: boolean } {
  const ago = AGO_PATTERN.exec(entity.state.trim());
  if (ago) {
    const amount = Number(ago[1]);
    const unitMs = ago[2]!.toLowerCase() === 'w' ? 7 * 24 * 3600e3 : 24 * 3600e3;
    return { ms: amount * unitMs, atLeast: false };
  }
  const seen = lastSeenOf(entity);
  if (seen !== undefined) return { ms: Math.max(0, now - seen), atLeast: false };

  const changed = Date.parse(entity.last_changed);
  const live = Number.isFinite(changed) ? Math.max(0, now - changed) : 0;
  // History can only push the silence further back than `last_changed`, never
  // closer: whichever is longer is the truth.
  if (known && now - known.since > live) {
    return { ms: now - known.since, atLeast: known.atLeast };
  }
  return { ms: live, atLeast: false };
}

interface Group extends Omit<StaleDevice, 'power'> {}

/**
 * Turns `sensor.disconnected_devices`'s `entities` attribute into rows,
 * grouped by device — two silent trackers on the same device produce one
 * row, not two. Within a group the longest silence wins, since every listed
 * entity has already been judged disconnected by the sensor itself.
 */
export function collectStale(
  registries: Registries,
  states: HassEntities,
  now = Date.now(),
  sensorEntityId: string = DISCONNECTED_SENSOR,
  /** From `fetchSilentSince`, per flagged entity id — see `useSilentSince`. */
  silentSince: ReadonlyMap<string, SilentSince> = new Map(),
): StaleDevice[] {
  const flagged: unknown = states[sensorEntityId]?.attributes?.entities;
  if (!Array.isArray(flagged) || flagged.length === 0) return [];

  const areaName = new Map(registries.areas.map((area) => [area.area_id, area.name]));
  const devices = new Map(registries.devices.map((device) => [device.id, device]));
  const entityEntry = new Map(registries.entities.map((entry) => [entry.entity_id, entry]));

  const groups = new Map<string, Group>();

  for (const entityId of flagged) {
    if (typeof entityId !== 'string') continue;
    const state = states[entityId];
    if (!state) continue;

    const entry = entityEntry.get(entityId);
    if (entry?.disabled_by || entry?.hidden_by) continue;

    const device = entry?.device_id ? devices.get(entry.device_id) : undefined;
    // A device the user disabled is meant to be quiet.
    if (device?.disabled_by) continue;

    const key = device?.id ?? entityId;
    const areaId = entry?.area_id ?? device?.area_id ?? null;
    const silence = silenceOf(state, now, silentSince.get(entityId));
    const silentMs = silence.ms;

    const existing = groups.get(key);
    if (existing && existing.silentMs >= silentMs) continue;

    const group: Group = {
      key,
      name: device?.name_by_user ?? device?.name ?? friendlyName(states, entityId),
      area: (areaId ? areaName.get(areaId) : undefined) ?? 'Geen ruimte',
      entityId,
      silentMs,
    };
    if (silence.atLeast) group.silenceAtLeast = true;
    if (areaId && areaName.has(areaId)) group.areaId = areaId;
    groups.set(key, group);
  }

  const stale: StaleDevice[] = [];
  for (const group of groups.values()) {
    const device = devices.get(group.key);
    // A device-less entity has nothing to look a battery up on.
    const power = device ? powerOf(device.id, registries, states) : { kind: 'mains' as const };
    stale.push({ ...group, power });
  }

  // Longest silence first — the most likely to actually be dead.
  return stale.sort((a, b) => b.silentMs - a.silentMs);
}
