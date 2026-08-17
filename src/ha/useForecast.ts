import { useEffect, useState } from 'react';
import { useHass } from './HassProvider';
import type { ForecastDay } from './types';

interface ForecastEvent {
  type: string;
  forecast: ForecastDay[];
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
          if (!cancelled && Array.isArray(event?.forecast)) setForecast(event.forecast);
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

  if (forecast.length > 0) return forecast;
  return Array.isArray(attributeForecast) ? (attributeForecast as ForecastDay[]) : [];
}
