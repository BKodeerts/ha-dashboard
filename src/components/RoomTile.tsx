import { useHass } from '../ha/HassProvider';
import { formatHumidity, formatTemp } from '../ha/selectors';
import { toggleClimate, toggleRoomLights } from '../ha/services';
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
  /** Set on the chips that are controls; the rest render as read-only glyphs. */
  onTap?: () => void;
  /** Only meaningful alongside `onTap` — it is the button's `aria-pressed`. */
  on?: boolean;
}

/**
 * Read-only chips. A device the room *has* keeps its chip whether or not it is
 * doing anything, so the light chip beside them never shifts sideways as the
 * house changes state — a moving target is a mis-tap.
 *
 * The opening chip is the exception: a closed window is the normal state of a
 * house and says nothing, so it only appears while something is open. It is
 * last in the row, so appearing and disappearing moves no other chip.
 *
 * The AC chip is a control, like the light chip beside it: tapping it switches
 * the unit on or off. Which mode it comes back in is the sheet's business.
 */
function stateChips(room: Room, onToggleClimate: (entityId: string) => void): StateChip[] {
  const chips: StateChip[] = [];

  if (room.climate) {
    const { entityId, mode, target } = room.climate;
    const on = mode !== 'off';
    const chip: StateChip = {
      key: 'climate',
      icon: HVAC_ICONS[mode],
      tone: on ? `chip--${mode}` : '',
      // The action, as on the light chip — `aria-pressed` carries the state.
      label: `Airco ${room.name} ${on ? 'uit' : 'aan'}`,
      onTap: () => onToggleClimate(entityId),
      on,
    };
    // The setpoint is the whole point of the chip — except in fan mode, where
    // there is nothing to hold.
    if (on && mode !== 'fan_only' && target !== undefined) {
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

  if (room.openingOpen) {
    chips.push({
      key: 'window',
      icon: 'window',
      tone: 'chip--warn',
      label: `${room.name} open`,
    });
  }

  return chips;
}

export function RoomTile({ room, onOpen }: { room: Room; onOpen(): void }) {
  const { entities, call } = useHass();

  const chips = stateChips(room, (entityId) => void call(toggleClimate(entityId, entities)));

  return (
    <div className="tile">
      <span className="tile__spine" style={{ background: room.tint }} />

      <div
        className="tile__body"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          // The chips are buttons inside this one. Enter on a chip already
          // toggled its device; letting the key bubble on would open the card
          // on top of it — the keyboard's version of the fall-through the
          // chips' `stopPropagation` prevents for taps.
          if (event.target !== event.currentTarget) return;
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
              className={`chip${room.lightsOn ? ' chip--light' : ''}`}
              aria-label={`Lichten ${room.name} ${room.lightsOn ? 'uit' : 'aan'}`}
              aria-pressed={room.lightsOn}
              onClick={(event) => {
                // The chip toggles; it must never fall through and open the card.
                event.stopPropagation();
                void call(toggleRoomLights(room.entities.lights, entities));
              }}
            >
              <Icon name="bulb" size={15} />
            </button>
          )}

          {chips.map((chip) => {
            const face = (
              <>
                <Icon name={chip.icon} size={15} />
                {chip.note && <span className="chip__note">{chip.note}</span>}
              </>
            );

            return chip.onTap ? (
              <button
                key={chip.key}
                type="button"
                className={`chip${chip.tone ? ` ${chip.tone}` : ''}`}
                aria-label={chip.label}
                aria-pressed={chip.on}
                onClick={(event) => {
                  // As with the light chip: toggle, never fall through and open
                  // the card underneath.
                  event.stopPropagation();
                  chip.onTap?.();
                }}
              >
                {face}
              </button>
            ) : (
              <span
                key={chip.key}
                className={`chip${chip.tone ? ` ${chip.tone}` : ''}`}
                role="img"
                aria-label={chip.label}
              >
                {face}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
