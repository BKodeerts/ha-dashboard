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

export const DISCONNECTED_SENSOR = 'sensor.disconnected_devices';

/** Past this the badge turns amber. */
export const ALARM_AFTER_MS = 48 * 3600e3;

export interface StaleDevice {
  /** The device id, or the entity id when the entity has no device. */
  key: string;
  name: string;
  area: string;
  /** The flagged entity this row's silence is measured from. */
  entityId: string;
  silentMs: number;
  battery?: number;
}

const isBattery = (entityId: string, states: HassEntities): boolean =>
  states[entityId]?.attributes?.device_class === 'battery' ||
  (entityId.startsWith('sensor.') && entityId.endsWith('_battery'));

/** `6 dagen` / `31 uur`, matching the badge in the handoff. */
export function formatSilence(ms: number): string {
  const hours = Math.floor(ms / 3600e3);
  if (hours < 48) return `${hours} uur`;
  return `${Math.floor(hours / 24)} dagen`;
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

function silenceOf(entity: HassEntity, now: number): number {
  const ago = AGO_PATTERN.exec(entity.state.trim());
  if (ago) {
    const amount = Number(ago[1]);
    const unitMs = ago[2]!.toLowerCase() === 'w' ? 7 * 24 * 3600e3 : 24 * 3600e3;
    return amount * unitMs;
  }
  const changed = Date.parse(entity.last_changed);
  return Number.isFinite(changed) ? Math.max(0, now - changed) : 0;
}

interface Group extends Omit<StaleDevice, 'battery'> {}

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
): StaleDevice[] {
  const flagged: unknown = states[DISCONNECTED_SENSOR]?.attributes?.entities;
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
    const silentMs = silenceOf(state, now);

    const existing = groups.get(key);
    if (existing && existing.silentMs >= silentMs) continue;

    groups.set(key, {
      key,
      name: device?.name_by_user ?? device?.name ?? friendlyName(states, entityId),
      area: (areaId ? areaName.get(areaId) : undefined) ?? '—',
      entityId,
      silentMs,
    });
  }

  const stale: StaleDevice[] = [];
  for (const group of groups.values()) {
    const device = devices.get(group.key);
    let battery: number | undefined;
    if (device) {
      const batteryEntry = registries.entities.find(
        (entry) => entry.device_id === device.id && isBattery(entry.entity_id, states),
      );
      if (batteryEntry) battery = toNumber(states[batteryEntry.entity_id]?.state);
    }
    const row: StaleDevice = { ...group };
    if (battery !== undefined) row.battery = battery;
    stale.push(row);
  }

  // Longest silence first — the most likely to actually be dead.
  return stale.sort((a, b) => b.silentMs - a.silentMs);
}
