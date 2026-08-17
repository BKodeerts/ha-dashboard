import type { LovelaceCardConfig } from '../config/config';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/icons';
import { LovelaceCard } from './LovelaceCard';

/**
 * The non-home tabs are Lovelace surfaces: the energy dashboard, and whatever
 * cards you point `netwerk` and `auto` at. Nothing here is rebuilt — the shell
 * just hosts HA's own cards, which is the point.
 */
export function LovelaceView({
  cards,
  icon,
  emptyHint,
}: {
  cards: LovelaceCardConfig[] | undefined;
  icon: IconName;
  emptyHint: string;
}) {
  if (!cards || cards.length === 0) {
    return (
      <div className="view">
        <div className="view__empty">
          <Icon name={icon} size={28} />
          <div className="sheet__footnote">{emptyHint}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      {cards.map((card, index) => (
        <LovelaceCard key={index} config={card} fallback={`lovelace · ${card.type}`} />
      ))}
    </div>
  );
}
