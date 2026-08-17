import { friendlyName, toNumber } from './selectors';
import type { HassEntities, Registries } from './types';

/**
 * The Netwerk tab: everything that has stopped talking. Not a Lovelace page —
 * a flat list of devices whose entities have all been silent for over a day,
 * which is what a dead battery, a dropped Zigbee node and an unplugged bridge
 * all look like from here.
 */

export const STALE_AFTER_MS = 24 * 3600e3;
/** Past this the badge turns amber. */
export const ALARM_AFTER_MS = 48 * 3600e3;

export interface StaleDevice {
  /** The device id, or the entity id when the entity has no device. */
  key: string;
  name: string;
  area: string;
  /** The entity whose `last_updated` the row reports. */
  entityId: string;
  silentMs: number;
  battery?: number;
}

/**
 * Domains that are silent for perfectly good reasons — an automation that has
 * not fired since spring is not a broken device, and listing them would bury
 * the ones that are.
 */
const IGNORED_DOMAINS = new Set([
  'automation',
  'button',
  'counter',
  'group',
  'input_boolean',
  'input_button',
  'input_datetime',
  'input_number',
  'input_select',
  'input_text',
  'person',
  'scene',
  'schedule',
  'script',
  'tag',
  'timer',
  'todo',
  'zone',
]);

const domainOf = (entityId: string): string => entityId.slice(0, entityId.indexOf('.'));

const isBattery = (entityId: string, states: HassEntities): boolean =>
  states[entityId]?.attributes?.device_class === 'battery' ||
  (entityId.startsWith('sensor.') && entityId.endsWith('_battery'));

/** `6 dagen` / `31 uur`, matching the badge in the handoff. */
export function formatSilence(ms: number): string {
  const hours = Math.floor(ms / 3600e3);
  if (hours < 48) return `${hours} uur`;
  return `${Math.floor(hours / 24)} dagen`;
}

interface Group {
  key: string;
  name: string;
  area: string;
  entityIds: string[];
}

/**
 * Groups by device so one silent sensor does not produce five rows, then keeps
 * the groups whose *most recent* entity is still older than 24 h — a device with
 * one live entity is not silent, however quiet the rest of it is.
 */
export function collectStale(
  registries: Registries,
  states: HassEntities,
  now = Date.now(),
): StaleDevice[] {
  const areaName = new Map(registries.areas.map((area) => [area.area_id, area.name]));
  const devices = new Map(registries.devices.map((device) => [device.id, device]));
  const groups = new Map<string, Group>();

  for (const entry of registries.entities) {
    if (entry.disabled_by || entry.hidden_by || entry.entity_category) continue;
    if (IGNORED_DOMAINS.has(domainOf(entry.entity_id))) continue;
    if (!states[entry.entity_id]) continue;

    const device = entry.device_id ? devices.get(entry.device_id) : undefined;
    // A device the user disabled is meant to be quiet.
    if (device?.disabled_by) continue;

    const key = device?.id ?? entry.entity_id;
    const areaId = entry.area_id ?? device?.area_id ?? null;
    const existing = groups.get(key);
    if (existing) {
      existing.entityIds.push(entry.entity_id);
      continue;
    }
    groups.set(key, {
      key,
      name:
        device?.name_by_user ??
        device?.name ??
        friendlyName(states, entry.entity_id),
      area: (areaId ? areaName.get(areaId) : undefined) ?? '—',
      entityIds: [entry.entity_id],
    });
  }

  const stale: StaleDevice[] = [];
  for (const group of groups.values()) {
    let newest = -Infinity;
    let newestId = group.entityIds[0]!;
    let battery: number | undefined;

    for (const entityId of group.entityIds) {
      const updated = Date.parse(states[entityId]!.last_updated);
      if (Number.isFinite(updated) && updated > newest) {
        newest = updated;
        newestId = entityId;
      }
      if (battery === undefined && isBattery(entityId, states)) {
        battery = toNumber(states[entityId]!.state);
      }
    }

    const silentMs = now - newest;
    if (!Number.isFinite(silentMs) || silentMs < STALE_AFTER_MS) continue;

    // Prefer a non-battery entity as the row's identity; the battery is its own
    // column and `sensor.x_battery` says less about the device than `sensor.x`.
    const identity =
      group.entityIds.find((id) => !isBattery(id, states) && id === newestId) ??
      group.entityIds.find((id) => !isBattery(id, states)) ??
      newestId;

    const row: StaleDevice = {
      key: group.key,
      name: group.name,
      area: group.area,
      entityId: identity,
      silentMs,
    };
    if (battery !== undefined) row.battery = battery;
    stale.push(row);
  }

  // Oldest first — the longest silence is the most likely to be dead.
  return stale.sort((a, b) => b.silentMs - a.silentMs);
}
