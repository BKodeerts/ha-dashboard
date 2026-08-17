import { useHass } from '../../ha/HassProvider';
import { formatNumber, type PowerInfo } from '../../ha/selectors';
import { Icon } from '../../ui/Icon';
import { LovelaceCard } from '../LovelaceCard';
import { Sheet, SheetClose } from '../Sheet';

/** The bars are scaled against a 2 kW full-deflection, as in the design. */
const BAR_FULL_SCALE = 2000;

const barWidth = (value: number | undefined): string =>
  value === undefined ? '0%' : `${Math.min(100, Math.max(0, (value / BAR_FULL_SCALE) * 100)).toFixed(0)}%`;

export function PowerSheet({ power, onClose }: { power: PowerInfo; onClose(): void }) {
  const { config } = useHass();

  const net =
    power.net === undefined
      ? null
      : `${power.net >= 0 ? '+' : '−'}${formatNumber(Math.abs(power.net))} W ${
          power.net >= 0 ? 'NAAR NET' : 'VAN NET'
        }`;

  return (
    <Sheet onClose={onClose} labelledBy="power-sheet-title" wideGap>
      <div className="sheet__head">
        <div className="sheet__tile sheet__tile--accent">
          <Icon name="plug" size={18} />
        </div>
        <div className="sheet__title sheet__titles" id="power-sheet-title">
          Stroom
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <div className="power">
        <div className="power__head">
          <span className="power__now">Nu</span>
          {net && <span className="power__net">{net}</span>}
        </div>

        <div className="power__cols">
          <div className="power__col">
            <div className="power__value-row">
              <span className="power__value">
                {power.solar === undefined ? '—' : formatNumber(power.solar)}
              </span>
              <span className="power__unit">W</span>
              <span className="power__icon power__icon--solar">
                <Icon name="solar" size={15} />
              </span>
            </div>
            <div className="power__bar">
              <div
                className="power__bar-fill power__bar-fill--solar"
                style={{ width: barWidth(power.solar) }}
              />
            </div>
          </div>

          <div className="power__col">
            <div className="power__value-row">
              <span className="power__value">
                {power.consumption === undefined ? '—' : formatNumber(power.consumption)}
              </span>
              <span className="power__unit">W</span>
              <span className="power__icon power__icon--use">
                <Icon name="plug" size={15} />
              </span>
            </div>
            <div className="power__bar">
              <div
                className="power__bar-fill power__bar-fill--use"
                style={{ width: barWidth(power.consumption) }}
              />
            </div>
          </div>
        </div>

        {power.loads.length > 0 && (
          <div className="power__loads">
            {power.loads.map((load) => (
              <div className="power__load" key={load.entityId}>
                <span className="power__load-name">{load.name}</span>
                <span className="power__load-value">{`${formatNumber(load.watts, load.watts < 100 ? 1 : 0)} W`}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {(config.lovelace.energy ?? []).map((card, index) => (
        <LovelaceCard key={index} config={card} fallback="Lovelace energy-dashboard hier ingebed" />
      ))}
      {(config.lovelace.energy ?? []).length === 0 && (
        <div className="sheet__footnote">Lovelace energy-dashboard hier ingebed</div>
      )}
    </Sheet>
  );
}
