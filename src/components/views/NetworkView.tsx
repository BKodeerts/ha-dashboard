import { useEffect, useState } from 'react';
import { useHass } from '../../ha/HassProvider';
import { fetchLastKnown, type LastKnown } from '../../ha/history';
import { formatNumber } from '../../ha/selectors';
import {
  ALARM_AFTER_MS,
  LOW_BATTERY_PCT,
  formatSilence,
  type DevicePower,
  type StaleDevice,
} from '../../ha/stale';
import { Icon } from '../../ui/Icon';
import { useLongPress } from '../../ui/useLongPress';

interface AreaGroup {
  key: string;
  name: string;
  tint: string | undefined;
  devices: StaleDevice[];
}

/**
 * One card per area, in order of each area's oldest silence. `stale` already
 * arrives longest-silence first, so an area's first appearance in it is
 * exactly that order.
 */
function groupByArea(stale: StaleDevice[], tints: Record<string, string>): AreaGroup[] {
  const groups = new Map<string, AreaGroup>();
  for (const device of stale) {
    const key = device.areaId ?? '';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: device.area,
        tint: device.areaId ? tints[device.areaId] : undefined,
        devices: [],
      };
      groups.set(key, group);
    }
    group.devices.push(device);
  }
  return [...groups.values()];
}

/**
 * The battery sensor's last reading from history, for a row whose live
 * battery state is gone. Only asked for when it is actually needed: a live
 * percentage, or a live battery-low flag, already answers the question.
 */
function useLastKnownBattery(power: DevicePower): LastKnown | undefined {
  const { backend } = useHass();
  const entityId =
    power.kind === 'battery' && power.percent === undefined && power.low === undefined
      ? power.entityId
      : undefined;
  const [lastKnown, setLastKnown] = useState<LastKnown | undefined>(undefined);

  useEffect(() => {
    setLastKnown(undefined);
    if (!entityId) return;
    let cancelled = false;
    fetchLastKnown(backend, entityId).then((value) => {
      if (!cancelled) setLastKnown(value);
    });
    return () => {
      cancelled = true;
    };
  }, [backend, entityId]);

  return lastKnown;
}

/**
 * The meta line. `netstroom` only when the device has no battery entity at
 * all; a battery whose reading is gone says so rather than pretending the
 * device is on mains.
 */
function powerLine(
  power: DevicePower,
  lastKnown: LastKnown | undefined,
): { text: string; battery: boolean; warn: boolean } {
  if (power.kind === 'mains') return { text: 'netstroom', battery: false, warn: false };
  if (power.percent !== undefined) {
    return {
      text: `batterij ${formatNumber(power.percent)}%`,
      battery: true,
      warn: power.percent < LOW_BATTERY_PCT,
    };
  }
  if (power.low !== undefined) {
    return { text: power.low ? 'batterij laag' : 'batterij ok', battery: true, warn: power.low };
  }
  if (lastKnown) {
    return {
      text: `batterij ${formatNumber(lastKnown.value)}% · laatst gekend`,
      battery: true,
      warn: lastKnown.value < LOW_BATTERY_PCT,
    };
  }
  return { text: 'batterij onbekend', battery: true, warn: false };
}

function StaleRow({ device }: { device: StaleDevice }) {
  const longPress = useLongPress({ entityId: device.entityId });
  const silent = device.silentMs > ALARM_AFTER_MS;
  const lastKnown = useLastKnownBattery(device.power);
  const power = powerLine(device.power, lastKnown);

  return (
    <div
      className="stale__row"
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
    >
      <div className="stale__names">
        <div className="stale__name">{device.name}</div>
        <div className={`stale__meta mono${power.warn ? ' stale__meta--warn' : ''}`}>
          {power.battery && <Icon name="battery" size={12} />}
          {power.text}
        </div>
      </div>
      <div className={`stale__badge mono${silent ? ' stale__badge--warn' : ''}`}>
        {formatSilence(device.silentMs, device.silenceAtLeast)}
      </div>
    </div>
  );
}

/**
 * Netwerk is not a card page. It answers one question — what has stopped
 * talking — which is the question a house full of battery sensors actually
 * raises. v7 groups the answer by area, each card carrying its room's tint
 * the way the room tiles do. Amber marks what needs a look: silent for over
 * 48 h, or a battery under 15% that is likely to be the next one.
 *
 * From 760px the cards flow into two CSS columns rather than a grid, so a
 * one-device area never leaves a gap beside a taller neighbour.
 */
export function NetworkView({ stale }: { stale: StaleDevice[] }) {
  const { config } = useHass();
  const groups = groupByArea(stale, config.areaTint);

  return (
    <div className="view">
      <div>
        <div className="view__title">Stille apparaten</div>
        <div className="view__sub">
          {stale.length === 0
            ? 'alles heeft recent gemeld'
            : `${stale.length} ${stale.length === 1 ? 'apparaat' : 'apparaten'} stil`}
        </div>
      </div>

      {stale.length > 0 && (
        <>
          <div className="stale">
            {groups.map((group) => (
              <section className="stale__area" key={group.key}>
                <span
                  className="stale__spine"
                  style={group.tint ? { background: group.tint } : undefined}
                />
                <div className="stale__head">
                  <span className="stale__area-name">{group.name}</span>
                  <span className="stale__count mono">
                    {group.devices.length === 1
                      ? '1 apparaat'
                      : `${group.devices.length} apparaten`}
                  </span>
                </div>
                {group.devices.map((device) => (
                  <StaleRow key={device.key} device={device} />
                ))}
              </section>
            ))}
          </div>

          <div className="stale__foot">amber = meer dan 48 u stil, of batterij onder 15%</div>
        </>
      )}
    </div>
  );
}
