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
}

interface RawEnergySource {
  type: string;
  stat_rate?: string | null;
}

interface RawDeviceConsumption {
  stat_rate?: string | null;
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

    const solarSource = raw.energy_sources?.find(
      (source) => source.type === 'solar' && typeof source.stat_rate === 'string',
    );

    const deviceRates: string[] = [];
    for (const device of raw.device_consumption ?? []) {
      if (typeof device.stat_rate === 'string') deviceRates.push(device.stat_rate);
    }

    const prefs: EnergyPrefs = { deviceRates };
    if (solarSource) prefs.solarRate = solarSource.stat_rate as string;
    return prefs;
  } catch {
    return undefined;
  }
}
