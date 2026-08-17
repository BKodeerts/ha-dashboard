import { useHass } from '../../ha/HassProvider';
import { formatNumber, type PowerInfo } from '../../ha/selectors';
import { LovelaceCard } from '../LovelaceCard';

const clampBar = (value: number | undefined, scale: number): string =>
  value === undefined ? '0%' : `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;

/**
 * The figures v1 hid behind a modal on its own tab, now at the top of a real
 * view. Below them sits the embedded energy dashboard — the one place in v2
 * where Lovelace cards belong.
 */
export function EnergyView({ power }: { power: PowerInfo }) {
  const { config } = useHass();
  const scale = config.power.scale > 0 ? config.power.scale : 2000;

  const net =
    power.net === undefined
      ? undefined
      : power.net >= 0
        ? `+${formatNumber(power.net)} W naar net`
        : `${formatNumber(power.net)} W van net`;

  const cards = config.lovelace.energy ?? [];

  return (
    <div className="view">
      <div className="energy__head">
        <span className="energy__now">Nu</span>
        {net && <span className="energy__net">{net}</span>}
      </div>

      <div className="energy__cols">
        <div className="energy__col">
          <div className="energy__value-row">
            <span className="energy__value">{formatNumber(power.solar)}</span>
            <span className="energy__unit">W ZON</span>
          </div>
          <div className="energy__bar">
            <div
              className="energy__fill energy__fill--solar"
              style={{ width: clampBar(power.solar, scale) }}
            />
          </div>
        </div>

        <div className="energy__col">
          <div className="energy__value-row">
            <span className="energy__value">{formatNumber(power.consumption)}</span>
            <span className="energy__unit">W HUIS</span>
          </div>
          <div className="energy__bar">
            <div
              className="energy__fill energy__fill--use"
              style={{ width: clampBar(power.consumption, scale) }}
            />
          </div>
        </div>
      </div>

      {power.loads.length > 0 && (
        <div className="energy__loads">
          {power.loads.map((load) => (
            <div className="energy__load" key={load.entityId}>
              <span className="energy__load-name">{load.name}</span>
              <span className="energy__load-value">{`${formatNumber(load.watts)} W`}</span>
            </div>
          ))}
        </div>
      )}

      {cards.length > 0 ? (
        cards.map((card, index) => (
          <LovelaceCard key={index} config={card} fallback={`lovelace · ${card.type}`} />
        ))
      ) : (
        <div className="lovelace lovelace--empty">
          <div className="sheet__footnote">
            Stel lovelace.energy in om het energy-dashboard hier te tonen
          </div>
        </div>
      )}
    </div>
  );
}
