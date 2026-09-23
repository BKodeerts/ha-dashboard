import { useEffect, useMemo, useState } from 'react';
import { fetchSilentSince, type SilentSince } from './history';
import { needsSilenceHistory } from './stale';
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
): ReadonlyMap<string, SilentSince> {
  const key = useMemo(() => {
    const flagged: unknown = states[sensorEntityId]?.attributes?.entities;
    if (!Array.isArray(flagged)) return '';
    const parts: string[] = [];
    for (const entityId of flagged) {
      if (typeof entityId !== 'string') continue;
      const entity = states[entityId];
      if (!entity || !needsSilenceHistory(entity)) continue;
      parts.push(`${entityId}\u0000${entity.state}\u0000${entity.last_changed}`);
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
      const [entityId, state, lastChanged] = part.split('\u0000') as [string, string, string];
      return { entityId, state, lastChanged };
    });
    Promise.all(
      targets.map(({ entityId, state, lastChanged }) =>
        fetchSilentSince(backend, entityId, state, lastChanged).then(
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
  }, [backend, key]);

  return known;
}
