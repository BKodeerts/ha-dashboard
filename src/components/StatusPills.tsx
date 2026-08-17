import type { AlarmInfo, OpeningsSummary, PresenceInfo } from '../ha/selectors';
import { Icon } from '../ui/Icon';

/**
 * The three answers the home screen owes at a glance: is the alarm set, is
 * anything open, and where is the other person. All three are always rendered —
 * v1 hid the openings pill when the house was closed, which meant the row
 * changed shape and the remaining pills moved under your thumb. `Alles dicht`
 * costs one pill and keeps every target where it was.
 *
 * From two openings upward the label collapses to a count, so the row survives
 * thirteen simultaneous openings without wrapping into the room grid.
 */
export function StatusPills({
  alarm,
  openings,
  presence,
  onOpenAlarm,
  onOpenOpenings,
  onOpenPresence,
}: {
  alarm: AlarmInfo;
  openings: OpeningsSummary;
  presence: PresenceInfo;
  onOpenAlarm(): void;
  onOpenOpenings(): void;
  onOpenPresence(): void;
}) {
  const openCount = openings.open.length;
  const first = openings.open[0];
  const openLabel =
    openCount === 0
      ? 'Alles dicht'
      : openCount === 1 && first
        ? `${first.room} ${first.name.toLowerCase()}`.trim()
        : `${openCount} open`;

  return (
    <div className="pills">
      {alarm.entityId && (
        <button
          type="button"
          className={`pill${alarm.attention ? ' pill--warn' : ''}`}
          onClick={onOpenAlarm}
        >
          <Icon name={alarm.state === 'disarmed' ? 'shieldOff' : 'shieldHome'} size={18} />
          {alarm.label}
        </button>
      )}

      <button
        type="button"
        className={`pill${openCount > 0 ? ' pill--warn' : ''}`}
        onClick={onOpenOpenings}
      >
        <Icon name="window" size={18} />
        {openLabel}
      </button>

      {presence.entityId && (
        <button
          type="button"
          className={`pill${presence.home ? ' pill--presence' : ''}`}
          onClick={onOpenPresence}
        >
          <Icon name="person" size={18} />
          {presence.label}
        </button>
      )}
    </div>
  );
}
