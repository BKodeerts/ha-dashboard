import type { AlarmInfo, OpeningsSummary } from '../ha/selectors';
import { Icon } from '../ui/Icon';

/**
 * The two exceptions the home screen owes at a glance: is the alarm set, and is
 * anything open. Presence used to be a third pill here; it is a standing state
 * rather than an exception, so it moved up to the top line — which is what lets
 * this row promise one line.
 *
 * Both labels are bounded on purpose. v2 named the opening (`Living raam 2`)
 * whenever there was exactly one, and a long room-plus-sensor name wrapped the
 * row into two lines, pushing the room grid below the fold; a count cannot.
 * Which room is open is one tap away, in the sheet this pill opens.
 */
export function StatusPills({
  alarm,
  openings,
  onOpenAlarm,
  onOpenOpenings,
}: {
  alarm: AlarmInfo;
  openings: OpeningsSummary;
  onOpenAlarm(): void;
  onOpenOpenings(): void;
}) {
  const openCount = openings.open.length;
  const openLabel =
    openCount === 0 ? 'Alles dicht' : openCount === 1 ? '1 raam open' : `${openCount} ramen open`;

  return (
    <div className="pills">
      {alarm.entityId && (
        <button
          type="button"
          className={`pill${alarm.attention ? ' pill--warn' : ''}`}
          onClick={onOpenAlarm}
        >
          <Icon
            name={alarm.state === 'disarmed' ? 'shieldOff' : 'shieldHome'}
            size={17}
            className="pill__icon"
          />
          <span className="pill__label">{alarm.label}</span>
        </button>
      )}

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
