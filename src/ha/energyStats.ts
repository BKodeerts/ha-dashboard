import type { EnergyMeters } from './energyPrefs';
import type { HaBackend } from './types';

/**
 * Today's two solar ratios on the Energie tab, computed from Home Assistant's
 * own long-term statistics — the same kWh meters, the same hourly buckets and
 * the same arithmetic as HA's Energy dashboard gauges, so the two never
 * disagree. See design_handoff_ha_dashboard_v7/README.md §2.
 *
 * The v6 tab showed one "eigen verbruik" figure computed from estimated power
 * buckets, and it was misnamed: `Σ min(solar, consumption) ÷ Σ consumption`
 * is *self-sufficiency*, not self-consumption. These are the two, named for
 * what they are:
 *
 * - **uit zon** — how much of what the house used came from its own panels
 *   (HA's "self-sufficiency" gauge): `1 − import ÷ consumption`.
 * - **zelf gebruikt** — how much of what the panels made the house used
 *   itself (HA's "solar consumed" gauge): without a battery,
 *   `(solar − export) ÷ solar`, worked out hour by hour.
 */
export interface SolarRatios {
  /** 0–1, or undefined when a meter it needs is missing or there is no solar yet. */
  fromSolar?: number;
  /** 0–1, likewise. */
  selfUsed?: number;
}

type Role = keyof EnergyMeters;
const ROLES: Role[] = ['solar', 'fromGrid', 'toGrid', 'toBattery', 'fromBattery'];

interface StatRow {
  start: number | string;
  change?: number | null;
}

/** kWh per role, per hourly bucket start. A role with no configured meter is absent. */
type Hourly = Partial<Record<Role, Map<number, number>>>;

const bucketStart = (start: number | string): number =>
  typeof start === 'number' ? start : Date.parse(start);

/**
 * Today so far, hour by hour, summed across every meter in each role (a
 * house can have several inverters or grid connections). `null` when the
 * call fails or a configured meter has no statistics at all today — a
 * missing meter must hide the ratio, not read as zero.
 */
export async function fetchHourlyEnergy(
  backend: HaBackend,
  meters: EnergyMeters,
  now: Date = new Date(),
): Promise<Hourly | null> {
  const ids = [...new Set(ROLES.flatMap((role) => meters[role]))];
  if (ids.length === 0) return null;

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  let raw: Record<string, StatRow[]> | undefined;
  try {
    raw = await backend.sendMessagePromise<Record<string, StatRow[]>>({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(),
      statistic_ids: ids,
      period: 'hour',
      types: ['change'],
      // Mixed Wh/kWh meters would otherwise sum as if they were one unit.
      units: { energy: 'kWh' },
    });
  } catch {
    return null;
  }
  if (!raw) return null;

  const hourly: Hourly = {};
  for (const role of ROLES) {
    if (meters[role].length === 0) continue;
    const buckets = new Map<number, number>();
    for (const id of meters[role]) {
      const rows = raw[id];
      if (!rows || rows.length === 0) return null;
      for (const row of rows) {
        const t = bucketStart(row.start);
        if (!Number.isFinite(t)) continue;
        buckets.set(t, (buckets.get(t) ?? 0) + (row.change ?? 0));
      }
    }
    hourly[role] = buckets;
  }
  return hourly;
}

interface Split {
  usedTotal: number;
  usedSolar: number;
  usedBattery: number;
  solarToGrid: number;
  solarToBattery: number;
  gridToBattery: number;
  batteryToGrid: number;
}

/**
 * One hour's flows split into where each kWh went — a port of
 * `computeConsumptionSingle` in the HA frontend's `src/data/energy.ts`,
 * priority order and all: solar → battery, solar → grid, battery → grid,
 * grid → battery, then consumption from solar, battery, grid.
 */
