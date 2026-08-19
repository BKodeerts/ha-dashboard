import {
  formatNumber,
  formatPlain,
  formatTemp,
  isNumber,
  type WeatherInfo,
} from '../../ha/selectors';
import type { ForecastDay } from '../../ha/types';
import { Icon } from '../../ui/Icon';
import { WEATHER_LABELS, weatherIcon } from '../../ui/icons';
import { Sheet, SheetClose } from '../Sheet';

const dayCode = (datetime: string): string => {
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nl-BE', { weekday: 'short' }).replace('.', '').toUpperCase();
};

export function WeatherSheet({
  weather,
  forecast,
  onClose,
}: {
  weather: WeatherInfo;
  forecast: ForecastDay[];
  onClose(): void;
}) {
  const today = forecast[0];

  const line1 = [
    WEATHER_LABELS[weather.condition] ?? weather.condition,
    isNumber(today?.temperature)
      ? `${formatNumber(today.temperature)}°${
          isNumber(today.templow) ? ` / ${formatNumber(today.templow)}°` : ''
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const line2 = [
    isNumber(weather.pressure) ? `${formatPlain(weather.pressure)} ${weather.pressureUnit}` : null,
    isNumber(weather.windSpeed)
      ? `${formatNumber(weather.windSpeed)} ${weather.windUnit}${
          weather.windBearing ? ` ${weather.windBearing}` : ''
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet onClose={onClose} labelledBy="weather-sheet-title">
      <div className="sheet__head">
        <div className="sheet__tile">
          <Icon name={weatherIcon(weather.condition)} size={19} />
        </div>
        <div className="sheet__title sheet__titles" id="weather-sheet-title">
          {weather.name}
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <div className="weather__now">
        <span className="weather__big">
          {formatTemp(weather.temperature, 1)}
        </span>
        <div className="weather__lines">
          {line1 && <span>{line1}</span>}
          {line2 && <span>{line2}</span>}
        </div>
      </div>

      {forecast.length > 0 && (
        <div className="forecast">
          {forecast.slice(0, 4).map((day) => (
            <div className="forecast__day" key={day.datetime}>
              <div className="forecast__code">{dayCode(day.datetime)}</div>
              <div className="forecast__row">
                <Icon name={weatherIcon(day.condition)} size={16} />
                <span className="forecast__high">{formatTemp(day.temperature)}</span>
              </div>
              <div className="forecast__low">
                {isNumber(day.templow) ? `${formatNumber(day.templow)}°` : ''}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
