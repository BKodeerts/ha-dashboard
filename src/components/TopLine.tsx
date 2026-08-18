import {
  formatNumber,
  formatTemp,
  isNumber,
  type PresenceInfo,
  type WeatherInfo,
} from '../ha/selectors';
import type { ForecastDay } from '../ha/types';
import { Icon } from '../ui/Icon';
import { weatherIcon } from '../ui/icons';

/**
 * The first line of the home screen: the weather on the left, whoever is not
 * you on the right.
 *
 * v2 stacked a centred weather block over a three-pill row that wrapped, and
 * spent about 210px before the first room tile. Presence is a standing fact
 * rather than an exception, so it sits up here as a fixed-width chip instead —
 * which both halves the header and leaves the pill row below with only two
 * bounded labels to fit on one line.
 *
 * The condition *word* moved into the weather sheet: at this size the icon
 * beside the reading says it, and the space buys today's range.
 */
export function TopLine({
  weather,
  forecast,
  presence,
  onOpenWeather,
  onOpenPresence,
}: {
  weather: WeatherInfo;
  forecast: ForecastDay[];
  presence: PresenceInfo;
  onOpenWeather(): void;
  onOpenPresence(): void;
}) {
  const today = forecast[0];
  const range = isNumber(today?.temperature)
    ? `${formatNumber(today.temperature)}°${
        isNumber(today.templow) ? ` / ${formatNumber(today.templow)}°` : ''
      }`
    : undefined;

  return (
    <div className="topline">
      <button type="button" className="weather" onClick={onOpenWeather} aria-label="Weer">
        <Icon name={weatherIcon(weather.condition)} size={24} />
        <span className="weather__temp">{formatTemp(weather.temperature, 1)}</span>
        {range && <span className="weather__meta">{range}</span>}
      </button>

      {presence.entityId && (
        <button
          type="button"
          className={`presence${presence.home ? ' presence--home' : ''}`}
          onClick={onOpenPresence}
          aria-label={presence.label}
        >
          <Icon name="person" size={16} />
          {presence.name}
          <span className="presence__dot" />
        </button>
      )}
    </div>
  );
}
