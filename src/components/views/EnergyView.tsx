import { useEffect, useMemo, useState } from 'react';
import { useHass } from '../../ha/HassProvider';
import {
  bucketPath,
  deriveConsumptionSeries,
  deviceColor,
  nowFraction,
  selfConsumptionRatio,
} from '../../ha/energyChart';
import { fetchDayBuckets } from '../../ha/history';
import { formatNumber, type PowerInfo } from '../../ha/selectors';
import { Icon } from '../../ui/Icon';
import { useLongPress } from '../../ui/useLongPress';

/**
 * Handoff: `design_handoff_ha_energy_tab/README.md`. Three stacked cards —
 * solar/now with today's curve and the self-consumption ratio, a per-device
 * trend card (small multiples, each line normalised to its own daily max),
 * and the plain "apparaten nu" list the v5 tab already had.
 */

const CHART_W = 280;
const CHART_H = 92;
const TREND_H = 44;
const HOUR_LABELS = ['00u', '06u', '12u', '18u', '24u'];

/**
 * Refetches every entity's today-so-far hourly buckets, at `fetchDayBuckets`'
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

function SolarNowCard({
  power,
  solarEntity,
  consumptionEntity,
  gridEntity,
}: {
  power: PowerInfo;
  solarEntity: string | undefined;
  consumptionEntity: string | undefined;
  gridEntity: string | undefined;
}) {
  const buckets = useDayBuckets([solarEntity, consumptionEntity, gridEntity]);
  const solar = solarEntity ? (buckets.get(solarEntity) ?? []) : [];
  const grid = gridEntity ? (buckets.get(gridEntity) ?? []) : [];
  // Most households have no whole-home sensor of their own — see
  // powerInfo()'s same fallback for the live "huis" number — so the chart's
  // consumption line falls back to solar + grid import per hour.
  const consumption = consumptionEntity
    ? (buckets.get(consumptionEntity) ?? [])
    : deriveConsumptionSeries(solar, grid);

  const chart = useMemo(() => {
    const max = Math.max(
      1,
      ...[...solar, ...consumption].filter((v): v is number => v !== undefined),
    );
    const solarPath = bucketPath(solar, { width: CHART_W, height: CHART_H, max });
    const consumptionPath = bucketPath(consumption, { width: CHART_W, height: CHART_H, max });
    if (!solarPath.lastPoint) return null;
    const nowX = nowFraction() * CHART_W;
    return {
      solarArea: solarPath.area,
      solarLine: solarPath.line,
      consumptionLine: consumptionPath.line,
      nowX,
      nowY: solarPath.lastPoint.y,
    };
  }, [solar, consumption]);

  const ratio = useMemo(() => selfConsumptionRatio(solar, consumption), [solar, consumption]);

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

      {ratio !== undefined && (
        <div className="solar-now__ratio">
          <div className="solar-now__ratio-track">
            <div
              className="solar-now__ratio-fill"
              style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` }}
            />
          </div>
          <span className="solar-now__ratio-label mono">
            {Math.round(ratio * 100)}% eigen verbruik
          </span>
        </div>
      )}
    </div>
  );
}

function DeviceTrendCard({ loads }: { loads: PowerInfo['loads'] }) {
  const buckets = useDayBuckets(loads.map((load) => load.entityId));

  const lines = useMemo(
    () =>
      loads.map((load, index) => {
        const values = buckets.get(load.entityId) ?? [];
        const max = Math.max(1, ...values.filter((v): v is number => v !== undefined));
        return {
          entityId: load.entityId,
          name: load.name,
          color: deviceColor(index),
          line: bucketPath(values, { width: CHART_W, height: TREND_H, max, pad: 2 }).line,
        };
      }),
    [loads, buckets],
  );

  if (loads.length === 0) return null;

  return (
    <div className="device-trend">
      <div className="device-trend__legend">
        {lines.map((line) => (
          <span className="device-trend__legend-item mono" key={line.entityId}>
            <span className="device-trend__dot" style={{ background: line.color }} />
            {line.name}
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${CHART_W} ${TREND_H}`}
        className="device-trend__chart"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {lines.map(
          (line) =>
            line.line && (
              <path
                key={line.entityId}
                d={line.line}
                fill="none"
                stroke={line.color}
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ),
        )}
      </svg>
    </div>
  );
}

function LoadRow({ load }: { load: PowerInfo['loads'][number] }) {
  const longPress = useLongPress({ entityId: load.entityId });
  return (
    <div
      className="apparaten__row"
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
    >
      <Icon name="power" size={18} className="apparaten__icon" />
      <span className="apparaten__name">{load.name}</span>
      <span className="apparaten__value mono">{`${formatNumber(load.watts)} W`}</span>
    </div>
  );
}

export function EnergyView({ power }: { power: PowerInfo }) {
  const { config } = useHass();

  return (
    <div className="view view--energy">
      <SolarNowCard
        power={power}
        solarEntity={config.power.solar}
        consumptionEntity={config.power.consumption}
        gridEntity={config.power.grid}
      />

      <DeviceTrendCard loads={power.loads} />

      {power.loads.length > 0 && (
        <div className="apparaten">
          <div className="apparaten__label mono">Apparaten nu</div>
          {power.loads.map((load) => (
            <LoadRow key={load.entityId} load={load} />
          ))}
        </div>
      )}
    </div>
  );
}
