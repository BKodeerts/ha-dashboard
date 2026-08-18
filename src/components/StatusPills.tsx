import type { OpeningsSummary } from '../ha/selectors';
import { Icon } from '../ui/Icon';

/**
 * One pill, one job: is anything open.
 *
 * v2 had three pills here and they wrapped. v3 moved presence up to the top
 * line; v4 moved the alarm up beside it, which leaves this row with a single
 * bounded label and no way to ever need a second line.
 *
 * The label is count-based on purpose. v2 named the opening (`Living raam 2`)
 * whenever there was exactly one, and a long room-plus-sensor name wrapped the
 * row, pushing the room grid below the fold; a count cannot. Which room is open
 * is one tap away, in the sheet this pill opens.
 */
export function StatusPills({
  openings,
  onOpenOpenings,
}: {
  openings: OpeningsSummary;
  onOpenOpenings(): void;
}) {
  const openCount = openings.open.length;
  const openLabel =
    openCount === 0 ? 'Alles dicht' : openCount === 1 ? '1 raam open' : `${openCount} ramen open`;

  return (
    <div className="pills">
      <button
        type="button"
        className={`pill${openCount > 0 ? ' pill--warn' : ''}`}
        onClick={onOpenOpenings}
      >
        <Icon name="window" size={17} className="pill__icon" />
        <span className="pill__label">{openLabel}</span>
      </button>
    </div>
  );
}
