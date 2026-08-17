import { useEffect, useState } from 'react';
import {
  formatClock,
  formatDate,
  formatNumber,
  formatPlain,
  type WeatherInfo,
} from '../ha/selectors';
import type { ForecastDay } from '../ha/types';
import { Icon } from '../ui/Icon';
import { weatherIcon } from '../ui/icons';

/** Re-renders the clock often enough that the displayed minute is never stale. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function Header({
  weather,
  forecast,
  onOpenWeather,
}: {
  weather: WeatherInfo;
  forecast: ForecastDay[];
  onOpenWeather(): void;
}) {
  const now = useNow();
  const today = forecast[0];

  const meta: string[] = [];
  if (today?.temperature !== undefined) {
    const high = `${formatNumber(today.temperature)}°`;
    meta.push(today.templow !== undefined ? `${high} / ${formatNumber(today.templow)}°` : high);
  }
  if (weather.pressure !== undefined) {
    meta.push(`${formatPlain(weather.pressure)} ${weather.pressureUnit}`);
  }
  if (weather.windSpeed !== undefined) {
    meta.push(
      `${formatNumber(weather.windSpeed)} ${weather.windUnit}${
        weather.windBearing ? ` ${weather.windBearing}` : ''
      }`.toUpperCase(),
    );
  }

  return (
    <header className="header">
      <div className="header__row">
        <div>
          <div className="header__clock">{formatClock(now)}</div>
          <div className="header__date">{formatDate(now)}</div>
        </div>
        <button type="button" className="header__weather" onClick={onOpenWeather}>
          <div className="header__weather-row">
            <Icon name={weatherIcon(weather.condition)} size={22} />
            <span className="header__temp">
              {weather.temperature === undefined ? '—' : `${formatNumber(weather.temperature, 1)}°`}
            </span>
          </div>
          {meta.length > 0 && <div className="header__meta">{meta.join(' · ')}</div>}
        </button>
      </div>
    </header>
  );
}
