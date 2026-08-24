import type { HaBackend } from './types';

interface RawSolarForecastEntry {
  wh_hours?: Record<string, number>;
}

type RawSolarForecast = Record<string, RawSolarForecastEntry>;

/**
 * Today's solar production forecast, in Wh per wall-clock hour, from
 * whichever forecast integration (Forecast.Solar, Solcast, …) is wired to
 * the household's own Energy dashboard solar source(s) — `energy_prefs`'
 * `config_entry_solar_forecast` (see `ha/energyPrefs.ts`), keyed by config
 * entry id in the response of `energy/solar_forecast`. That is the same
 * call HA's own Energy dashboard draws its forecast line from, so there is
 * nothing to guess at: no forecast integration configured, or the whole call
 * failing on an HA too old to answer it, both resolve to `undefined` — the
 * chart just draws no forecast line rather than breaking.
 *
 * A household with more than one solar array, each with its own forecast
 * source, gets its hours summed rather than picking just one.
 */
export async function fetchSolarForecast(
  backend: HaBackend,
  configEntryIds: string[],
): Promise<Record<string, number> | undefined> {
  if (configEntryIds.length === 0) return undefined;
  try {
    const raw = await backend.sendMessagePromise<RawSolarForecast>({
      type: 'energy/solar_forecast',
    });
    const whHours: Record<string, number> = {};
    let any = false;
    for (const id of configEntryIds) {
      const hours = raw[id]?.wh_hours;
      if (!hours) continue;
      any = true;
      for (const [iso, wh] of Object.entries(hours)) {
        whHours[iso] = (whHours[iso] ?? 0) + wh;
      }
    }
    return any ? whHours : undefined;
  } catch {
    return undefined;
  }
}
