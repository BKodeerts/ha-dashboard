import type { AlarmInfo, OpeningsSummary, PresenceInfo } from '../ha/selectors';
import { Icon } from '../ui/Icon';

/**
 * The three answers the home screen owes at a glance: is the alarm set, is
 * anything open, is the person home. The openings pill is hidden entirely when
 * nothing is open, and collapses to a count from two upward so the row never
 * wraps — it has to survive 13 simultaneous openings.
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
    openCount === 1 && first
      ? `${first.room} ${first.name.toLowerCase()}`.trim()
      : `${openCount} open`;

  return (
    <div className="pills">
      {alarm.entityId && (
        <button
          type="button"
          className={`pill${alarm.attention ? ' pill--attention' : ''}`}
          onClick={onOpenAlarm}
        >
          <Icon name={alarm.state === 'disarmed' ? 'shieldOff' : 'shieldHome'} size={17} />
          {alarm.label}
        </button>
      )}

      {openCount > 0 && (
        <button type="button" className="pill pill--attention" onClick={onOpenOpenings}>
          <Icon name="window" size={17} />
          {openLabel}
        </button>
      )}

      {presence.entityId && (
        <button
          type="button"
          className={`pill${presence.home ? ' pill--presence-home' : ''}`}
          onClick={onOpenPresence}
        >
          <Icon name="person" size={17} />
          {presence.label}
        </button>
      )}
    </div>
  );
}
