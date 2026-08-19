import { useEffect, useMemo, useState } from 'react';
import {
  WEATHER_FEATURE,
  formatNumber,
  formatPlain,
  formatTemp,
  formatTime,
  isNumber,
  type WeatherInfo,
} from '../../ha/selectors';
import type { ForecastEntry } from '../../ha/types';
import { useForecast } from '../../ha/useForecast';
import { Icon } from '../../ui/Icon';
import { WEATHER_LABELS, weatherIcon } from '../../ui/icons';
import { Sheet, SheetClose } from '../Sheet';

type View = 'dag' | 'week';

const dayCode = (datetime: string): string => {
  const date = new Date(datetime);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('nl-BE', { weekday: 'short' }).replace('.', '').toUpperCase();
};

const dayName = (datetime: string): string => {
  const date = new Date(datetime);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('nl-BE', { weekday: 'long' });
};

const hourTickLabel = (datetime: string): string => {
  const date = new Date(datetime);
  return Number.isNaN(date.getTime()) ? '' : `${String(date.getHours()).padStart(2, '0')}u`;
};

/** Dutch qualitative word for a UV index, as the metrics tile prints it. */
function uvLabel(index: number): string {
  if (index < 3) return 'laag';
  if (index < 6) return 'matig';
  if (index < 8) return 'hoog';
  if (index < 11) return 'zeer hoog';
  return 'extreem';
}

/* ── Vandaag chart ────────────────────────────────────────────────────────
   Geometry lifted straight from the handoff: a 350x138 viewBox, temperature
   line + area, a dashed apparent-temperature line, precipitation bars and a
   "now" marker — all scaled to whatever hourly forecast the entity gives. */

const CHART_W = 350;
const CHART_H = 138;
const X0 = 30;
const X1 = 344;
const T_TOP = 8;
const T_BOT = 88;
const RAIN_BASE = 122;
const RAIN_MAX_H = 32;
const BAR_W = 10;

interface ChartData {
  tempPath: string;
  areaPath: string;
  appPath: string | null;
  rainPath: string;
  gridPath: string;
  nowPath: string;
  nowX: number;
  nowY: number;
  gridLabels: { y: number; label: string }[];
  ticks: { x: number; label: string }[];
}

/** Picks a gridline step (1/2/5/10/20°) that leaves a handful of lines across the domain. */
function niceStep(range: number): number {
  for (const step of [1, 2, 5, 10, 20]) {
    if (range / step <= 5) return step;
  }
  return 50;
}

function buildChart(hourly: ForecastEntry[]): ChartData | null {
  const n = hourly.length;
  if (n < 2) return null;
  const first = hourly[0];
  if (!first) return null;

  const x = (i: number) => X0 + (i * (X1 - X0)) / (n - 1);

  const tempValues = hourly.map((h) => h.temperature);
  const temps = tempValues.filter(isNumber);
  if (temps.length < 2) return null;

  const rawMin = Math.min(...temps);
  const rawMax = Math.max(...temps);
  const pad = Math.max(1, (rawMax - rawMin) * 0.2);
  const tMin = Math.floor(rawMin - pad);
  const tMax = Math.max(tMin + 4, Math.ceil(rawMax + pad));
  const y = (t: number) => T_BOT - ((t - tMin) / (tMax - tMin)) * (T_BOT - T_TOP);

  // Draws a broken line across whatever contiguous runs of real numbers exist,
  // rather than treating a missing hour as zero.
  const linePath = (values: (number | undefined)[]): string => {
    let path = '';
    let open = false;
    values.forEach((value, i) => {
      if (!isNumber(value)) {
        open = false;
        return;
      }
      path += `${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)} `;
      open = true;
    });
    return path.trim();
  };

  const tempPath = linePath(tempValues);
  const firstTempIdx = tempValues.findIndex(isNumber);
  let lastTempIdx = -1;
  tempValues.forEach((v, i) => {
    if (isNumber(v)) lastTempIdx = i;
  });
  const areaPath =
    firstTempIdx >= 0 && lastTempIdx >= 0
      ? `${tempPath} L${x(lastTempIdx).toFixed(1)} ${T_BOT} L${x(firstTempIdx).toFixed(1)} ${T_BOT} Z`
      : '';

  const appValues = hourly.map((h) => h.apparent_temperature);
  const appPath = appValues.some(isNumber) ? linePath(appValues) : null;

  const precipValues = hourly.map((h) => (isNumber(h.precipitation) ? h.precipitation : 0));
  const maxMm = Math.max(1, ...precipValues);
  let rainPath = '';
  hourly.forEach((h, i) => {
    if (!isNumber(h.precipitation) || h.precipitation <= 0) return;
    const barH = (h.precipitation / maxMm) * RAIN_MAX_H;
    const cx = x(i);
    rainPath += `M${(cx - BAR_W / 2).toFixed(1)} ${(RAIN_BASE - barH).toFixed(1)} h${BAR_W} v${barH.toFixed(1)} h-${BAR_W} Z `;
  });

  const step = niceStep(tMax - tMin);
  const gridTemps: number[] = [];
  for (let t = Math.ceil(tMin / step) * step; t < tMax; t += step) {
    if (t > tMin) gridTemps.push(t);
  }
  const gridPath =
    gridTemps.map((t) => `M${X0} ${y(t).toFixed(1)} H${X1}`).join(' ') + ` M${X0} ${RAIN_BASE} H${X1}`;
  const gridLabels = gridTemps.map((t) => ({ y: y(t), label: `${formatNumber(t)}°` }));

  const nowX = x(0);
  const nowY = isNumber(first.temperature) ? y(first.temperature) : y(tMin);
  const nowPath = `M${nowX.toFixed(1)} ${T_TOP} V${RAIN_BASE}`;

  const tickEvery = Math.max(1, Math.round(n / 8));
  const ticks: { x: number; label: string }[] = [];
  hourly.forEach((entry, i) => {
    if (i % tickEvery !== 0) return;
    ticks.push({ x: x(i), label: hourTickLabel(entry.datetime) });
  });

  return { tempPath, areaPath, appPath, rainPath, gridPath, nowPath, nowX, nowY, gridLabels, ticks };
}

