import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HaBackend,
  HassEntities,
  HassEntity,
} from './types';

/**
 * The account the mock is "logged in" as. `person.bart` carries this id in its
 * `user_id` attribute, which is exactly how the real thing resolves who is
 * holding the phone — see `currentPerson` in `ha/selectors.ts`.
 */
const MOCK_USER = { id: 'mock-user-bart', name: 'Bart', is_admin: true };

/** Which armed state each arm service lands on, after the exit delay. */
const ARMED_STATE: Record<string, string | undefined> = {
  alarm_arm_home: 'armed_home',
  alarm_arm_away: 'armed_away',
  alarm_arm_night: 'armed_night',
  alarm_arm_vacation: 'armed_vacation',
  alarm_arm_custom_bypass: 'armed_custom_bypass',
};

/**
 * A stand-in Home Assistant, carrying the same mock state the design prototype
 * used. It implements `HaBackend` exactly like the live socket, so `npm run dev`
 * gives a working dashboard with no HA instance in reach — and every service call
 * mutates this state, so the interactions are real.
 */

interface MockLight {
  id: string;
  name: string;
  on: boolean;
  /** Lamps without a level are switch-only, and get the `aan/uit` row. */
  brightness?: number;
}

interface MockRoom {
  id: string;
  name: string;
  /** Stands in for the area registry's own `icon` (e.g. `mdi:sofa`). */
  icon?: string;
  temp?: number;
  hum?: number;
  lights: MockLight[];
  climate?: {
    id: string;
    name: string;
    mode: 'off' | 'cool' | 'heat' | 'dry' | 'fan_only';
    target: number;
    current: number;
  };
  media?: { id: string; name: string; playing: boolean; volume: number; station: string };
  openings?: { id: string; name: string; deviceClass: 'window' | 'door'; open: boolean; agoMin: number }[];
  motion?: { id: string; name: string; on: boolean };
  smoke?: { id: string; name: string; on: boolean };
  camera?: { id: string; name: string };
}

/**
 * Devices that stopped reporting, for the Netwerk tab. Each carries a battery
 * sensor on the same device, which is how the real list finds its percentages.
 */
interface MockQuiet {
  device: string;
  name: string;
  area: string;
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  battery?: number;
  agoMin: number;
}

const QUIET: MockQuiet[] = [
  {
    device: 'dev_waskot_lek',
    name: 'Waskot lekdetectie',
    area: 'waskot',
    entityId: 'binary_sensor.waskot_lek',
    state: 'off',
    attributes: { friendly_name: 'Waskot lek', device_class: 'moisture' },
    battery: 4,
    agoMin: 6 * 24 * 60,
  },
  {
    device: 'dev_tuin_temp',
    name: 'Tuinsensor',
    area: 'living',
    entityId: 'sensor.tuin_temperatuur',
    state: '11.4',
    attributes: {
      friendly_name: 'Tuin temperatuur',
      device_class: 'temperature',
      unit_of_measurement: '°C',
    },
    battery: 11,
    agoMin: 3 * 24 * 60,
  },
  {
    device: 'dev_garage_deur',
    name: 'Garagepoort contact',
    area: 'hal',
    entityId: 'binary_sensor.garage_contact',
    state: 'off',
    attributes: { friendly_name: 'Garage contact', device_class: 'door' },
    battery: 62,
    agoMin: 55 * 60,
  },
  {
    device: 'dev_repeater',
    name: 'Zigbee repeater keuken',
    area: 'living',
    entityId: 'sensor.zigbee_repeater_lqi',
    state: 'unavailable',
    attributes: { friendly_name: 'Zigbee repeater LQI' },
    agoMin: 31 * 60,
  },
];

