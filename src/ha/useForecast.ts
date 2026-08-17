import { useEffect, useMemo, useState } from 'react';
import { useHass } from './HassProvider';
import { toNumber } from './selectors';
import type { ForecastDay } from './types';

interface ForecastEvent {
  type: string;
  forecast: unknown;
}

/**
 * Forecast entries arrive straight from whichever weather integration produced
 * them, so they are not trustworthy: `temperature` and `templow` are `null` on
 * days the integration has no value for. Coercing here keeps the components on
 * plain numbers — formatting a `null` used to throw and blank the dashboard.
 */
export function normalizeForecast(raw: unknown): ForecastDay[] {
  if (!Array.isArray(raw)) return [];
  const days: ForecastDay[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.datetime !== 'string' || record.datetime.length === 0) continue;

    const day: ForecastDay = {
      datetime: record.datetime,
      condition: typeof record.condition === 'string' ? record.condition : 'unknown',
    };
    const temperature = toNumber(record.temperature);
    if (temperature !== undefined) day.temperature = temperature;
    const templow = toNumber(record.templow);
    if (templow !== undefined) day.templow = templow;
    days.push(day);
  }
  return days;
}

/**
 * Daily forecast for the weather entity. Modern HA delivers it over
 * `weather/subscribe_forecast`; older installs still carry a `forecast`
 * attribute, which is used as the fallback.
 */
export function useForecast(entityId: string | undefined): ForecastDay[] {
  const { backend, entities } = useHass();
  const [forecast, setForecast] = useState<ForecastDay[]>([]);

  const attributeForecast = entityId ? entities[entityId]?.attributes?.forecast : undefined;
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
        { type: 'weather/subscribe_forecast', forecast_type: 'daily', entity_id: entityId },
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
  }, [backend, entityId]);

  return forecast.length > 0 ? forecast : fallback;
}
