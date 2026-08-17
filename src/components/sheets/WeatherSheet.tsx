import { useHass } from '../../ha/HassProvider';
import { formatNumber, formatPlain, type WeatherInfo } from '../../ha/selectors';
import type { ForecastDay } from '../../ha/types';
import { Icon } from '../../ui/Icon';
import { WEATHER_LABELS, weatherIcon } from '../../ui/icons';
import { LovelaceCard } from '../LovelaceCard';
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
  const { config } = useHass();
  const today = forecast[0];

  const line1 = [
    WEATHER_LABELS[weather.condition] ?? weather.condition,
    today?.temperature !== undefined
      ? `${formatNumber(today.temperature)}°${
          today.templow !== undefined ? ` / ${formatNumber(today.templow)}°` : ''
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const line2 = [
    weather.pressure !== undefined ? `${formatPlain(weather.pressure)} ${weather.pressureUnit}` : null,
    weather.windSpeed !== undefined
      ? `${formatNumber(weather.windSpeed)} ${weather.windUnit}${
          weather.windBearing ? ` ${weather.windBearing}` : ''
        }`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const forecastConfig =
    config.lovelace.forecast ??
    (weather.entityId
      ? { type: 'weather-forecast', entity: weather.entityId, forecast_type: 'daily' }
      : undefined);

  return (
    <Sheet onClose={onClose} labelledBy="weather-sheet-title" wideGap>
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
        <span className="weather__temp">
          {weather.temperature === undefined ? '—' : `${formatNumber(weather.temperature, 1)}°`}
        </span>
        <div className="weather__meta">
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
                <span className="forecast__high">{`${formatNumber(day.temperature)}°`}</span>
              </div>
              <div className="forecast__low">
                {day.templow === undefined ? '' : `${formatNumber(day.templow)}°`}
              </div>
            </div>
          ))}
        </div>
      )}

      <LovelaceCard
        config={forecastConfig}
        fallback={`${weather.entityId ?? 'weather'} · lovelace forecast-kaart hier`}
      />
    </Sheet>
  );
}
