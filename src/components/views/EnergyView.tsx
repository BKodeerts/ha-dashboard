import { useHass } from '../../ha/HassProvider';
import { formatNumber, type PowerInfo } from '../../ha/selectors';
import { Icon } from '../../ui/Icon';
import { useLongPress } from '../../ui/useLongPress';

const clampBar = (value: number | undefined, scale: number): string =>
  value === undefined ? '0%' : `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;

function LoadRow({ load }: { load: PowerInfo['loads'][number] }) {
  const longPress = useLongPress({ entityId: load.entityId });
  return (
    <div
      className="energy__load"
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
    >
      <span className="energy__load-name">{load.name}</span>
      <span className="energy__load-value mono">{`${formatNumber(load.watts)} W`}</span>
    </div>
  );
}

/**
 * Stroom, v5 ("Adem"). The header (date, weather, section label) is shared
 * with the home tab and rendered above this; the section label reads "Nu"
 * here rather than "Kamers".
 */
export function EnergyView({ power }: { power: PowerInfo }) {
  const { config } = useHass();
  const scale = config.power.scale > 0 ? config.power.scale : 2000;

  const net =
    power.net === undefined
      ? undefined
      : power.net >= 0
        ? `${formatNumber(power.net)} W naar het net`
        : `${formatNumber(power.net)} W van het net`;

  const solarLongPress = useLongPress({ entityId: config.power.solar });
  const consumptionLongPress = useLongPress({ entityId: config.power.consumption });

  return (
    <div className="view view--energy">
      <div className="energy__cols">
        <div
          className="energy__col"
          onPointerDown={solarLongPress.onPointerDown}
          onPointerMove={solarLongPress.onPointerMove}
          onPointerUp={solarLongPress.onPointerUp}
          onPointerCancel={solarLongPress.onPointerCancel}
        >
          <div className="energy__col-head">
            <span className="energy__label mono">Zon</span>
            <Icon name="solar" size={16} className="energy__col-icon energy__col-icon--solar" />
          </div>
          <div className="energy__value-row">
            <span className="energy__value">{formatNumber(power.solar)}</span>
            <span className="energy__unit mono">W</span>
          </div>
          <div className="energy__bar">
            <div
              className="energy__fill energy__fill--solar"
              style={{ width: clampBar(power.solar, scale) }}
            />
          </div>
        </div>

        <div
          className="energy__col"
          onPointerDown={consumptionLongPress.onPointerDown}
          onPointerMove={consumptionLongPress.onPointerMove}
          onPointerUp={consumptionLongPress.onPointerUp}
          onPointerCancel={consumptionLongPress.onPointerCancel}
        >
          <div className="energy__col-head">
            <span className="energy__label mono">Huis</span>
            <Icon name="home" size={16} className="energy__col-icon energy__col-icon--use" />
          </div>
          <div className="energy__value-row">
            <span className="energy__value">{formatNumber(power.consumption)}</span>
            <span className="energy__unit mono">W</span>
          </div>
          <div className="energy__bar">
            <div
              className="energy__fill energy__fill--use"
              style={{ width: clampBar(power.consumption, scale) }}
            />
          </div>
        </div>
      </div>

      {net && (
        <div className="net-chip">
          <Icon name="flash" size={17} className="net-chip__icon" />
          {net}
        </div>
      )}

      {power.loads.length > 0 && (
        <div className="energy__loads">
          {power.loads.map((load) => (
            <LoadRow key={load.entityId} load={load} />
          ))}
        </div>
      )}
    </div>
  );
}
