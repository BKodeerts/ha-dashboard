import type { OpeningsSummary } from '../ha/selectors';
import { formatFullDate, formatNumber, formatTemp, isNumber, type AlarmInfo, type PersonInfo, type WeatherInfo } from '../ha/selectors';
import type { ForecastDay } from '../ha/types';
import type { Tab } from './TabBar';
import { Icon } from '../ui/Icon';
import { weatherIcon, WEATHER_LABELS } from '../ui/icons';
import { AlarmChip } from './AlarmChip';

/**
 * The header, v5 ("Adem"). It persists across every tab — home and Stroom
 * both read the date, the weather and the three round buttons as
 * screen-level, not home-only — and it is the one part of the screen that
 * never scrolls: everything below it (the room grid, the power tab's body)
 * fills whatever height is left.
 *
 * Three rows, each free to breathe where v4 packed them into one:
 * 1. Date, then three 36px round buttons — settings, alarm, account. The
 *    alarm keeps its v4 picker; the account button opens the first tracked
 *    person's sheet, the same destination the old presence chips opened.
 * 2. The weather block on its own — the reading stays the tap target for
 *    the weather sheet, now with room to be the size it always deserved.
 * 3. The section label, plus the open-windows chip when — and only when —
 *    something in the house is open. Hidden entirely on the power tab.
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
  onOpenSettings,
  tab,
  openings,
  onOpenOpenings,
}: {
  weather: WeatherInfo;
  forecast: ForecastDay[];
  alarm: AlarmInfo;
  alarmPickerOpen: boolean;
  onAlarmPickerChange(open: boolean): void;
  people: PersonInfo[];
  onOpenWeather(): void;
  onOpenPerson(entityId: string): void;
  onOpenSettings(): void;
  tab: Tab;
  openings: OpeningsSummary;
  onOpenOpenings(): void;
}) {
  const today = forecast[0];
  const range = isNumber(today?.temperature)
    ? `${formatNumber(today.temperature)}°${
        isNumber(today.templow) ? ` / ${formatNumber(today.templow)}°` : ''
      }`
    : undefined;

  const account = people[0];
  const openCount = openings.open.length;

  const onHome = tab === 'home';
  // The section row is shared screen furniture, but its label only means
  // something on the two tabs this revision covers — Netwerk, Auto and
  // Instellingen print their own titles further down and leave this row
  // blank rather than borrowing a label that isn't theirs.
  const sectionLabel = onHome ? 'Kamers' : tab === 'energie' ? 'Nu' : undefined;
  const chipVisible = onHome && openCount > 0;

  return (
    <div className="header">
      <div className="header__top">
        <span className="header__date mono">{formatFullDate(new Date())}</span>

        <div className="header__buttons">
          <button
            type="button"
            className="header__btn"
            onClick={onOpenSettings}
            aria-label="Instellingen"
          >
            <Icon name="cog" size={17} />
          </button>

          <AlarmChip alarm={alarm} open={alarmPickerOpen} onOpenChange={onAlarmPickerChange} />

          <button
            type="button"
            className="header__btn"
            onClick={() => account?.entityId && onOpenPerson(account.entityId)}
            aria-label={account?.label ?? 'Aanwezigheid'}
          >
            <Icon name="person" size={17} />
          </button>
        </div>
      </div>

      <button type="button" className="header__weather" onClick={onOpenWeather} aria-label="Weer">
        <div className="header__weather-readings">
          <span className="header__temp">{formatTemp(weather.temperature, 1)}</span>
          {(range || weather.condition) && (
            <span className="header__weather-meta mono">
              {[range, weather.condition && WEATHER_LABELS[weather.condition]]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
        <Icon name={weatherIcon(weather.condition)} size={96} className="header__weather-icon" />
      </button>

      <div className="header__section">
        {sectionLabel && <span className="header__section-label mono">{sectionLabel}</span>}

        {chipVisible && (
          <button type="button" className="window-chip" onClick={onOpenOpenings}>
            <Icon name="window" size={17} className="window-chip__icon" />
            {openCount === 1 ? '1 raam open' : `${openCount} ramen open`}
            <Icon name="chevronRight" size={15} className="window-chip__chevron" />
          </button>
        )}
      </div>
    </div>
  );
}