function splitHour(hour: {
  fromGrid: number;
  toGrid: number;
  solar: number;
  toBattery: number;
  fromBattery: number;
}): Split {
  let toGrid = Math.max(hour.toGrid, 0);
  let toBattery = Math.max(hour.toBattery, 0);
  let solar = Math.max(hour.solar, 0);
  let fromGrid = Math.max(hour.fromGrid, 0);
  let fromBattery = Math.max(hour.fromBattery, 0);

  const usedTotal = fromGrid + solar + fromBattery - toGrid - toBattery;
  let remaining = Math.max(usedTotal, 0);

  // Grid import beyond what the house used must have gone into the battery.
  const excessGridIn = Math.max(0, Math.min(toBattery, fromGrid - remaining));
  let gridToBattery = excessGridIn;
  toBattery -= excessGridIn;
  fromGrid -= excessGridIn;

  const solarToBattery = Math.min(solar, toBattery);
  toBattery -= solarToBattery;
  solar -= solarToBattery;

  const solarToGrid = Math.min(solar, toGrid);
  toGrid -= solarToGrid;
  solar -= solarToGrid;

  const batteryToGrid = Math.min(fromBattery, toGrid);
  fromBattery -= batteryToGrid;

  const gridToBattery2 = Math.min(fromGrid, toBattery);
  gridToBattery += gridToBattery2;

  const usedSolar = Math.min(remaining, solar);
  remaining -= usedSolar;
  const usedBattery = Math.min(fromBattery, remaining);

  return {
    usedTotal,
    usedSolar,
    usedBattery,
    solarToGrid,
    solarToBattery,
    gridToBattery,
    batteryToGrid,
  };
}

/**
 * Both ratios from the hourly buckets, following HA's own gauge cards
 * (`hui-energy-self-sufficiency-gauge-card`, `hui-energy-solar-consumed-gauge-card`).
 *
 * The handoff asks for a missing meter or a solar total of 0 to hide a
 * number rather than show 0%: `uit zon` needs import metering, `zelf
 * gebruikt` needs export metering, and both need solar.
 */
export function solarRatios(hourly: Hourly | null): SolarRatios {
  if (!hourly?.solar) return {};

  const at = (role: Role, t: number) => hourly[role]?.get(t) ?? 0;
  const times = [
    ...new Set(ROLES.flatMap((role) => [...(hourly[role]?.keys() ?? [])])),
  ].sort((a, b) => a - b);

  let solarTotal = 0;
  let fromGridTotal = 0;
  let usedTotal = 0;
  let solarConsumed = 0;
  let solarReturned = 0;
  // Energy stored in the battery, by source, drained last-in first-out — so
  // solar that went into the battery and later out to the house still counts
  // as solar the house used. Discharge with nothing on the stack came from a
  // previous day and is ignored, as HA does.
  const lifo: { type: 'solar' | 'grid'; value: number }[] = [];
  const drain = (amount: number, onSolar: (kwh: number) => void) => {
    let left = amount;
    while (left > 0 && lifo.length > 0) {
      const last = lifo[lifo.length - 1]!;
      const energy = Math.min(left, last.value);
      if (last.type === 'solar') onSolar(energy);
      last.value -= energy;
      if (last.value <= 0) lifo.pop();
      left -= energy;
    }
  };

  for (const t of times) {
    const hour = {
      solar: at('solar', t),
      fromGrid: at('fromGrid', t),
      toGrid: at('toGrid', t),
      toBattery: at('toBattery', t),
      fromBattery: at('fromBattery', t),
    };
    solarTotal += hour.solar;
    fromGridTotal += hour.fromGrid;

    const split = splitHour(hour);
    usedTotal += split.usedTotal;
    solarConsumed += split.usedSolar;
    solarReturned += split.solarToGrid;

    if (split.gridToBattery) lifo.push({ type: 'grid', value: split.gridToBattery });
    if (split.solarToBattery) lifo.push({ type: 'solar', value: split.solarToBattery });
    drain(split.usedBattery, (kwh) => (solarConsumed += kwh));
    drain(split.batteryToGrid, (kwh) => (solarReturned += kwh));
  }

  if (solarTotal <= 0) return {};

  const ratios: SolarRatios = {};
  const consumption = Math.max(0, usedTotal);
  if (hourly.fromGrid && consumption > 0) {
    ratios.fromSolar = 1 - Math.min(1, fromGridTotal / consumption);
  }
  if (hourly.toGrid) {
    const produced = solarConsumed + solarReturned;
    if (produced > 0) ratios.selfUsed = solarConsumed / produced;
  }
  return ratios;
}