const ROOMS: MockRoom[] = [
  {
    id: 'living',
    name: 'Living',
    icon: 'mdi:sofa',
    temp: 24.2,
    hum: 61.9,
    lights: [
      { id: 'light.living', name: 'Living', on: true, brightness: 62 },
      { id: 'light.speelhoek', name: 'Speelhoek', on: false, brightness: 45 },
      // No level: a switched lamp, so the room card shows it as `aan/uit`.
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
    icon: 'mdi:office-chair',
    temp: 23.4,
    hum: 64.0,
    lights: [{ id: 'light.bureau', name: 'Bureau ring', on: true, brightness: 80 }],
    openings: [
      { id: 'binary_sensor.bureau_raam', name: 'Raam', deviceClass: 'window', open: true, agoMin: 93 },
    ],
  },
  {
    id: 'slaapkamer',
    name: 'Slaapkamer',
    icon: 'mdi:bed',
    temp: 23.1,
    hum: 63.4,
    lights: [{ id: 'light.slaapkamer', name: 'Plafond', on: false, brightness: 70 }],
    climate: {
      id: 'climate.slaapkamer',
      name: 'Slaapkamer AC',
      mode: 'off',
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
    icon: 'mdi:bed',
    temp: 22.6,
    hum: 60.8,
    lights: [{ id: 'light.clara', name: 'Nachtlamp', on: false, brightness: 25 }],
    climate: { id: 'climate.clara', name: 'Clara AC', mode: 'cool', target: 25, current: 22.6 },
    openings: [
      { id: 'binary_sensor.clara_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 900 },
    ],
    camera: { id: 'camera.clara', name: 'Clara camera' },
  },
  {
    id: 'oliver',
    name: 'Oliver',
    icon: 'mdi:bed',
    temp: 24.0,
    hum: 60.2,
    lights: [{ id: 'light.oliver', name: 'Nachtlamp', on: true, brightness: 35 }],
    climate: { id: 'climate.oliver', name: 'Oliver AC', mode: 'dry', target: 24, current: 24.0 },
    openings: [
      { id: 'binary_sensor.oliver_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 800 },
    ],
  },
  {
    id: 'dressing',
    name: 'Dressing',
    icon: 'mdi:hanger',
    temp: 24.0,
    hum: 61.0,
    lights: [{ id: 'light.dressing', name: 'Dressing', on: false, brightness: 60 }],
  },
  {
    id: 'waskot',
    name: 'Waskot',
    icon: 'mdi:washing-machine',
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
    icon: 'mdi:shower',
    temp: 24.4,
    hum: 66.0,
    lights: [{ id: 'light.badkamer', name: 'Badkamer', on: false, brightness: 80 }],
    openings: [
      { id: 'binary_sensor.badkamer_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 900 },
    ],
  },
  {
    id: 'toilet',
    name: 'Toilet',
    icon: 'mdi:toilet',
    temp: 24.6,
    hum: 61.0,
    lights: [{ id: 'light.toilet', name: 'Toilet', on: false }],
    openings: [
      { id: 'binary_sensor.toilet_raam', name: 'Raam', deviceClass: 'window', open: false, agoMin: 1100 },
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
      const dimmable = light.brightness !== undefined;
      add(
        entity(light.id, light.on ? 'on' : 'off', {
          friendly_name: light.name,
          supported_color_modes: dimmable ? ['brightness'] : ['onoff'],
          color_mode: light.on ? (dimmable ? 'brightness' : 'onoff') : null,
          ...(dimmable
            ? { brightness: Math.round(((light.brightness ?? 0) / 100) * 255) }
            : {}),
        }),
      );
    }
    if (room.climate) {
      add(
        entity(room.climate.id, room.climate.mode, {
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
      // ARM_HOME | ARM_AWAY | ARM_NIGHT | TRIGGER. The first three are what the
      // picker draws (`Weg`, `Nacht`, `Thuis`) alongside the always-present
      // `Uit`; TRIGGER is deliberately in here and deliberately *not* in the
      // picker, which is the case that proves the picker filters the bitmask
      // to arm modes rather than rendering every bit it finds.
      supported_features: 1 | 2 | 4 | 8,
    }),
  );
  // Three people, so "Wie volg je bovenaan" has more than one option to pick
  // between in its radio list. `user_id` on Bart is what makes him the
  // logged-in account — see MOCK_USER and `currentPerson`.
  add(entity('person.bart', 'home', { friendly_name: 'Bart', user_id: MOCK_USER.id }, 45));
  add(entity('person.leen', globals.person, { friendly_name: 'Leen' }, 60));
  add(entity('person.nora', 'not_home', { friendly_name: 'Nora' }, 120));

  for (const quiet of QUIET) {
    add(entity(quiet.entityId, quiet.state, quiet.attributes, quiet.agoMin));
    if (quiet.battery !== undefined) {
      add(
        entity(
          `${quiet.entityId.replace(/^[a-z_]+\./, 'sensor.')}_battery`,
          String(quiet.battery),
          {
            friendly_name: `${quiet.name} batterij`,
            device_class: 'battery',
            unit_of_measurement: '%',
          },
          quiet.agoMin,
        ),
      );
    }
  }
  add(
    entity('sensor.disconnected_devices', String(QUIET.length), {
      friendly_name: 'Disconnected Devices',
      entities: QUIET.map((quiet) => quiet.entityId),
    }),
  );
  add(
    entity('weather.kmi', 'cloudy', {
      friendly_name: 'KMI Halle',
      temperature: 16.0,
      temperature_unit: '°C',
      apparent_temperature: 15.2,
      dew_point: 12.4,
      humidity: 78,
      pressure: 1015,
      pressure_unit: 'hPa',
      wind_speed: 10,
      wind_speed_unit: 'km/h',
      wind_gust_speed: 28,
      wind_bearing: 225,
      cloud_coverage: 75,
      uv_index: 4,
      visibility: 12,
      visibility_unit: 'km',
      precipitation_unit: 'mm',
      // FORECAST_DAILY | FORECAST_HOURLY
      supported_features: 1 | 2,
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
  const areas = ROOMS.map((room) => ({
    area_id: room.id,
    name: room.name,
    ...(room.icon ? { icon: room.icon } : {}),
  }));
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

  // Only the quiet devices are modelled as devices — that is the one place the
  // dashboard groups by device rather than by entity.
  const devices: DeviceRegistryEntry[] = QUIET.map((quiet) => ({
    id: quiet.device,
    area_id: quiet.area,
    name: quiet.name,
  }));

  const deviceOf = (entityId: string): string | null =>
    QUIET.find(
      (q) =>
        entityId === q.entityId ||
        entityId === `${q.entityId.replace(/^[a-z_]+\./, 'sensor.')}_battery`,
    )?.device ?? null;

  const entities: EntityRegistryEntry[] = Object.keys(states).map((entity_id) => {
    const device_id = deviceOf(entity_id);
    const quiet = device_id ? QUIET.find((q) => q.device === device_id) : undefined;
    return {
      entity_id,
      device_id,
      area_id: quiet?.area ?? (HALL.includes(entity_id) ? 'hal' : areaOf(entity_id)),
    };
  });

  return { areas, devices, entities };
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
  // The swing scales with the reading itself — a fixed ±3 reads fine against a
  // ~20° room temperature but flatlines a several-hundred-watt power sensor.
  const amplitude = Math.max(3, Math.abs(endsAt) * 0.35);
  return walk.map((v, i) => ({
    s: (endsAt + (v - last) * amplitude).toFixed(1),
    lu: (now - (points - i) * 3600_000 * (24 / points)) / 1000,
  }));
}

/**
 * Stand-in for HA's `frontend.user_data_*` store. Backed by localStorage rather
 * than a plain object so that `npm run dev` remembers settings across a reload
 * the way the real server does — the dashboard's own cache is only a cache, and
 * would be overwritten by whatever this answered.
 */
function mockStore(name: string): {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
} {
  const storageKey = `ha-dashboard.mock.${name}`;
  const read = (): Record<string, unknown> => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  return {
    get: (key) => read()[key] ?? null,
    set(key, value) {
      const data = read();
      data[key] = value;
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        /* ignore */
      }
    },
  };
}

export function mockBackend(): HaBackend {
  const userStore = mockStore(`user_data_${MOCK_USER.id}`);

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
          const dimmable = Array.isArray(states[id]?.attributes?.supported_color_modes)
            ? !(states[id]!.attributes!.supported_color_modes as string[]).includes('onoff')
            : true;
          const pct = Number(data?.brightness_pct);
          if (service === 'turn_on') {
            patch(
              id,
              'on',
              dimmable && Number.isFinite(pct)
                ? { brightness: Math.round((pct / 100) * 255) }
                : undefined,
            );
          } else if (service === 'turn_off') {
            // Keep the level: HA restores the last brightness on the next
            // `turn_on`, and the UI reads 0 % from the state, not the attribute.
            patch(id, 'off');
          } else if (service === 'toggle') {
            patch(id, states[id]?.state === 'on' ? 'off' : 'on');
          }
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
          // Arming runs through `arming` the way a real panel's exit delay
          // does, so the chip's pulsing dot has something to pulse through.
          const armed = ARMED_STATE[service];
          if (armed) {
            patch(id, 'arming');
            setTimeout(() => {
              patch(id, armed);
              emit();
            }, 4000);
          } else if (service === 'alarm_disarm') {
            patch(id, 'disarmed');
          } else if (service === 'alarm_trigger') {
            // Nothing in the UI sends this — the picker offers arm modes only.
            // It is here so the chip's loudest state is reachable from a
            // console (`callService('alarm_control_panel', 'alarm_trigger', …)`)
            // without editing the mock to see it.
            patch(id, 'triggered');
          }
        }
      }
      emit();
      return undefined;
    },
    async sendMessagePromise<T>(message: Record<string, unknown>): Promise<T> {
      switch (message.type) {
        case 'auth/current_user':
          return MOCK_USER as unknown as T;
        // The frontend store the dashboard's personal config lives in.
        case 'frontend/get_user_data':
          return { value: userStore.get(String(message.key)) } as unknown as T;
        case 'frontend/set_user_data':
          userStore.set(String(message.key), message.value);
          return undefined as unknown as T;
        case 'config/area_registry/list':
          return registries.areas as unknown as T;
        case 'config/device_registry/list':
          return registries.devices as unknown as T;
        case 'config/entity_registry/list':
          return registries.entities as unknown as T;
        // A household that has gone through Settings → Dashboards → Energy:
        // one solar source, and the three power sensors already in this mock
        // as its "individual devices".
        case 'energy/get_prefs':
          return {
            energy_sources: [
              {
                type: 'solar',
                stat_rate: 'sensor.zonnepanelen_vermogen',
                config_entry_solar_forecast: ['mock_solar_forecast'],
              },
            ],
            device_consumption: [
              { name: 'Keukenboiler', stat_rate: 'sensor.keukenboiler_vermogen' },
              { name: 'Bureau', stat_rate: 'sensor.bureau_vermogen' },
              { name: 'TV', stat_rate: 'sensor.tv_vermogen' },
            ],
          } as unknown as T;
        // A smooth midday-peaked curve for the rest of today, so the
        // forecast line has something to draw in the standalone preview.
        case 'energy/solar_forecast': {
          const whHours: Record<string, number> = {};
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          for (let hour = 0; hour < 24; hour += 1) {
            const shaped = Math.cos(((hour - 13) / 8) * (Math.PI / 2));
            whHours[new Date(dayStart.getTime() + hour * 3600e3).toISOString()] =
              Math.max(0, Math.round(shaped ** 2 * 2400));
          }
          return { mock_solar_forecast: { wh_hours: whHours } } as unknown as T;
        }
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
        if (message.forecast_type === 'hourly') {
          // Same 24 h curve as the handoff's own prototype (Weer Sheet.dc.html).
          const TEMPS = [
            15.2, 16.4, 17.9, 19.4, 20.8, 22.1, 23.0, 23.6, 23.9, 23.4, 22.5, 21.3, 20.1, 19.2, 18.6,
            18.1, 17.6, 17.2, 16.9, 16.5, 16.2, 15.9, 15.6, 15.4,
          ];
          const APP = [
            14.1, 15.3, 16.9, 18.6, 20.1, 21.5, 22.4, 23.0, 23.1, 22.3, 21.1, 19.8, 18.7, 18.0, 17.5,
            17.0, 16.5, 16.1, 15.8, 15.4, 15.1, 14.8, 14.5, 14.3,
          ];
          const MM: Record<number, number> = { 3: 0.4, 4: 1.2, 5: 0.9, 6: 0.3, 13: 0.2 };
          cb({
            type: 'hourly',
            forecast: TEMPS.map((temperature, i) => ({
              datetime: iso(-60 * (i + 1)),
              condition: MM[i] ? 'rainy' : i > 15 ? 'clear-night' : 'partlycloudy',
              temperature,
              apparent_temperature: APP[i],
              precipitation: MM[i] ?? 0,
              humidity: 78,
              wind_speed: 10,
              wind_bearing: 225,
            })),
          } as unknown as T);
        } else {
          const DAYS = [
            { condition: 'cloudy', temperature: 23, templow: 17, precipitation: 2.6, precipitation_probability: 70 },
            { condition: 'partlycloudy', temperature: 24, templow: 14, precipitation: 0, precipitation_probability: 10 },
            { condition: 'sunny', temperature: 26, templow: 15, precipitation: 0, precipitation_probability: 0 },
            { condition: 'partlycloudy', temperature: 25, templow: 16, precipitation: 0.4, precipitation_probability: 20 },
            { condition: 'rainy', temperature: 21, templow: 17, precipitation: 6.2, precipitation_probability: 85 },
            { condition: 'rainy', temperature: 19, templow: 14, precipitation: 3.1, precipitation_probability: 65 },
            // HA sends `null` for readings an integration does not have.
            { condition: 'partlycloudy', temperature: null, templow: null, precipitation: 0.2, precipitation_probability: 15 },
          ];
          cb({
            type: 'daily',
            forecast: DAYS.map((day, i) => ({ datetime: iso(-24 * 60 * (i + 1)), ...day })),
          } as unknown as T);
        }
      }
      return () => undefined;
    },
    subscribeStatus(cb) {
      cb('connected');
      return () => undefined;
    },
  };
}