/* ── Vandaag metrics grid ────────────────────────────────────────────────
   Current conditions, straight off the entity's own state + attributes —
   the forecast array plays no part here. */

function metricRows(weather: WeatherInfo): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [];
  if (isNumber(weather.apparentTemperature)) {
    rows.push({ key: 'voelt als', value: formatTemp(weather.apparentTemperature, 1) });
  }
  if (isNumber(weather.dewPoint)) {
    rows.push({ key: 'dauwpunt', value: formatTemp(weather.dewPoint, 1) });
  }
  if (isNumber(weather.humidity)) {
    rows.push({ key: 'vochtigheid', value: `${formatNumber(weather.humidity)} %` });
  }
  if (isNumber(weather.windSpeed)) {
    rows.push({
      key: 'wind',
      value: `${formatNumber(weather.windSpeed)} ${weather.windUnit}${
        weather.windBearing ? ` ${weather.windBearing}` : ''
      }`,
    });
  }
  if (isNumber(weather.windGustSpeed)) {
    rows.push({ key: 'windstoten', value: `${formatNumber(weather.windGustSpeed)} ${weather.windUnit}` });
  }
  if (isNumber(weather.pressure)) {
    rows.push({ key: 'druk', value: `${formatPlain(weather.pressure)} ${weather.pressureUnit}` });
  }
  if (isNumber(weather.uvIndex)) {
    rows.push({ key: 'uv-index', value: `${formatNumber(weather.uvIndex)} · ${uvLabel(weather.uvIndex)}` });
  }
  if (isNumber(weather.cloudCoverage)) {
    rows.push({ key: 'bewolking', value: `${formatNumber(weather.cloudCoverage)} %` });
  }
  if (isNumber(weather.visibility)) {
    rows.push({ key: 'zicht', value: `${formatNumber(weather.visibility)} ${weather.visibilityUnit}` });
  }
  return rows;
}

