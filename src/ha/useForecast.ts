import { useEffect, useMemo, useState } from 'react';
import { useHass } from './HassProvider';
import { bearingToCompass, toNumber } from './selectors';
import type { ForecastEntry } from './types';

interface ForecastEvent {
  type: string;
  forecast: unknown;
}

export type ForecastType = 'hourly' | 'daily' | 'twice_daily';

/**
 * Forecast entries arrive straight from whichever weather integration produced
 * them, so they are not trustworthy: numeric readings are `null` on entries
 * the integration has no value for. Coercing here keeps the components on
 * plain numbers — formatting a `null` used to throw and blank the dashboard.
 */
export function normalizeForecast(raw: unknown): ForecastEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: ForecastEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    if (typeof record.datetime !== 'string' || record.datetime.length === 0) continue;

    const entry: ForecastEntry = {
      datetime: record.datetime,
      condition: typeof record.condition === 'string' ? record.condition : 'unknown',
    };
    const setNumber = (key: keyof ForecastEntry, value: unknown) => {
      const n = toNumber(value);
      if (n !== undefined) (entry[key] as number | undefined) = n;
    };
    setNumber('temperature', record.temperature);
    setNumber('templow', record.templow);
    setNumber('apparent_temperature', record.apparent_temperature);
    setNumber('dew_point', record.dew_point);
    setNumber('humidity', record.humidity);
    setNumber('precipitation', record.precipitation);
    setNumber('precipitation_probability', record.precipitation_probability);
    setNumber('wind_speed', record.wind_speed);
    setNumber('wind_gust_speed', record.wind_gust_speed);
    setNumber('cloud_coverage', record.cloud_coverage);
    setNumber('pressure', record.pressure);
    setNumber('uv_index', record.uv_index);
    const bearing = bearingToCompass(record.wind_bearing);
    if (bearing) entry.wind_bearing = bearing;
    if (typeof record.is_daytime === 'boolean') entry.is_daytime = record.is_daytime;
    entries.push(entry);
  }
  return entries;
}

/**
 * One forecast series for the weather entity. Modern HA delivers it over
 * `weather/subscribe_forecast`; older installs still carry a `forecast`
 * attribute (always daily), used as the fallback for that type only.
 */
export function useForecast(
  entityId: string | undefined,
  type: ForecastType = 'daily',
): ForecastEntry[] {
  const { backend, entities } = useHass();
  const [forecast, setForecast] = useState<ForecastEntry[]>([]);

  const attributeForecast =
    type === 'daily' && entityId ? entities[entityId]?.attributes?.forecast : undefined;
  // Memoised so the fallback keeps a stable identity across renders.
  const fallback = useMemo(() => normalizeForecast(attributeForecast), [attributeForecast]);

  useEffect(() => {
    if (!entityId) {
      setForecast([]);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    backend
      .subscribeMessage<ForecastEvent>(
        (event) => {
          if (!cancelled && Array.isArray(event?.forecast)) {
            setForecast(normalizeForecast(event.forecast));
          }
        },
        { type: 'weather/subscribe_forecast', forecast_type: type, entity_id: entityId },
      )
      .then((unsub) => {
        if (cancelled) unsub();
        else unsubscribe = unsub;
      })
      .catch(() => {
        // Entity does not support the subscription — the attribute fallback below applies.
      });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [backend, entityId, type]);

  return forecast.length > 0 ? forecast : fallback;
}
