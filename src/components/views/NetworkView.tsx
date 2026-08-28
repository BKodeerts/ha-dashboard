import { formatNumber } from '../../ha/selectors';
import { ALARM_AFTER_MS, formatSilence, type StaleDevice } from '../../ha/stale';
import { useLongPress } from '../../ui/useLongPress';

function StaleRow({ device }: { device: StaleDevice }) {
  const longPress = useLongPress({ entityId: device.entityId });
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
        {/* One line, but only the entity id gives way when it is too
            narrow — a dead-battery list that ellipsises the battery
            percentage would be hiding its own answer. */}
        {/* Non-breaking spaces: each span is a flex item, and flex
            trims the whitespace at its edges. */}
        <div className="stale__meta">
          <span>{device.area}</span>
          <span className="stale__meta-id">{` · ${device.entityId}`}</span>
          {device.battery !== undefined && (
            <span>{` · batterij ${formatNumber(device.battery)}%`}</span>
          )}
        </div>
      </div>
      <div
        className={`stale__badge${device.silentMs > ALARM_AFTER_MS ? ' stale__badge--warn' : ''}`}
      >
        {formatSilence(device.silentMs)}
      </div>
    </div>
  );
}

/**
 * Netwerk is not a card page. It answers one question — what has stopped
 * talking — which is the question a house full of battery sensors actually
 * raises. Oldest first; past 48 h the badge turns amber.
 */
export function NetworkView({ stale }: { stale: StaleDevice[] }) {
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
            {stale.map((device) => (
              <StaleRow key={device.key} device={device} />
            ))}
          </div>

          <div className="stale__foot">amber = meer dan 48 u stil</div>
        </>
      )}
    </div>
  );
}
