import { useHass } from '../ha/HassProvider';
import { formatHumidity, formatTemp } from '../ha/selectors';
import { toggleRoomLights } from '../ha/services';
import type { Room } from '../ha/types';
import { Icon } from '../ui/Icon';
import { HVAC_ICONS } from '../ui/icons';
import type { IconName } from '../ui/icons';

interface StateChip {
  key: string;
  icon: IconName;
  /** CSS modifier, or `''` for the inactive treatment. */
  tone: string;
  note?: string;
  label: string;
}

/**
 * Read-only chips. Every device the room *has* gets a chip whether or not it is
 * doing anything, so the light chip beside them never shifts sideways as the
 * house changes state — a moving target is a mis-tap.
 */
function stateChips(room: Room): StateChip[] {
  const chips: StateChip[] = [];

  if (room.climate) {
    const { mode, target } = room.climate;
    const chip: StateChip = {
      key: 'climate',
      icon: HVAC_ICONS[mode],
      tone: mode === 'off' ? '' : `chip--${mode}`,
      label:
        mode === 'off'
          ? `Airco ${room.name} uit`
          : `Airco ${room.name} ${mode.replace('_only', '')}`,
    };
    // The setpoint is the whole point of the chip — except in fan mode, where
    // there is nothing to hold.
    if (mode !== 'off' && mode !== 'fan_only' && target !== undefined) {
      chip.note = formatTemp(target);
    }
    chips.push(chip);
  }

  if (room.media) {
    chips.push({
      key: 'media',
      icon: 'radio',
      tone: room.media.playing ? 'chip--warn' : '',
      label: room.media.playing ? `Radio ${room.name} speelt` : `Radio ${room.name} uit`,
    });
  }

  if (room.hasOpenings) {
    chips.push({
      key: 'window',
      icon: 'window',
      tone: room.openingOpen ? 'chip--warn' : '',
      label: room.openingOpen ? `${room.name} open` : `${room.name} dicht`,
    });
  }

  return chips;
}

export function RoomTile({ room, onOpen }: { room: Room; onOpen(): void }) {
  const { entities, call } = useHass();

  const lightLabel = !room.lightsOn
    ? 'uit'
    : room.brightness === undefined
      ? 'aan'
      : `${room.brightness}%`;

  return (
    <div className="tile">
      <span className="tile__spine" style={{ background: room.tint }} />

      <div
        className="tile__body"
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
        <div className="tile__name">{room.name}</div>

        <div className="tile__reading">
          <span className="tile__temp">{formatTemp(room.temperature)}</span>
          <span className="tile__hum">{formatHumidity(room.humidity)}</span>
        </div>

        <div className="tile__chips">
          {room.lights.length > 0 && (
            <button
              type="button"
              className={`chip-light${room.lightsOn ? ' chip-light--on' : ''}`}
              aria-label={`Lichten ${room.name} ${room.lightsOn ? 'uit' : 'aan'}`}
              aria-pressed={room.lightsOn}
              onClick={(event) => {
                // The chip toggles; it must never fall through and open the card.
                event.stopPropagation();
                void call(toggleRoomLights(room.entities.lights, entities));
              }}
            >
              <Icon name="bulb" size={16} />
              <span className="chip-light__label">{lightLabel}</span>
            </button>
          )}

          {stateChips(room).map((chip) => (
            <span
              key={chip.key}
              className={`chip${chip.tone ? ` ${chip.tone}` : ''}`}
              role="img"
              aria-label={chip.label}
            >
              <Icon name={chip.icon} size={15} />
              {chip.note && <span className="chip__note">{chip.note}</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
