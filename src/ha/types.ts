import type { Connection, HassEntities, HassEntity } from 'home-assistant-js-websocket';

export type { HassEntities, HassEntity };

/** Subset of HA's registry payloads that we actually read. */
export interface AreaRegistryEntry {
  area_id: string;
  name: string;
  floor_id?: string | null;
  icon?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  area_id: string | null;
  name?: string | null;
  name_by_user?: string | null;
}

export interface EntityRegistryEntry {
  entity_id: string;
  device_id: string | null;
  area_id: string | null;
  name?: string | null;
  original_name?: string | null;
  hidden_by?: string | null;
  disabled_by?: string | null;
  entity_category?: 'config' | 'diagnostic' | null;
}

export interface Registries {
  areas: AreaRegistryEntry[];
  devices: DeviceRegistryEntry[];
  entities: EntityRegistryEntry[];
}

/**
 * The `hass` object HA hands to a `panel_custom` element. Only the members the
 * dashboard uses are typed; it carries far more.
 */
export interface HomeAssistant {
  states: HassEntities;
  connection: Connection;
  language: string;
  locale?: { language: string };
  themes?: unknown;
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
}

/** Any WebSocket command; every HA message is keyed by its `type`. */
export type HaMessage = { type: string } & Record<string, unknown>;

/**
 * Everything the UI needs from the backend, so that the live WebSocket client and
 * the mock backend are interchangeable (see `ha/mock.ts`).
 */
export interface HaBackend {
  /** Present in panel mode; `hui-card` embedding needs the real `hass` object. */
  hass: HomeAssistant | null;
  subscribeEntities(cb: (entities: HassEntities) => void): () => void;
  callService(
    domain: string,
    service: string,
    data?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  sendMessagePromise<T>(message: HaMessage): Promise<T>;
  subscribeMessage<T>(cb: (msg: T) => void, message: HaMessage): Promise<() => void>;
  /** Connection lifecycle, surfaced as the reconnect banner. */
  subscribeStatus(cb: (status: ConnectionStatus) => void): () => void;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

/** Device buckets resolved out of the registries for one area. */
export interface RoomEntities {
  temperature?: string;
  humidity?: string;
  lights: string[];
  climate: string[];
  mediaPlayers: string[];
  openings: string[];
  motion: string[];
  smoke: string[];
  cameras: string[];
}

/** A room card's data, derived from registries + live states. */
export interface Room {
  id: string;
  name: string;
  tint: string;
  favourite: boolean;
  entities: RoomEntities;
  /** `undefined` when the area has no temperature sensor or it is unavailable. */
  temperature?: number;
  humidity?: number;
  lightsOn: boolean;
  climateOn: boolean;
  mediaPlaying: boolean;
  openingOpen: boolean;
  motionDetected: boolean;
  smokeDetected: boolean;
}

export interface Opening {
  entityId: string;
  name: string;
  room: string;
  deviceClass: 'window' | 'door' | 'garage_door';
  since: string;
  lastChanged: number;
}

export type AlarmState =
  | 'disarmed'
  | 'armed_home'
  | 'armed_away'
  | 'armed_night'
  | 'armed_vacation'
  | 'arming'
  | 'pending'
  | 'triggered'
  | 'unavailable';

export interface ForecastDay {
  datetime: string;
  condition: string;
  temperature: number;
  templow?: number;
}
