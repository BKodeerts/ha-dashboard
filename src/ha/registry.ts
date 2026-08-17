import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HaBackend,
  HassEntities,
  Registries,
  RoomEntities,
} from './types';

/**
 * Rooms come from the area registry, not from a hand-written list — assigning a
 * device to an area in HA is the only step needed for it to show up here.
 */
export async function fetchRegistries(backend: HaBackend): Promise<Registries> {
  const [areas, devices, entities] = await Promise.all([
    backend.sendMessagePromise<AreaRegistryEntry[]>({ type: 'config/area_registry/list' }),
    backend.sendMessagePromise<DeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
    backend.sendMessagePromise<EntityRegistryEntry[]>({ type: 'config/entity_registry/list' }),
  ]);
  return { areas, devices, entities };
}

/**
 * An entity belongs to an area either directly (`entity.area_id`) or through its
 * device (`device.area_id`). Resolve that once into `areaId → entityId[]`.
 */
export function resolveAreaEntities(reg: Registries): Map<string, string[]> {
  const deviceArea = new Map<string, string | null>();
  for (const device of reg.devices) deviceArea.set(device.id, device.area_id);

  const byArea = new Map<string, string[]>();
  for (const area of reg.areas) byArea.set(area.area_id, []);

  for (const entity of reg.entities) {
    // Disabled entities have no state at all; hidden ones and config/diagnostic
    // entities are deliberately kept out of the UI.
    if (entity.disabled_by || entity.hidden_by || entity.entity_category) continue;

    const areaId =
      entity.area_id ?? (entity.device_id ? (deviceArea.get(entity.device_id) ?? null) : null);
    if (!areaId) continue;

    const list = byArea.get(areaId);
    if (list) list.push(entity.entity_id);
    else byArea.set(areaId, [entity.entity_id]);
  }

  return byArea;
}

const domainOf = (entityId: string): string => entityId.slice(0, entityId.indexOf('.'));

const deviceClassOf = (entityId: string, states: HassEntities): string | undefined => {
  const value = states[entityId]?.attributes?.device_class;
  return typeof value === 'string' ? value : undefined;
};

/** Normalises a name for the "temperature sensor whose name matches the area" test. */
const normalise = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Picks the sensor that most likely represents the room itself: prefer one whose
 * friendly name or entity_id contains the area name, else the first one.
 */
function pickRoomSensor(
  candidates: string[],
  areaName: string,
  states: HassEntities,
): string | undefined {
  if (candidates.length <= 1) return candidates[0];
  const needle = normalise(areaName);
  const match = candidates.find((id) => {
    const friendly = states[id]?.attributes?.friendly_name;
    const haystack = normalise(`${typeof friendly === 'string' ? friendly : ''} ${id}`);
    return needle.length > 0 && haystack.includes(needle);
  });
  return match ?? candidates[0];
}

const OPENING_CLASSES = new Set(['window', 'door', 'garage_door']);
const MOTION_CLASSES = new Set(['motion', 'occupancy']);

/** Buckets one area's entities into the slots the room card and sheet render. */
export function bucketEntities(
  entityIds: string[],
  areaName: string,
  states: HassEntities,
): RoomEntities {
  const temperatures: string[] = [];
  const humidities: string[] = [];
  const bucket: RoomEntities = {
    lights: [],
    climate: [],
    mediaPlayers: [],
    openings: [],
    motion: [],
    smoke: [],
    cameras: [],
  };

  for (const entityId of entityIds) {
    switch (domainOf(entityId)) {
      case 'sensor': {
        const deviceClass = deviceClassOf(entityId, states);
        if (deviceClass === 'temperature') temperatures.push(entityId);
        else if (deviceClass === 'humidity') humidities.push(entityId);
        break;
      }
      case 'light':
        bucket.lights.push(entityId);
        break;
      case 'climate':
        bucket.climate.push(entityId);
        break;
      case 'media_player':
        bucket.mediaPlayers.push(entityId);
        break;
      case 'camera':
        bucket.cameras.push(entityId);
        break;
      case 'binary_sensor': {
        const deviceClass = deviceClassOf(entityId, states);
        if (!deviceClass) break;
        if (OPENING_CLASSES.has(deviceClass)) bucket.openings.push(entityId);
        else if (MOTION_CLASSES.has(deviceClass)) bucket.motion.push(entityId);
        else if (deviceClass === 'smoke') bucket.smoke.push(entityId);
        break;
      }
      default:
        break;
    }
  }

  const temperature = pickRoomSensor(temperatures, areaName, states);
  const humidity = pickRoomSensor(humidities, areaName, states);
  if (temperature) bucket.temperature = temperature;
  if (humidity) bucket.humidity = humidity;

  return bucket;
}
