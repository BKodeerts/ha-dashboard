import { formatNumber, formatTemp, isNumber, type WeatherInfo } from '../ha/selectors';
import type { ForecastDay } from '../ha/types';
import { Icon } from '../ui/Icon';
import { WEATHER_LABELS, weatherIcon } from '../ui/icons';

/**
 * v2 opens on the weather rather than the clock — a phone already shows the
 * time. Condition and today's range sit under it in one mono line, and the whole
 * block is the tap target for the weather sheet.
 */
export function WeatherBlock({
  weather,
  forecast,
  onOpen,
}: {
  weather: WeatherInfo;
  forecast: ForecastDay[];
  onOpen(): void;
}) {
  const today = forecast[0];
  const condition = WEATHER_LABELS[weather.condition] ?? weather.condition;

  const range = isNumber(today?.temperature)
    ? `${formatNumber(today.temperature)}°${
        isNumber(today.templow) ? ` / ${formatNumber(today.templow)}°` : ''
      }`
    : undefined;

  return (
    <button type="button" className="weather" onClick={onOpen} aria-label="Weer">
      <span className="weather__row">
        <Icon name={weatherIcon(weather.condition)} size={26} />
        <span className="weather__temp">{formatTemp(weather.temperature, 1)}</span>
      </span>
      <span className="weather__meta">
        {[condition, range].filter(Boolean).join(' · ')}
      </span>
    </button>
  );
}
