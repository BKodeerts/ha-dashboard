import type { MediaPreset } from '../config/config';
import type { HaBackend, HassEntities } from './types';

/**
 * Every write the dashboard makes. Each returns the optimistic patch to apply
 * locally so the UI flips on tap and the incoming `state_changed` only confirms
 * what is already on screen.
 */
export interface OptimisticPatch {
  entityId: string;
  state?: string;
  attributes?: Record<string, unknown>;
}

export interface ServiceCall {
  domain: string;
  service: string;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  optimistic: OptimisticPatch[];
}

/** Lights in a room: if any is on, turn them all off; else turn them all on. */
export function toggleRoomLights(lightIds: string[], states: HassEntities): ServiceCall | null {
  if (lightIds.length === 0) return null;
  const anyOn = lightIds.some((id) => states[id]?.state === 'on');
  const next = anyOn ? 'off' : 'on';
  return {
    domain: 'light',
    service: anyOn ? 'turn_off' : 'turn_on',
    target: { entity_id: lightIds },
    optimistic: lightIds.map((entityId) => ({ entityId, state: next })),
  };
}

export function toggleLight(entityId: string, states: HassEntities): ServiceCall {
  const next = states[entityId]?.state === 'on' ? 'off' : 'on';
  return {
    domain: 'light',
    service: next === 'on' ? 'turn_on' : 'turn_off',
    target: { entity_id: entityId },
    optimistic: [{ entityId, state: next }],
  };
}

/**
 * Drag on a per-lamp row. 0 turns the lamp off outright: `brightness_pct: 0` is
 * rejected by some integrations and merely ignored by others.
 */
export function setLightBrightness(entityId: string, percent: number): ServiceCall {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  if (clamped === 0) {
    return {
      domain: 'light',
      service: 'turn_off',
      target: { entity_id: entityId },
      optimistic: [{ entityId, state: 'off', attributes: { brightness: 0 } }],
    };
  }
  return {
    domain: 'light',
    service: 'turn_on',
    data: { brightness_pct: clamped },
    target: { entity_id: entityId },
    optimistic: [
      { entityId, state: 'on', attributes: { brightness: Math.round((clamped / 100) * 255) } },
    ],
  };
}

/** Picks the mode an AC returns to when switched back on. */
export function preferredHvacMode(states: HassEntities, entityId: string): string {
  const modes = states[entityId]?.attributes?.hvac_modes;
  const list = Array.isArray(modes) ? (modes as string[]) : [];
  return list.find((mode) => mode === 'cool') ?? list.find((mode) => mode !== 'off') ?? 'cool';
}

export function toggleClimate(entityId: string, states: HassEntities): ServiceCall {
  const current = states[entityId]?.state;
  const on = current !== undefined && current !== 'off';
  const mode = on ? 'off' : preferredHvacMode(states, entityId);
  return {
    domain: 'climate',
    service: 'set_hvac_mode',
    data: { hvac_mode: mode },
    target: { entity_id: entityId },
    optimistic: [{ entityId, state: mode }],
  };
}

/**
 * The room card's mode button steps through whatever the unit reports, in the
 * order it reports it. The design gives cool, heat, dry and fan a colour each,
 * and this button is the only way to reach them — a plain on/off toggle would
 * leave three of the four unreachable.
 */
export function cycleHvacMode(entityId: string, states: HassEntities): ServiceCall {
  const modes = states[entityId]?.attributes?.hvac_modes;
  const list = Array.isArray(modes) ? (modes as string[]) : [];
  if (list.length === 0) return toggleClimate(entityId, states);

  const current = states[entityId]?.state ?? 'off';
  const index = list.indexOf(current);
  const next = list[(index + 1) % list.length] ?? 'off';
  return {
    domain: 'climate',
    service: 'set_hvac_mode',
    data: { hvac_mode: next },
    target: { entity_id: entityId },
    optimistic: [{ entityId, state: next }],
  };
}

export function setClimateTemperature(entityId: string, temperature: number): ServiceCall {
  return {
    domain: 'climate',
    service: 'set_temperature',
    data: { temperature },
    target: { entity_id: entityId },
    optimistic: [{ entityId, attributes: { temperature } }],
  };
}

export function mediaPlayPause(entityId: string, states: HassEntities): ServiceCall {
  const playing = states[entityId]?.state === 'playing';
  return {
    domain: 'media_player',
    service: 'media_play_pause',
    target: { entity_id: entityId },
    optimistic: [{ entityId, state: playing ? 'paused' : 'playing' }],
  };
}

export function mediaStep(entityId: string, direction: 'next' | 'previous'): ServiceCall {
  return {
    domain: 'media_player',
    service: direction === 'next' ? 'media_next_track' : 'media_previous_track',
    target: { entity_id: entityId },
    optimistic: [],
  };
}

export function mediaVolume(entityId: string, percent: number): ServiceCall {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return {
    domain: 'media_player',
    service: 'volume_set',
    data: { volume_level: clamped / 100 },
    target: { entity_id: entityId },
    optimistic: [{ entityId, attributes: { volume_level: clamped / 100 } }],
  };
}

export function mediaPlayPreset(entityId: string, preset: MediaPreset): ServiceCall {
  return {
    domain: 'media_player',
    service: 'play_media',
    data: {
      media_content_type: preset.media_content_type,
      media_content_id: preset.media_content_id,
    },
    target: { entity_id: entityId },
    optimistic: [{ entityId, state: 'playing', attributes: { media_title: preset.name } }],
  };
}

export type AlarmAction = 'disarm' | 'arm_home' | 'arm_away';

const ALARM_PENDING: Record<AlarmAction, string> = {
  disarm: 'disarmed',
  arm_home: 'arming',
  arm_away: 'arming',
};

export function alarmCommand(entityId: string, action: AlarmAction, code?: string): ServiceCall {
  return {
    domain: 'alarm_control_panel',
    service: `alarm_${action}`,
    data: code ? { code } : {},
    target: { entity_id: entityId },
    optimistic: [{ entityId, state: ALARM_PENDING[action] }],
  };
}

export async function execute(backend: HaBackend, call: ServiceCall): Promise<void> {
  await backend.callService(call.domain, call.service, call.data, call.target);
}
