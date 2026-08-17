import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HaBackend,
  HassEntities,
  HassEntity,
} from './types';

/**
 * A stand-in Home Assistant, carrying the same mock state the design prototype
 * used. It implements `HaBackend` exactly like the live socket, so `npm run dev`
 * gives a working dashboard with no HA instance in reach — and every service call
 * mutates this state, so the interactions are real.
 */

interface MockRoom {
  id: string;
  name: string;
  temp?: number;
  hum?: number;
  lights: { id: string; name: string; on: boolean }[];
  climate?: { id: string; name: string; on: boolean; target: number; current: number };
  media?: { id: string; name: string; playing: boolean; volume: number; station: string };
  openings?: { id: string; name: string; deviceClass: 'window' | 'door'; open: boolean; agoMin: number }[];
  motion?: { id: string; name: string; on: boolean };
  smoke?: { id: string; name: string; on: boolean };
  camera?: { id: string; name: string };
}

const ROOMS: MockRoom[] = [
  {
    id: 'living',
    name: 'Living',
    temp: 24.2,
    hum: 61.9,
    lights: [
      { id: 'light.living', name: 'Living', on: true },
      { id: 'light.speelhoek', name: 'Speelhoek', on: false },
      { id: 'light.eettafel', name: 'Eettafel', on: false },
    ],
    media: {
      id: 'media_player.living_radio',
      name: 'Living radio',
      playing: false,
      volume: 35,
      station: 'Studio Brussel',
    },
    openings: [
      { id: 'binary_sensor.living_raam_2', name: 'Raam 2', deviceClass: 'window', open: true, agoMin: 72 },
      { id: 'binary_sensor.living_raam_1', name: 'Raam 1', deviceClass: 'window', open: false, agoMin: 400 },
      { id: 'binary_sensor.living_tuindeur', name: 'Tuindeur', deviceClass: 'door', open: false, agoMin: 300 },
    ],
    motion: { id: 'binary_sensor.living_beweging', name: 'Beweging', on: true },
  },
  {
    id: 'bureau',
    name: 'Bureau',
    temp: 23.4,
    hum: 64.0,
    lights: [{ id: 'light.bureau', name: 'Bureau ring', on: true }],
    openings: [
      { id: 'binary_sensor.bureau_raam', name: 'Raam', deviceClass: 'window', open: true, agoMin: 93 },
    ],
  },
  {
    id: 'slaapkamer',
    name: 'Slaapkamer',
    temp: 23.1,
    hum: 63.4,
    lights: [{ id: 'light.slaapkamer', name: 'Plafond', on: false }],
    climate: {
      id: 'climate.slaapkamer',
      name: 'Slaapkamer AC',
      on: false,
      target: 25,
      current: 23.1,
    },
    openings: [
      { id: 'binary_sensor.slaapkamer_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 600 },
    ],
    smoke: { id: 'binary_sensor.slaapkamer_rook', name: 'Rookmelder', on: false },
  },
  {
    id: 'clara',
    name: 'Clara',
    temp: 22.6,
    hum: 60.8,
    lights: [{ id: 'light.clara', name: 'Nachtlamp', on: false }],
    climate: { id: 'climate.clara', name: 'Clara AC', on: true, target: 25, current: 22.6 },
    openings: [
      { id: 'binary_sensor.clara_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 900 },
    ],
    camera: { id: 'camera.clara', name: 'Clara camera' },
  },
  {
    id: 'oliver',
    name: 'Oliver',
    temp: 24.0,
    hum: 60.2,
    lights: [{ id: 'light.oliver', name: 'Nachtlamp', on: true }],
    climate: { id: 'climate.oliver', name: 'Oliver AC', on: true, target: 24, current: 24.0 },
    openings: [
      { id: 'binary_sensor.oliver_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 800 },
    ],
  },
  {
    id: 'dressing',
    name: 'Dressing',
    temp: 24.0,
    hum: 61.0,
    lights: [{ id: 'light.dressing', name: 'Dressing', on: false }],
  },
  {
    id: 'waskot',
    name: 'Waskot',
    temp: 23.8,
    hum: 59.0,
    lights: [{ id: 'light.waskot', name: 'Waskot', on: false }],
    openings: [
      { id: 'binary_sensor.waskot_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 1200 },
    ],
    motion: { id: 'binary_sensor.waskot_beweging', name: 'Beweging', on: false },
  },
  {
    id: 'badkamer',
    name: 'Badkamer',
    temp: 24.4,
    hum: 66.0,
    lights: [{ id: 'light.badkamer', name: 'Badkamer', on: false }],
    openings: [
      { id: 'binary_sensor.badkamer_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 1500 },
    ],
  },
  {
    id: 'toilet',
    name: 'Toilet',
    temp: 24.6,
    hum: 61.0,
    lights: [{ id: 'light.toilet', name: 'Toilet', on: false }],
    openings: [
      { id: 'binary_sensor.toilet_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 2000 },
    ],
  },
  {
    id: 'hal',
    name: 'Hal',
    lights: [{ id: 'light.hal', name: 'Hal', on: false }],
    openings: [
      { id: 'binary_sensor.o_voordeur', name: 'Voordeur', deviceClass: 'door', open: true, agoMin: 72 },
      { id: 'binary_sensor.o_garagepoort', name: 'Garagepoort', deviceClass: 'door', open: false, agoMin: 240 },
      { id: 'binary_sensor.o_achterdeur', name: 'Achterdeur', deviceClass: 'door', open: false, agoMin: 500 },
    ],
    motion: { id: 'binary_sensor.hal_beweging', name: 'Beweging', on: false },
  },
];

const iso = (offsetMinutes: number): string =>
  new Date(Date.now() - offsetMinutes * 60_000).toISOString();

const entity = (
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
  agoMin = 30,
): HassEntity => ({
  entity_id,
  state,
  attributes,
  last_changed: iso(agoMin),
  last_updated: iso(agoMin),
  context: { id: 'mock', parent_id: null, user_id: null },
});

interface MockGlobals {
  alarm: string;
  person: string;
  solar: number;
  consumption: number;
}

function buildStates(globals: MockGlobals): HassEntities {
  const states: HassEntities = {};
  const add = (e: HassEntity) => {
    states[e.entity_id] = e;
  };

  for (const room of ROOMS) {
    if (room.temp !== undefined) {
      add(
        entity(`sensor.${room.id}_temperatuur`, room.temp.toFixed(1), {
          friendly_name: `${room.name} temperatuur`,
          device_class: 'temperature',
          unit_of_measurement: '°C',
          state_class: 'measurement',
        }),
      );
    }
    if (room.hum !== undefined) {
      add(
        entity(`sensor.${room.id}_vochtigheid`, room.hum.toFixed(1), {
          friendly_name: `${room.name} vochtigheid`,
          device_class: 'humidity',
          unit_of_measurement: '%',
        }),
      );
    }
    for (const light of room.lights) {
      add(entity(light.id, light.on ? 'on' : 'off', { friendly_name: light.name }));
    }
    if (room.climate) {
      add(
        entity(room.climate.id, room.climate.on ? 'cool' : 'off', {
          friendly_name: room.climate.name,
          hvac_modes: ['off', 'cool', 'heat', 'dry', 'fan_only'],
          temperature: room.climate.target,
          current_temperature: room.climate.current,
          min_temp: 16,
          max_temp: 30,
          target_temp_step: 0.5,
        }),
      );
    }
    if (room.media) {
      add(
        entity(room.media.id, room.media.playing ? 'playing' : 'paused', {
          friendly_name: room.media.name,
          volume_level: room.media.volume / 100,
          media_title: room.media.station,
          media_content_type: 'music',
          supported_features: 84_927,
        }),
      );
    }
    for (const opening of room.openings ?? []) {
      add(
        entity(
          opening.id,
          opening.open ? 'on' : 'off',
          { friendly_name: opening.name, device_class: opening.deviceClass },
          opening.agoMin,
        ),
      );
    }
    if (room.motion) {
      add(
        entity(room.motion.id, room.motion.on ? 'on' : 'off', {
          friendly_name: room.motion.name,
          device_class: 'motion',
        }),
      );
    }
    if (room.smoke) {
      add(
        entity(room.smoke.id, room.smoke.on ? 'on' : 'off', {
          friendly_name: room.smoke.name,
          device_class: 'smoke',
        }),
      );
    }
    if (room.camera) {
      add(entity(room.camera.id, 'idle', { friendly_name: room.camera.name }));
    }
  }

  add(
    entity('alarm_control_panel.home', globals.alarm, {
      friendly_name: 'Alarm',
      code_format: 'number',
      code_arm_required: false,
      supported_features: 47,
    }),
  );
  add(entity('person.leen', globals.person, { friendly_name: 'Leen' }, 60));
  add(
    entity('weather.kmi', 'cloudy', {
      friendly_name: 'KMI Halle',
      temperature: 16.0,
      temperature_unit: '°C',
      humidity: 71,
      pressure: 1015,
      pressure_unit: 'hPa',
      wind_speed: 10,
      wind_speed_unit: 'km/h',
      wind_bearing: 225,
      supported_features: 3,
    }),
  );
  add(
    entity('sensor.zonnepanelen_vermogen', String(globals.solar), {
      friendly_name: 'Zonnepanelen vermogen',
      device_class: 'power',
      unit_of_measurement: 'W',
    }),
  );
  add(
    entity('sensor.verbruik_vermogen', String(globals.consumption), {
      friendly_name: 'Verbruik vermogen',
      device_class: 'power',
      unit_of_measurement: 'W',
    }),
  );
  for (const [id, name, value] of [
    ['sensor.keukenboiler_vermogen', 'Keukenboiler', 1877],
    ['sensor.bureau_vermogen', 'Bureau', 87.2],
    ['sensor.tv_vermogen', 'TV', 28.8],
  ] as const) {
    add(
      entity(id, String(value), {
        friendly_name: name,
        device_class: 'power',
        unit_of_measurement: 'W',
      }),
    );
  }

  return states;
}

function buildRegistries(states: HassEntities): {
  areas: AreaRegistryEntry[];
  devices: DeviceRegistryEntry[];
  entities: EntityRegistryEntry[];
} {
  const areas = ROOMS.map((room) => ({ area_id: room.id, name: room.name }));
  const areaOf = (entityId: string): string | null => {
    const room = ROOMS.find(
      (r) =>
        entityId.includes(`.${r.id}_`) ||
        entityId === `light.${r.id}` ||
        r.lights.some((l) => l.id === entityId) ||
        r.climate?.id === entityId ||
        r.media?.id === entityId ||
        r.camera?.id === entityId ||
        (r.openings ?? []).some((o) => o.id === entityId) ||
        r.motion?.id === entityId ||
        r.smoke?.id === entityId,
    );
    return room?.id ?? null;
  };
  // The three front-door sensors live in the hall but are named `o_*`.
  const HALL = ['binary_sensor.o_voordeur', 'binary_sensor.o_garagepoort', 'binary_sensor.o_achterdeur'];

  const entities: EntityRegistryEntry[] = Object.keys(states).map((entity_id) => ({
    entity_id,
    device_id: null,
    area_id: HALL.includes(entity_id) ? 'hal' : areaOf(entity_id),
  }));

  return { areas, devices: [], entities };
}

/**
 * Deterministic pseudo-random walk, the same shape the prototype's sparkline had.
 * It lands on `endsAt` so the history and the live state agree — otherwise the
 * card draws a cliff where the two series meet.
 */
function mockHistory(entityId: string, points: number, endsAt: number): { s: string; lu: number }[] {
  const seed = [...entityId].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 97;
  const now = Date.now();
  const walk: number[] = [];
  let value = 0.5;
  for (let i = 0; i < points; i += 1) {
    // Low frequencies only — a room's temperature drifts, it does not oscillate.
    value += (Math.sin(seed * 0.7 + i * 0.11) + Math.sin(seed * 1.3 + i * 0.037)) * 0.03;
    walk.push(Math.max(0.08, Math.min(0.92, value)));
  }
  const last = walk[walk.length - 1]!;
  return walk.map((v, i) => ({
    s: (endsAt + (v - last) * 3).toFixed(1),
    lu: (now - (points - i) * 3600_000 * (24 / points)) / 1000,
  }));
}

export function mockBackend(): HaBackend {
  const globals: MockGlobals = {
    alarm: 'disarmed',
    person: 'not_home',
    solar: 1168,
    consumption: 252,
  };
  let states = buildStates(globals);
  const registries = buildRegistries(states);
  const listeners = new Set<(entities: HassEntities) => void>();

  const emit = () => {
    states = { ...states };
    for (const listener of listeners) listener(states);
  };

  const patch = (entityId: string, state: string, attributes?: Record<string, unknown>) => {
    const current = states[entityId];
    if (!current) return;
    states[entityId] = {
      ...current,
      state,
      attributes: { ...current.attributes, ...(attributes ?? {}) },
      last_changed: current.state === state ? current.last_changed : new Date().toISOString(),
      last_updated: new Date().toISOString(),
    };
  };

  const targetIds = (target?: Record<string, unknown>, data?: Record<string, unknown>): string[] => {
    const raw = target?.entity_id ?? data?.entity_id;
    if (Array.isArray(raw)) return raw as string[];
    return typeof raw === 'string' ? [raw] : [];
  };

  return {
    hass: null,
    subscribeEntities(cb) {
      listeners.add(cb);
      cb(states);
      return () => listeners.delete(cb);
    },
    async callService(domain, service, data, target) {
      const ids = targetIds(target, data);
      for (const id of ids) {
        if (domain === 'light' || domain === 'switch') {
          if (service === 'turn_on') patch(id, 'on');
          else if (service === 'turn_off') patch(id, 'off');
          else if (service === 'toggle') patch(id, states[id]?.state === 'on' ? 'off' : 'on');
        } else if (domain === 'climate') {
          if (service === 'set_hvac_mode') patch(id, String(data?.hvac_mode ?? 'off'));
          else if (service === 'set_temperature')
            patch(id, states[id]?.state ?? 'off', { temperature: Number(data?.temperature) });
        } else if (domain === 'media_player') {
          const current = states[id]?.state;
          if (service === 'media_play_pause') patch(id, current === 'playing' ? 'paused' : 'playing');
          else if (service === 'media_play') patch(id, 'playing');
          else if (service === 'media_pause') patch(id, 'paused');
          else if (service === 'volume_set')
            patch(id, current ?? 'paused', { volume_level: Number(data?.volume_level) });
          else if (service === 'play_media')
            patch(id, 'playing', { media_title: String(data?.media_content_id ?? '') });
        } else if (domain === 'alarm_control_panel') {
          const next =
            service === 'alarm_disarm'
              ? 'disarmed'
              : service === 'alarm_arm_home'
                ? 'armed_home'
                : service === 'alarm_arm_away'
                  ? 'armed_away'
                  : states[id]?.state;
          patch(id, next ?? 'disarmed');
        }
      }
      emit();
      return undefined;
    },
    async sendMessagePromise<T>(message: Record<string, unknown>): Promise<T> {
      switch (message.type) {
        case 'config/area_registry/list':
          return registries.areas as unknown as T;
        case 'config/device_registry/list':
          return registries.devices as unknown as T;
        case 'config/entity_registry/list':
          return registries.entities as unknown as T;
        case 'history/history_during_period': {
          const ids = (message.entity_ids as string[]) ?? [];
          const result: Record<string, { s: string; lu: number }[]> = {};
          for (const id of ids) {
            const current = Number(states[id]?.state);
            result[id] = mockHistory(id, 48, Number.isFinite(current) ? current : 22);
          }
          return result as unknown as T;
        }
        default:
          return undefined as unknown as T;
      }
    },
    async subscribeMessage<T>(cb: (msg: T) => void, message: Record<string, unknown>) {
      if (message.type === 'weather/subscribe_forecast') {
        cb({
          type: 'daily',
          forecast: [
            { datetime: iso(-24 * 60), condition: 'cloudy', temperature: 23, templow: 17 },
            { datetime: iso(-48 * 60), condition: 'rainy', temperature: 24, templow: 17 },
            { datetime: iso(-72 * 60), condition: 'rainy', temperature: 21, templow: 20 },
            { datetime: iso(-96 * 60), condition: 'partlycloudy', temperature: 23, templow: 14 },
          ],
        } as unknown as T);
      }
      return () => undefined;
    },
    subscribeStatus(cb) {
      cb('connected');
      return () => undefined;
    },
  };
}