function DayView({ hourly, weather }: { hourly: ForecastEntry[]; weather: WeatherInfo }) {
  const chart = useMemo(() => buildChart(hourly), [hourly]);
  const metrics = metricRows(weather);

  return (
    <div className="weather__day">
      {chart ? (
        <>
          <div className="weather__legend mono">
            <span className="weather__legend-item">
              <span className="weather__legend-swatch weather__legend-swatch--temp" />
              temperatuur
            </span>
            {chart.appPath && (
              <span className="weather__legend-item">
                <span className="weather__legend-swatch weather__legend-swatch--app" />
                voelt als
              </span>
            )}
            {chart.rainPath && (
              <span className="weather__legend-item">
                <span className="weather__legend-swatch weather__legend-swatch--rain" />
                neerslag mm
              </span>
            )}
          </div>

          <div className="weather__chart">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="weather__chart-svg" aria-hidden="true">
              <path d={chart.gridPath} className="weather__chart-grid" />
              <path d={chart.rainPath} className="weather__chart-rain" />
              <path d={chart.nowPath} className="weather__chart-nowline" />
              {chart.appPath && <path d={chart.appPath} className="weather__chart-app" />}
              {chart.areaPath && <path d={chart.areaPath} className="weather__chart-area" />}
              <path d={chart.tempPath} className="weather__chart-temp" />
              <circle cx={chart.nowX} cy={chart.nowY} r={4} className="weather__chart-dot" />
            </svg>
            {chart.gridLabels.map((label) => (
              <div
                key={label.label}
                className="weather__chart-axis mono"
                style={{ top: `${(label.y / CHART_H) * 100}%` }}
              >
                {label.label}
              </div>
            ))}
          </div>

          <div className="weather__chart-ticks">
            {chart.ticks.map((tick) => (
              <span
                key={tick.x}
                className="weather__chart-tick mono"
                style={{ left: `${(tick.x / CHART_W) * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div className="weather__empty">Geen uurvoorspelling beschikbaar.</div>
      )}

      {metrics.length > 0 && (
        <div className="weather__metrics">
          {metrics.map((metric) => (
            <div className="weather__metric" key={metric.key}>
              <span className="weather__metric-key mono">{metric.key}</span>
              <span className="weather__metric-value">{metric.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Week ─────────────────────────────────────────────────────────────── */

function WeekView({ daily }: { daily: ForecastEntry[] }) {
  const week = daily.slice(0, 7);
  if (week.length === 0) {
    return <div className="weather__empty">Geen dagvoorspelling beschikbaar.</div>;
  }

  const lows = week.map((d) => d.templow).filter(isNumber);
  const highs = week.map((d) => d.temperature).filter(isNumber);
  const hasRange = lows.length > 0 && highs.length > 0;
  const scaleMin = hasRange ? Math.min(...lows) - 1 : 0;
  const scaleMax = hasRange ? Math.max(...highs) + 1 : 1;
  const span = Math.max(1, scaleMax - scaleMin);

  let wettest: ForecastEntry | undefined;
  let warmest: ForecastEntry | undefined;
  for (const day of week) {
    if (isNumber(day.precipitation)) {
      if (!wettest || !isNumber(wettest.precipitation) || day.precipitation > wettest.precipitation) {
        wettest = day;
      }
    }
    if (isNumber(day.temperature)) {
      if (!warmest || !isNumber(warmest.temperature) || day.temperature > warmest.temperature) {
        warmest = day;
      }
    }
  }

  const chips: { key: string; value: string }[] = [];
  if (wettest && isNumber(wettest.precipitation) && wettest.precipitation > 0) {
    chips.push({ key: 'natste dag', value: `${dayName(wettest.datetime)} · ${formatNumber(wettest.precipitation, 1)} mm` });
  }
  if (warmest && isNumber(warmest.temperature)) {
    chips.push({ key: 'warmste dag', value: `${dayName(warmest.datetime)} · ${formatTemp(warmest.temperature)}` });
  }

  return (
    <div className="weather__week">
      {hasRange && (
        <div className="weather__week-head mono">
          <span className="weather__week-col-day">dag</span>
          <span className="weather__week-col-icon" />
          <span className="weather__week-col-scale">
            {formatNumber(scaleMin)}° — {formatNumber(scaleMax)}°
          </span>
          <span className="weather__week-col-rain">neerslag</span>
        </div>
      )}

      {week.map((day, i) => {
        const lowPct = hasRange && isNumber(day.templow) ? ((day.templow - scaleMin) / span) * 100 : 0;
        const highPct = hasRange && isNumber(day.temperature) ? ((day.temperature - scaleMin) / span) * 100 : lowPct;
        const rainHot = isNumber(day.precipitation_probability) && day.precipitation_probability >= 60;
        const rain =
          isNumber(day.precipitation) && day.precipitation > 0
            ? `${isNumber(day.precipitation_probability) ? `${formatNumber(day.precipitation_probability)} % · ` : ''}${formatNumber(day.precipitation, 1)} mm`
            : '—';

        return (
          <div className="weather__week-row" key={day.datetime}>
            <span className={`weather__week-day mono${i === 0 ? ' weather__week-day--today' : ''}`}>
              {dayCode(day.datetime)}
            </span>
            <Icon name={weatherIcon(day.condition)} size={20} className="weather__week-icon" />
            <span className="weather__week-low mono">{isNumber(day.templow) ? `${formatNumber(day.templow)}°` : '—'}</span>
            <div className="weather__week-track">
              {hasRange && (
                <div
                  className="weather__week-range"
                  style={{
                    left: `${Math.max(0, Math.min(100, lowPct))}%`,
                    width: `${Math.max(0, Math.min(100, highPct - lowPct))}%`,
                  }}
                />
              )}
            </div>
            <span className="weather__week-high">{isNumber(day.temperature) ? `${formatNumber(day.temperature)}°` : '—'}</span>
            <span className={`weather__week-rain mono${rainHot ? ' weather__week-rain--hot' : ''}`}>{rain}</span>
          </div>
        );
      })}

      {chips.length > 0 && (
        <div className="weather__chips">
          {chips.map((chip) => (
            <div className="weather__chip" key={chip.key}>
              <span className="weather__chip-key mono">{chip.key}</span>
              <span className="weather__chip-value">{chip.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── sheet ────────────────────────────────────────────────────────────── */

export function WeatherSheet({
  weather,
  forecast,
  onClose,
}: {
  weather: WeatherInfo;
  forecast: ForecastEntry[];
  onClose(): void;
}) {
  const hourlySupported = (weather.supportedFeatures & WEATHER_FEATURE.FORECAST_HOURLY) !== 0;
  const hourly = useForecast(hourlySupported ? weather.entityId : undefined, 'hourly');
  const [view, setView] = useState<View>(hourlySupported ? 'dag' : 'week');

  // The tab defaults to `dag`, but an entity that turns out not to support
  // hourly forecasts (or one swapped in after mount) must not leave the sheet
  // stuck on an empty tab that isn't even shown any more.
  useEffect(() => {
    if (!hourlySupported) setView('week');
  }, [hourlySupported]);

  const activeView: View = hourlySupported ? view : 'week';
  const today = forecast[0];

  const subtitle = weather.entityId
    ? `${weather.entityId}${
        weather.lastUpdated ? ` · bijgewerkt ${formatTime(new Date(weather.lastUpdated))}` : ''
      }`
    : undefined;

  const feelsLine =
    [
      isNumber(weather.apparentTemperature) ? `voelt als ${formatTemp(weather.apparentTemperature, 1)}` : null,
      isNumber(weather.humidity) ? `${formatNumber(weather.humidity)} % rv` : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined;

  const hiLo = isNumber(today?.temperature)
    ? `${formatNumber(today.temperature)}° / ${isNumber(today?.templow) ? formatNumber(today.templow) : '—'}°`
    : undefined;

  const rainNote = useMemo(() => {
    const entry = hourly.find((h) => isNumber(h.precipitation) && h.precipitation > 0);
    if (!entry) return undefined;
    const date = new Date(entry.datetime);
    return Number.isNaN(date.getTime()) ? undefined : `regen vanaf ${date.getHours()} u`;
  }, [hourly]);

  return (
    <Sheet onClose={onClose} labelledBy="weather-sheet-title">
      <div className="sheet__head">
        <div className="sheet__tile">
          <Icon name={weatherIcon(weather.condition)} size={19} />
        </div>
        <div className="sheet__titles">
          <div className="sheet__title" id="weather-sheet-title">
            {weather.name}
          </div>
          {subtitle && <div className="weather__meta mono">{subtitle}</div>}
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <div className="weather__now">
        <span className="weather__big">{formatTemp(weather.temperature, 1)}</span>
        <div className="weather__now-mid">
          <span className="weather__condition">{WEATHER_LABELS[weather.condition] ?? weather.condition}</span>
          {feelsLine && <span className="weather__feels mono">{feelsLine}</span>}
        </div>
        <div className="weather__now-side">
          {hiLo && <span className="weather__hilo">{hiLo}</span>}
          {rainNote && <span className="weather__rainnote mono">{rainNote}</span>}
        </div>
      </div>

      {hourlySupported && (
        <div className="weather__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'dag'}
            className={`weather__tab${view === 'dag' ? ' weather__tab--on' : ''}`}
            onClick={() => setView('dag')}
          >
            Vandaag
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'week'}
            className={`weather__tab${view === 'week' ? ' weather__tab--on' : ''}`}
            onClick={() => setView('week')}
          >
            Week
          </button>
        </div>
      )}

      {activeView === 'dag' ? <DayView hourly={hourly} weather={weather} /> : <WeekView daily={forecast} />}

      <div className="sheet__footnote">
        {activeView === 'week' ? 'forecast_daily · 7 dagen' : 'forecast_hourly · 24 uur'}
      </div>
    </Sheet>
  );
}
