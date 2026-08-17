import { useEffect, useMemo, useState } from 'react';
import { useHass } from '../ha/HassProvider';
import { fetchSparkline, sparklinePoints } from '../ha/history';
import { formatHumidity, formatTemp, numericState } from '../ha/selectors';
import { mediaPlayPause, toggleClimate, toggleRoomLights } from '../ha/services';
import type { Room } from '../ha/types';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/icons';

/** 24 h of the room's temperature sensor, kept fresh from the live state. */
function useSparkline(entityId: string | undefined): string {
  const { backend, entities } = useHass();
  const [values, setValues] = useState<number[]>([]);

  useEffect(() => {
    if (!entityId) {
      setValues([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchSparkline(backend, entityId).then((next) => {
        if (!cancelled) setValues(next);
      });
    };
    load();
    // The fetch is cached for five minutes; re-ask at that cadence.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [backend, entityId]);

  const current = entityId ? numericState(entities[entityId]) : undefined;

  return useMemo(() => {
    if (values.length === 0) return '';
    const series =
      current === undefined ? values : [...values.slice(0, -1), current];
    return sparklinePoints(series);
  }, [values, current]);
}

interface Badge {
  key: string;
  icon: IconName;
  active: boolean;
  cool?: boolean;
  label: string;
  onTap?: () => void;
}

export function RoomCard({ room, onOpen }: { room: Room; onOpen(): void }) {
  const { entities, call } = useHass();
  const points = useSparkline(room.entities.temperature);

  const badges: Badge[] = [];

  // Order is fixed by the design: lights, AC, radio, then read-only sensors.
  badges.push({
    key: 'lights',
    icon: 'bulb',
    active: room.lightsOn,
    label: `Lichten ${room.name} ${room.lightsOn ? 'uit' : 'aan'}`,
    onTap: () => void call(toggleRoomLights(room.entities.lights, entities)),
  });

  const climateId = room.entities.climate[0];
  if (climateId) {
    badges.push({
      key: 'climate',
      icon: 'ac',
      active: room.climateOn,
      cool: true,
      label: `Airco ${room.name} ${room.climateOn ? 'uit' : 'aan'}`,
      onTap: () => void call(toggleClimate(climateId, entities)),
    });
  }

  const mediaId = room.entities.mediaPlayers[0];
  if (mediaId) {
    badges.push({
      key: 'media',
      icon: 'radio',
      active: room.mediaPlaying,
      label: `Radio ${room.name} ${room.mediaPlaying ? 'pauzeren' : 'spelen'}`,
      onTap: () => void call(mediaPlayPause(mediaId, entities)),
    });
  }

  if (room.entities.openings.length > 0) {
    badges.push({
      key: 'window',
      icon: 'window',
      active: room.openingOpen,
      label: room.openingOpen ? 'Open' : 'Dicht',
    });
  }
  if (room.entities.motion.length > 0) {
    badges.push({
      key: 'motion',
      icon: 'motion',
      active: room.motionDetected,
      label: room.motionDetected ? 'Beweging' : 'Geen beweging',
    });
  }
  if (room.entities.smoke.length > 0) {
    badges.push({
      key: 'smoke',
      icon: 'smoke',
      active: room.smokeDetected,
      label: room.smokeDetected ? 'Rook!' : 'Rookmelder ok',
    });
  }
  if (room.entities.cameras.length > 0) {
    badges.push({ key: 'camera', icon: 'camera', active: false, label: 'Camera' });
  }

  return (
    <div
      className="room"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${room.name}, ${formatTemp(room.temperature)}`}
    >
      <span className="room__edge" style={{ background: room.tint }} />

      <div className="room__body">
        <div className="room__name">{room.name}</div>
        <div className="room__reading">
          <span className="room__temp">{formatTemp(room.temperature)}</span>
          <span className="room__hum">{formatHumidity(room.humidity)}</span>
        </div>
        <svg className="room__spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
          {points && (
            <polyline
              points={points}
              fill="none"
              stroke={room.tint}
              strokeWidth="1.4"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      <div className="room__icons">
        {badges.map((badge) => {
          const className = [
            'icon-btn',
            badge.active ? (badge.cool ? 'icon-btn--active-cool' : 'icon-btn--active') : '',
            badge.onTap ? '' : 'icon-btn--readonly',
          ]
            .filter(Boolean)
            .join(' ');

          if (!badge.onTap) {
            return (
              <span key={badge.key} className={className} role="img" aria-label={badge.label}>
                <Icon name={badge.icon} size={15} />
              </span>
            );
          }

          return (
            <button
              key={badge.key}
              type="button"
              className={className}
              aria-label={badge.label}
              onClick={(event) => {
                // Never let a control tap fall through and open the sheet.
                event.stopPropagation();
                badge.onTap?.();
              }}
            >
              <Icon name={badge.icon} size={15} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
