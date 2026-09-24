import { useEffect, useMemo, useState } from 'react';
import { fetchSilentSince, RECORDER_KEEP_DAYS, type SilentSince } from './history';
import { isLastSeenTracker, needsSilenceHistory } from './stale';
import type { HaBackend, HassEntities } from './types';

/**
 * When each tracker flagged by the disconnected-devices sensor actually went
 * quiet, from history — `collectStale` falls back to `last_changed` for any
 * entity missing here, so the tab renders straight away and the badges
 * correct themselves once history answers.
 *
 * The effect is keyed on `entity@last_changed` for every flagged entity, not
 * on `states` itself: states change every few seconds, and none of those
 * updates matter here until a tracker's own `last_changed` does.
 */
export function useSilentSince(
  backend: HaBackend,
  states: HassEntities,
  sensorEntityId: string,
  /** `DashboardConfig.recorderKeepDays`. */
  keepDaysSetting?: number,
): ReadonlyMap<string, SilentSince> {
  // Hand-written YAML: anything that isn't a positive number means the default.
  const keepDays =
    typeof keepDaysSetting === 'number' && keepDaysSetting > 0
      ? keepDaysSetting
      : RECORDER_KEEP_DAYS;
  const key = useMemo(() => {
    const flagged: unknown = states[sensorEntityId]?.attributes?.entities;
    if (!Array.isArray(flagged)) return '';
    const parts: string[] = [];
    for (const entityId of flagged) {
      if (typeof entityId !== 'string') continue;
      const entity = states[entityId];
      if (!entity || !needsSilenceHistory(entity)) continue;
      const lastSeen = isLastSeenTracker(entity) ? '1' : '';
      parts.push(`${entityId}\u0000${entity.state}\u0000${entity.last_changed}\u0000${lastSeen}`);
    }
    return parts.sort().join('\u0001');
  }, [states, sensorEntityId]);

  const [known, setKnown] = useState<ReadonlyMap<string, SilentSince>>(() => new Map());

  useEffect(() => {
    if (!key) {
      setKnown(new Map());
      return;
    }
    let cancelled = false;
    const targets = key.split('\u0001').map((part) => {
      const [entityId, state, lastChanged, lastSeen] = part.split('\u0000') as [
        string,
        string,
        string,
        string,
      ];
      return { entityId, state, lastChanged, lastSeen: lastSeen === '1' };
    });
    Promise.all(
      targets.map(({ entityId, state, lastChanged, lastSeen }) =>
        fetchSilentSince(backend, entityId, state, lastChanged, lastSeen, keepDays).then(
          (value) => [entityId, value] as const,
        ),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, SilentSince>();
      for (const [entityId, value] of results) if (value) next.set(entityId, value);
      setKnown(next);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, key, keepDays]);

  return known;
}
