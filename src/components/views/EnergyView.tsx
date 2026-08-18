import { useState } from 'react';
import { useHass } from '../../ha/HassProvider';
import { formatNumber, type PowerInfo } from '../../ha/selectors';
import { Icon } from '../../ui/Icon';
import { LovelaceCard } from '../LovelaceCard';
import { Sheet, SheetClose } from '../Sheet';

const clampBar = (value: number | undefined, scale: number): string =>
  value === undefined ? '0%' : `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;

/**
 * Stroom, v5 ("Adem"). The header (date, weather, section label) is shared
 * with the home tab and rendered above this; the section label reads "Nu"
 * here rather than "Kamers".
 *
 * The embedded Lovelace energy dashboard — the one place in this app
 * Lovelace cards belong — moved behind the footer link instead of sitting
 * inline: a grid of HA's own cards is exactly the kind of unbounded content
 * this revision keeps out of the screen that is meant to fit without
 * scrolling.
 */
export function EnergyView({ power }: { power: PowerInfo }) {
  const { config } = useHass();
  const scale = config.power.scale > 0 ? config.power.scale : 2000;
  const [dashboardOpen, setDashboardOpen] = useState(false);

  const net =
    power.net === undefined
      ? undefined
      : power.net >= 0
        ? `${formatNumber(power.net)} W naar het net`
        : `${formatNumber(power.net)} W van het net`;

  const cards = config.lovelace.energy ?? [];

  return (
    <div className="view view--energy">
      <div className="energy__cols">
        <div className="energy__col">
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

        <div className="energy__col">
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
            <div className="energy__load" key={load.entityId}>
              <span className="energy__load-name">{load.name}</span>
              <span className="energy__load-value mono">{`${formatNumber(load.watts)} W`}</span>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className="energy__footer-link mono"
        onClick={() => setDashboardOpen(true)}
      >
        Volledig energiedashboard
        <Icon name="chevronRight" size={14} />
      </button>

      {dashboardOpen && (
        <Sheet onClose={() => setDashboardOpen(false)} labelledBy="energy-sheet-title">
          <div className="sheet__head">
            <div className="sheet__tile">
              <Icon name="solar" size={18} />
            </div>
            <div className="sheet__titles">
              <div className="sheet__title" id="energy-sheet-title">
                Energiedashboard
              </div>
            </div>
            <SheetClose onClose={() => setDashboardOpen(false)} />
          </div>

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
        </Sheet>
      )}
    </div>
  );
}
