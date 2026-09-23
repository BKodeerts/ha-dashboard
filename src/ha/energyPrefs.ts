import type { HaBackend } from './types';

export interface EnergyPrefs {
  /** The live power sensor for the household's first configured solar source. */
  solarRate?: string;
  /**
   * Live power sensors for the "Individual devices" configured under
   * Settings → Dashboards → Energy, in that list's own order. An entry with
   * no live rate sensor — only a cumulative kWh statistic — is left out: this
   * app shows instantaneous wattage, not an energy total.
   */
  deviceRates: string[];
  /**
   * Config entry ids of whichever forecast integration (Forecast.Solar,
   * Solcast, …) each solar source has wired up under "Forecast production" —
   * what `energy/solar_forecast` (see `ha/solarForecast.ts`) is keyed by.
   * Flattened across every solar source; a household with more than one
   * array can have more than one, each contributing its own forecast.
   */
  solarForecastConfigEntries: string[];
  /**
   * Of `deviceRates`, the ones HA knows are measured *inside* another listed
   * device ("upstream device" in the Energy settings) — left out when
   * summing devices, or a sub-meter would count twice.
   */
  nestedDeviceRates: string[];
  /**
   * The cumulative kWh statistics behind each energy flow, for today's two
   * ratios (see `ha/energyStats.ts`). A role with no meter configured is an
   * empty list, which is what hides the ratio that needs it.
   */
  meters: EnergyMeters;
}

export interface EnergyMeters {
  solar: string[];
  /** Grid import. */
  fromGrid: string[];
  /** Grid export. */
  toGrid: string[];
  /** Battery charge. */
  toBattery: string[];
  /** Battery discharge. */
  fromBattery: string[];
}

interface RawEnergySource {
  type: string;
  stat_rate?: string | null;
  config_entry_solar_forecast?: string[] | null;
  /** Solar/battery, and a grid source in HA's unified format (one import/export pair per source). */
  stat_energy_from?: string | null;
  stat_energy_to?: string | null;
  /** A grid source in HA's legacy format, which HA migrates to the unified one on load. */
  flow_from?: { stat_energy_from?: string | null }[] | null;
  flow_to?: { stat_energy_to?: string | null }[] | null;
}

interface RawDeviceConsumption {
  stat_rate?: string | null;
  included_in_stat?: string | null;
}

interface RawEnergyPrefs {
  energy_sources?: RawEnergySource[];
  device_consumption?: RawDeviceConsumption[];
}

/**
 * Home Assistant's own Energy dashboard configuration (Settings → Dashboards
 * → Energy) — exactly the source the design handoff's README names as
 * intended. A household that has gone through that setup has already done
 * the curation this dashboard would otherwise have to guess at from sensor
 * names: which sensor is solar, and which sensors are individual devices
 * worth tracking (as opposed to a smart meter's own internal per-phase or
 * import/export breakdown, which never appears there).
 *
 * Not every install has an Energy dashboard configured — that, and an HA old
 * enough not to answer this call at all, both resolve to `undefined` rather
 * than breaking the rest of config derivation.
 */
export async function fetchEnergyPrefs(backend: HaBackend): Promise<EnergyPrefs | undefined> {
  try {
    const raw = await backend.sendMessagePromise<RawEnergyPrefs>({ type: 'energy/get_prefs' });

    const solarSources = raw.energy_sources?.filter((source) => source.type === 'solar') ?? [];
    const solarSource = solarSources.find((source) => typeof source.stat_rate === 'string');

    const deviceRates: string[] = [];
    const nestedDeviceRates: string[] = [];
    for (const device of raw.device_consumption ?? []) {
      if (typeof device.stat_rate !== 'string') continue;
      deviceRates.push(device.stat_rate);
      if (device.included_in_stat) nestedDeviceRates.push(device.stat_rate);
    }

    const solarForecastConfigEntries = [
      ...new Set(solarSources.flatMap((source) => source.config_entry_solar_forecast ?? [])),
    ];

    const prefs: EnergyPrefs = {
      deviceRates,
      nestedDeviceRates,
      solarForecastConfigEntries,
      meters: energyMeters(raw.energy_sources ?? []),
    };
    if (solarSource) prefs.solarRate = solarSource.stat_rate as string;
    return prefs;
  } catch {
    return undefined;
  }
}

const present = (id: string | null | undefined): id is string => typeof id === 'string' && id !== '';

/**
 * Every source's meters, by role. Grid sources come in two shapes: HA's
 * current unified one (each grid source is one import/export pair, and there
 * may be several) and the legacy one (a single grid source holding
 * `flow_from`/`flow_to` lists). HA migrates the legacy shape when it loads
 * its store, but reading both costs nothing and keeps an older HA working.
 */
export function energyMeters(sources: RawEnergySource[]): EnergyMeters {
  const meters: EnergyMeters = { solar: [], fromGrid: [], toGrid: [], toBattery: [], fromBattery: [] };
  for (const source of sources) {
    if (source.type === 'solar') {
      if (present(source.stat_energy_from)) meters.solar.push(source.stat_energy_from);
    } else if (source.type === 'grid') {
      if (present(source.stat_energy_from)) meters.fromGrid.push(source.stat_energy_from);
      if (present(source.stat_energy_to)) meters.toGrid.push(source.stat_energy_to);
      for (const flow of source.flow_from ?? []) {
        if (present(flow.stat_energy_from)) meters.fromGrid.push(flow.stat_energy_from);
      }
      for (const flow of source.flow_to ?? []) {
        if (present(flow.stat_energy_to)) meters.toGrid.push(flow.stat_energy_to);
      }
    } else if (source.type === 'battery') {
      if (present(source.stat_energy_from)) meters.fromBattery.push(source.stat_energy_from);
      if (present(source.stat_energy_to)) meters.toBattery.push(source.stat_energy_to);
    }
  }
  return meters;
}
