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
  disabled_by?: string | null;
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
 * The logged-in Home Assistant account. Panel mode gets it on `hass.user`;
 * standalone asks the socket for it (`auth/current_user`).
 */
export interface CurrentUser {
  id: string;
  name: string;
  is_admin?: boolean;
}

/**
 * The `hass` object HA hands to a `panel_custom` element. Only the members the
 * dashboard uses are typed; it carries far more.
 */
export interface HomeAssistant {
  states: HassEntities;
  connection: Connection;
  /** v4 derives "who am I" from this instead of asking in settings. */
  user?: CurrentUser;
  language: string;
  locale?: { language: string };
  /** `themes.darkMode` is how the HA frontend reports the scheme it is painting. */
  themes?: { darkMode?: boolean } & Record<string, unknown>;
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
  /**
   * Panel mode only: fires when the HA frontend switches between its light and
   * dark themes, so `theme: auto` can follow it without waiting for the next
   * state update to re-read `hass`. Absent outside HA.
   */
  subscribeDarkMode?(cb: (dark: boolean | undefined) => void): () => void;
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

/**
 * The HVAC modes the design gives a colour to. Anything else a unit reports
 * (`auto`, `heat_cool`, …) is rendered with the neutral "on" treatment.
 */
export type HvacMode = 'off' | 'cool' | 'heat' | 'dry' | 'fan_only' | 'other';

/** One lamp, as the room card's brightness row needs it. */
export interface RoomLight {
  entityId: string;
  /** Name with the room prefix stripped: "Living Speelhoek" → "Speelhoek". */
  name: string;
  on: boolean;
  /** Lamps that only switch get a tap row, never a drag. */
  dimmable: boolean;
  /** 0–100. Always 0 when off, so the row's fill needs no special case. */
  brightness: number;
}

export interface RoomClimate {
  entityId: string;
  /** The narrowed mode — what picks the glyph, the hue and the label. */
  mode: HvacMode;
  /**
   * The unit's own `hvac_mode`. `mode` collapses anything outside the design's
   * five onto `other`, which is enough to paint with and useless to send back,
   * so the sheet's dropdown reads and writes this instead.
   */
  modeId: string;
  /**
   * Every mode the unit reports, in its own order, and always containing
   * `modeId` — the dropdown's `value` would otherwise match no option.
   */
  modes: string[];
  /** `undefined` while the unit reports no setpoint — the stepper stays disabled. */
  target?: number;
  min: number;
  max: number;
  step: number;
}

export interface RoomMedia {
  entityId: string;
  playing: boolean;
  /** `media_title` when the player has one, else its friendly name. */
  station: string;
}

/** A room tile's data, derived from registries + live states. */
export interface Room {
  id: string;
  name: string;
  tint: string;
  /** The HA area's own `icon` (e.g. `mdi:sofa`), rendered as-is by `ui/HaIcon.tsx`. */
  icon?: string;
  favourite: boolean;
  entities: RoomEntities;
  /** `undefined` when the area has no temperature sensor or it is unavailable. */
  temperature?: number;
  humidity?: number;
  lights: RoomLight[];
  lightsOn: boolean;
  climate?: RoomClimate;
  media?: RoomMedia;
  /**
   * Any window, door or garage door in the room is open. There is no flag for
   * *having* opening sensors: the tile draws the chip only while one is open,
   * so a room with sensors and a room without look the same when shut.
   */
  openingOpen: boolean;
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

/**
 * A normalised forecast entry — one hour or one day, `weather/subscribe_forecast`
 * shapes both the same way. Every reading past `datetime`/`condition` is optional:
 * integrations leave fields out, or send them as `null`, which `normalizeForecast`
 * drops rather than coercing to `0`.
 */
export interface ForecastEntry {
  datetime: string;
  condition: string;
  temperature?: number;
  templow?: number;
  apparent_temperature?: number;
  dew_point?: number;
  humidity?: number;
  precipitation?: number;
  precipitation_probability?: number;
  wind_speed?: number;
  wind_gust_speed?: number;
  wind_bearing?: string;
  cloud_coverage?: number;
  pressure?: number;
  uv_index?: number;
  is_daytime?: boolean;
}
