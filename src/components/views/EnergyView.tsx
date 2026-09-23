import { useEffect, useMemo, useState } from 'react';
import { useHass } from '../../ha/HassProvider';
import {
  bucketPath,
  deriveConsumptionSeries,
  deviceColor,
  forecastBuckets,
  nowFraction,
} from '../../ha/energyChart';
import type { EnergyMeters } from '../../ha/energyPrefs';
import { fetchHourlyEnergy, solarRatios, type SolarRatios } from '../../ha/energyStats';
import { fetchDayBuckets } from '../../ha/history';
import { formatNumber, formatWatts, type PowerInfo, type PowerLoad } from '../../ha/selectors';
import { fetchSolarForecast } from '../../ha/solarForecast';
import { useLongPress } from '../../ui/useLongPress';

/**
 * Handoff: `design_handoff_ha_energy_tab/README.md`, reworked by v7
 * (`design_handoff_ha_dashboard_v7/README.md` §2). The solar/now card with
 * today's curve and two ratios computed from HA's own statistics, a
 * per-device trend card (one shared y-axis across all devices, so the lines
 * stay comparable — which one draws more should be readable at a glance),
 * and the "apparaten nu" list, which doubles as the trend chart's legend:
 * tapping a device picks its line out of the others.
 *
 * From 760px the list moves into a column of its own beside the two cards;
 * below that it follows them, directly under the chart it explains.
 */

const CHART_W = 280;
const CHART_H = 92;
const TREND_H = 44;
const HOUR_LABELS = ['00u', '06u', '12u', '18u', '24u'];

/**
 * Refetches every entity's today-so-far day-bucket series, at `fetchDayBuckets`'
 * own five-minute cache cadence — a mount never asks twice for the same hour.
 * Keyed by the joined id list rather than the array itself, which is a fresh
 * identity on every render.
 */
