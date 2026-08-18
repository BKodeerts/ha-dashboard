import { formatNumber, formatTemp, isNumber, type AlarmInfo, type PersonInfo, type WeatherInfo } from '../ha/selectors';
import type { ForecastDay } from '../ha/types';
import { Icon } from '../ui/Icon';
import { weatherIcon } from '../ui/icons';
import { AlarmChip } from './AlarmChip';

/**
 * The first line of the home screen: the weather on the left, then the alarm
 * and whoever the user follows on the right.
 *
 * v3 halved the header by making presence a chip up here instead of a third
 * wrapping pill. v4 puts the alarm beside it for the same reason, which leaves
 * the pill row below with a single job — what is open.
 *
 * **The weather block does not shrink and the range does not clip.** It is the
 * reason the header was reshaped in the first place, so the slack lives in a
 * spacer between it and the chips: the chips give way, not the range. That is
 * also why two followed people is a cap rather than a preference — a third chip
 * would take exactly the space `23° / 17°` needs.
 *
 * The condition *word* lives in the weather sheet: at this size the icon beside
 * the reading says it, and the space buys today's range.
 */
export function TopLine({
  weather,
  forecast,
  alarm,
  alarmPickerOpen,
  onAlarmPickerChange,
  people,
  onOpenWeather,
  onOpenPerson,
}: {
  weather: WeatherInfo;
  forecast: ForecastDay[];
  alarm: AlarmInfo;
  alarmPickerOpen: boolean;
  onAlarmPickerChange(open: boolean): void;
  people: PersonInfo[];
  onOpenWeather(): void;
  onOpenPerson(entityId: string): void;
}) {
  const today = forecast[0];
  const range = isNumber(today?.temperature)
    ? `${formatNumber(today.temperature)}°${
        isNumber(today.templow) ? ` / ${formatNumber(today.templow)}°` : ''
      }`
    : undefined;

  // One chip keeps its name; two drop to glyph and dot, which is what lets both
  // sit beside the alarm without touching the weather range.
  const solo = people.length === 1;

  return (
    <div className="topline">
      <button type="button" className="weather" onClick={onOpenWeather} aria-label="Weer">
        <Icon name={weatherIcon(weather.condition)} size={24} />
        <span className="weather__temp">{formatTemp(weather.temperature, 1)}</span>
        {range && <span className="weather__meta">{range}</span>}
      </button>

      <span className="topline__slack" />

      <AlarmChip alarm={alarm} open={alarmPickerOpen} onOpenChange={onAlarmPickerChange} />

      {people.map((person) => (
        <button
          key={person.entityId}
          type="button"
          className={`presence${person.home ? ' presence--home' : ''}${
            solo ? ' presence--named' : ''
          }`}
          onClick={() => person.entityId && onOpenPerson(person.entityId)}
          aria-label={person.label}
        >
          <Icon name="person" size={16} />
          {solo && person.name}
          <span className="presence__dot" />
        </button>
      ))}
    </div>
  );
}