function useDayBuckets(entityIds: (string | undefined)[]): Map<string, (number | undefined)[]> {
  const { backend } = useHass();
  const key = entityIds.filter((id): id is string => id !== undefined).join('|');
  const [data, setData] = useState<Map<string, (number | undefined)[]>>(new Map());

  useEffect(() => {
    const ids = key ? key.split('|') : [];
    if (ids.length === 0) {
      setData(new Map());
      return;
    }
    let cancelled = false;
    const load = () => {
      Promise.all(ids.map((id) => fetchDayBuckets(backend, id))).then((results) => {
        if (cancelled) return;
        setData(new Map(ids.map((id, i) => [id, results[i]!])));
      });
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [backend, key]);

  return data;
}

/**
 * Today's solar production forecast, in Wh per wall-clock hour — see
 * `ha/solarForecast.ts`. Left as hours rather than day-buckets here: turning
 * it into buckets (`forecastBuckets`) needs the actual solar reading to
 * anchor the curve to, which only `SolarNowCard` has. A forecast integration
 * answers far less often than a power sensor updates, so this refetches
 * every half hour rather than `useDayBuckets`' five minutes. `undefined` — no
 * forecast source configured, or the call failed — draws no line at all
 * rather than a flat one.
 */
function useSolarForecast(configEntryIds: string[]): Record<string, number> | undefined {
  const { backend } = useHass();
  const key = configEntryIds.join('|');
  const [hours, setHours] = useState<Record<string, number> | undefined>(undefined);

  useEffect(() => {
    if (!key) {
      setHours(undefined);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchSolarForecast(backend, key.split('|')).then((whHours) => {
        if (cancelled) return;
        setHours(whHours);
      });
    };
    load();
    const interval = setInterval(load, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [backend, key]);

  return hours;
}

/**
 * Today's two solar ratios from HA's long-term statistics — see
 * `ha/energyStats.ts`. Refetched every five minutes like the day buckets;
 * keyed by the meter ids rather than the prefs object, which is a fresh
 * identity whenever the prefs are re-read.
 */
function useSolarRatios(meters: EnergyMeters | undefined): SolarRatios {
  const { backend } = useHass();
  const key = meters ? JSON.stringify(meters) : '';
  const [ratios, setRatios] = useState<SolarRatios>({});

  useEffect(() => {
    if (!key) {
      setRatios({});
      return;
    }
    const parsed = JSON.parse(key) as EnergyMeters;
    let cancelled = false;
    const load = () => {
      fetchHourlyEnergy(backend, parsed).then((hourly) => {
        if (!cancelled) setRatios(solarRatios(hourly));
      });
    };
    load();
    const interval = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [backend, key]);

  return ratios;
}

function RatioStat({
  value,
  label,
  sub,
  track,
}: {
  value: number;
  label: string;
  sub: string;
  track: 'grid' | 'export';
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="ratio">
      <div className="ratio__head">
        <span className="ratio__value">{pct}%</span>
        <span className="ratio__label mono">{label}</span>
      </div>
      <div className={`ratio__track ratio__track--${track}`}>
        <div className="ratio__fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ratio__sub mono">{sub}</span>
    </div>
  );
}

function SolarNowCard({
  power,
  solarEntity,
  consumptionEntity,
  gridEntity,
  solarForecastConfigEntries,
  meters,
}: {
  power: PowerInfo;
  solarEntity: string | undefined;
  consumptionEntity: string | undefined;
  gridEntity: string | undefined;
  solarForecastConfigEntries: string[];
  meters: EnergyMeters | undefined;
}) {
  const buckets = useDayBuckets([solarEntity, consumptionEntity, gridEntity]);
  const forecastHours = useSolarForecast(solarForecastConfigEntries);
  const solar = solarEntity ? (buckets.get(solarEntity) ?? []) : [];
  const grid = gridEntity ? (buckets.get(gridEntity) ?? []) : [];
  // Most households have no whole-home sensor of their own — see
  // powerInfo()'s same fallback for the live "huis" number — so the chart's
  // consumption line falls back to solar + grid import per hour.
  const consumption = consumptionEntity
    ? (buckets.get(consumptionEntity) ?? [])
    : deriveConsumptionSeries(solar, grid);

  const chart = useMemo(() => {
    // The forecast is anchored to solar's own last reading — not just its
    // own hourly average for this moment — so the dashed line picks up
    // exactly at the dot instead of jumping to wherever the forecast itself
    // expected production to be right now.
    const lastSolar = solar.reduce<number | undefined>((last, v) => v ?? last, undefined);
    const forecast = forecastHours ? forecastBuckets(forecastHours, solar.length, new Date(), lastSolar) : undefined;

    const max = Math.max(
      1,
      ...[...solar, ...consumption, ...(forecast ?? [])].filter((v): v is number => v !== undefined),
    );
    const solarPath = bucketPath(solar, { width: CHART_W, height: CHART_H, max });
    const consumptionPath = bucketPath(consumption, { width: CHART_W, height: CHART_H, max });
    const forecastPath = forecast ? bucketPath(forecast, { width: CHART_W, height: CHART_H, max }) : null;
    if (!solarPath.lastPoint) return null;
    const nowX = nowFraction() * CHART_W;
    return {
      max,
      solarArea: solarPath.area,
      solarLine: solarPath.line,
      consumptionLine: consumptionPath.line,
      forecastLine: forecastPath?.line,
      nowX,
      nowY: solarPath.lastPoint.y,
    };
  }, [solar, consumption, forecastHours]);

  const ratios = useSolarRatios(meters);
  const hasRatios = ratios.fromSolar !== undefined || ratios.selfUsed !== undefined;

  const net =
    power.net === undefined
      ? undefined
      : { exporting: power.net >= 0, watts: Math.abs(power.net) };

  const solarLongPress = useLongPress({ entityId: solarEntity });
  const consumptionLongPress = useLongPress({ entityId: consumptionEntity });

  return (
    <div className="solar-now">
      <div className="solar-now__head">
        <div
          onPointerDown={solarLongPress.onPointerDown}
          onPointerMove={solarLongPress.onPointerMove}
          onPointerUp={solarLongPress.onPointerUp}
          onPointerCancel={solarLongPress.onPointerCancel}
        >
          <div className="solar-now__label mono">Zon · nu</div>
          <div className="solar-now__value-row">
            <span className="solar-now__value">{formatNumber(power.solar)}</span>
            <span className="solar-now__unit mono">W</span>
          </div>
        </div>
        <div
          className="solar-now__stats mono"
          onPointerDown={consumptionLongPress.onPointerDown}
          onPointerMove={consumptionLongPress.onPointerMove}
          onPointerUp={consumptionLongPress.onPointerUp}
          onPointerCancel={consumptionLongPress.onPointerCancel}
        >
          <div className="solar-now__stat">
            <span className="solar-now__stat-value">{formatNumber(power.consumption)} W</span> huis
          </div>
          {net && (
            <div className="solar-now__stat">
              <span
                className={`solar-now__stat-value ${net.exporting ? 'solar-now__stat-value--export' : 'solar-now__stat-value--import'}`}
              >
                {formatNumber(net.watts)} W
              </span>{' '}
              {net.exporting ? 'naar net' : 'van net'}
            </div>
          )}
        </div>
      </div>

      {chart && (
        <div className="solar-now__chart">
          <div className="solar-now__scale mono" aria-hidden="true">
            0 – {formatWatts(chart.max)}
          </div>
          <svg
            viewBox={`0 0 ${CHART_W} ${CHART_H}`}
            className="solar-now__chart-svg"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path d={chart.solarArea} className="solar-now__chart-area" />
            {chart.consumptionLine && (
              <path d={chart.consumptionLine} className="solar-now__chart-consumption" />
            )}
            {chart.forecastLine && (
              <path d={chart.forecastLine} className="solar-now__chart-forecast" />
            )}
            <path d={chart.solarLine} className="solar-now__chart-solar" />
            <line
              x1={chart.nowX}
              x2={chart.nowX}
              y1={0}
              y2={CHART_H}
              className="solar-now__chart-nowline"
            />
            <circle cx={chart.nowX} cy={chart.nowY} r={2.6} className="solar-now__chart-dot" />
          </svg>
          <div className="solar-now__axis mono">
            {HOUR_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {hasRatios && (
        <div className="solar-now__ratios">
          {ratios.fromSolar !== undefined && (
            <RatioStat
              value={ratios.fromSolar}
              label="uit zon"
              sub="van je verbruik · vandaag"
              track="grid"
            />
          )}
          {ratios.selfUsed !== undefined && (
            <RatioStat
              value={ratios.selfUsed}
              label="zelf gebruikt"
              sub="van je zonnestroom · vandaag"
              track="export"
            />
          )}
        </div>
      )}
    </div>
  );
}

interface TrendLine {
  entityId: string;
  name: string;
  color: string;
  line: string;
  /** The day's highest bucket, in W, for the "piek" hint. */
  peak: number;
}

function DeviceTrendCard({
  lines,
  max,
  selected,
}: {
  lines: TrendLine[];
  max: number;
  selected: string | null;
}) {
  if (lines.length === 0) return null;

  const pick = selected ? lines.find((line) => line.entityId === selected) : undefined;
  // The picked line is drawn last so it sits on top of the others.
  const ordered = pick ? [...lines.filter((line) => line !== pick), pick] : lines;

  return (
    <div className="device-trend">
      <div className="device-trend__head mono">
        <span className="device-trend__label">Vandaag per apparaat</span>
        {pick ? (
          <span className="device-trend__hint" style={{ color: pick.color }}>
            {`${pick.name} · piek ${formatWatts(pick.peak)}`}
          </span>
        ) : (
          <span className="device-trend__hint">tik een apparaat</span>
        )}
      </div>
      <div className="device-trend__chart-wrap">
        <div className="device-trend__scale mono" aria-hidden="true">
          0 – {formatWatts(max)}
        </div>
        <svg
          viewBox={`0 0 ${CHART_W} ${TREND_H}`}
          className="device-trend__chart"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {ordered.map(
            (line) =>
              line.line && (
                <path
                  key={line.entityId}
                  d={line.line}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={line === pick ? 2.2 : 1.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={pick ? (line === pick ? 1 : 0.14) : 0.75}
                />
              ),
          )}
        </svg>
      </div>
    </div>
  );
}

/**
 * One "apparaten nu" row. A device with a trend line is the legend entry for
 * it: a tap picks the line out, a second tap clears it. Long-press opens
 * HA's more-info either way.
 */
function DeviceRow({
  load,
  color,
  selected,
  dimmed,
  onToggle,
}: {
  load: PowerLoad;
  /** Undefined for a device with no line on the chart — hollow dot, no tap. */
  color: string | undefined;
  selected: boolean;
  dimmed: boolean;
  onToggle(): void;
}) {
  const longPress = useLongPress({
    entityId: load.entityId,
    ...(color ? { onClick: onToggle } : {}),
  });
  const className = [
    'apparaten__row',
    color ? 'apparaten__row--tap' : '',
    selected ? 'apparaten__row--on' : '',
    dimmed ? 'apparaten__row--dim' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const face = (
    <>
      <span
        className={`apparaten__dot${color ? '' : ' apparaten__dot--hollow'}`}
        style={color ? { background: color } : undefined}
      />
      <span className="apparaten__name">{load.name}</span>
      <span className="apparaten__value mono">{`${formatNumber(load.watts)} W`}</span>
    </>
  );
  const handlers = {
    onPointerDown: longPress.onPointerDown,
    onPointerMove: longPress.onPointerMove,
    onPointerUp: longPress.onPointerUp,
    onPointerCancel: longPress.onPointerCancel,
    onClick: longPress.onClick,
  };

  return color ? (
    <button type="button" className={className} aria-pressed={selected} {...handlers}>
      {face}
    </button>
  ) : (
    <div className={className} {...handlers}>
      {face}
    </div>
  );
}

export function EnergyView({ power }: { power: PowerInfo }) {
  const { config, energyPrefs } = useHass();
  const [selected, setSelected] = useState<string | null>(null);

  const buckets = useDayBuckets(power.trend.map((load) => load.entityId));

  // One shared max across every device, not each line normalised to its own
  // — the point of putting them on one chart is comparing which device
  // actually draws more, and that's invisible if a 30 W device and a 4 kW
  // device are both stretched to fill the same height.
  const { lines, max } = useMemo(() => {
    const series = power.trend.map((load) =>
      (buckets.get(load.entityId) ?? []).filter((v): v is number => v !== undefined),
    );
    const max = Math.max(1, ...series.flat());
    const lines: TrendLine[] = power.trend.map((load, index) => ({
      entityId: load.entityId,
      name: load.name,
      color: deviceColor(index),
      line: bucketPath(buckets.get(load.entityId) ?? [], {
        width: CHART_W,
        height: TREND_H,
        max,
        pad: 2,
      }).line,
      peak: Math.max(0, ...series[index]!),
    }));
    return { lines, max };
  }, [power.trend, buckets]);

  const colorOf = useMemo(
    () => new Map(lines.map((line) => [line.entityId, line.color])),
    [lines],
  );

  // The list is the chart's legend, so every tracked device is on it — an
  // idle one at 0 W included, or its line would have no name — plus
  // whatever else is drawing power right now. Biggest first.
  const rows = useMemo(() => {
    const extra = power.loads.filter((load) => !colorOf.has(load.entityId));
    return [...power.trend, ...extra].sort((a, b) => b.watts - a.watts);
  }, [power.trend, power.loads, colorOf]);

  // A selection whose device has since left the chart clears itself.
  const active = selected && colorOf.has(selected) ? selected : null;
  const toggle = (entityId: string) =>
    setSelected((current) => (current === entityId ? null : entityId));

  return (
    <div className="view view--energy">
      <div className="energy">
        <div className="energy__main">
          <SolarNowCard
            power={power}
            solarEntity={config.power.solar}
            consumptionEntity={config.power.consumption}
            gridEntity={config.power.grid}
            solarForecastConfigEntries={energyPrefs?.solarForecastConfigEntries ?? []}
            meters={energyPrefs?.meters}
          />

          <DeviceTrendCard lines={lines} max={max} selected={active} />
        </div>

        {rows.length > 0 && (
          <div className="apparaten">
            <div className="apparaten__label mono">Apparaten nu</div>
            {rows.map((load) => (
              <DeviceRow
                key={load.entityId}
                load={load}
                color={colorOf.get(load.entityId)}
                selected={active === load.entityId}
                dimmed={active !== null && active !== load.entityId}
                onToggle={() => toggle(load.entityId)}
              />
            ))}
            {power.unmeasured !== undefined && (
              <div
                className={`apparaten__row apparaten__row--other${active ? ' apparaten__row--dim' : ''}`}
              >
                <span className="apparaten__dot apparaten__dot--hollow" />
                <span className="apparaten__name">overige (niet gemeten)</span>
                <span className="apparaten__value mono">{`${formatNumber(power.unmeasured)} W`}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
