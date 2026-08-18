import { useHass } from '../ha/HassProvider';
import { formatHumidity, formatTemp } from '../ha/selectors';
import { toggleClimate, toggleRoomLights } from '../ha/services';
import type { Room } from '../ha/types';
import { Icon } from '../ui/Icon';
import { HVAC_ICONS } from '../ui/icons';
import type { IconName } from '../ui/icons';

interface StateGlyph {
  key: string;
  icon: IconName;
  /** CSS modifier for the active colour, or `''` for the inactive grey. */
  tone: string;
  /** Printed to the *left* of the glyph, in 10px mono. Only the AC has one. */
  note?: string;
  label: string;
  /** Set on the glyphs that are controls; the rest render as read-only icons. */
  onTap?: () => void;
  /** Only meaningful alongside `onTap` — it is the button's `aria-pressed`. */
  on?: boolean;
}

/**
 * The tile's icon column, in the v4 priority order: **light › radio › open
 * window › AC**, three at a time.
 *
 * Anything past the third lives in the room card. In a room with a radio *and*
 * an open window that drops the AC glyph, so the setpoint is not on the tile
 * there — accepted: the exceptions matter more at a glance than the setpoint.
 *
 * Two of them are controls. The light glyph toggles the room's lights and the
 * AC glyph switches the unit on or off; which mode it comes back in is the room
 * card's business. Radio and window are read-only.
 *
 * The window glyph is the one that comes and goes: a closed window is the
 * normal state of a house and says nothing, so it only appears while something
 * is open. Everything above it in the order keeps its place, so the light glyph
 * never moves under a thumb.
 */
function stateGlyphs(
  room: Room,
  onToggleLights: () => void,
  onToggleClimate: (entityId: string) => void,
): StateGlyph[] {
  const glyphs: StateGlyph[] = [];

  if (room.lights.length > 0) {
    glyphs.push({
      key: 'light',
      icon: 'bulb',
      tone: room.lightsOn ? 'glyph--light' : '',
      // The action, not the state — `aria-pressed` carries the state.
      label: `Lichten ${room.name} ${room.lightsOn ? 'uit' : 'aan'}`,
      onTap: onToggleLights,
      on: room.lightsOn,
    });
  }

  if (room.media) {
    glyphs.push({
      key: 'media',
      icon: 'radio',
      tone: room.media.playing ? 'glyph--warn' : '',
      label: room.media.playing ? `Radio ${room.name} speelt` : `Radio ${room.name} uit`,
    });
  }

  if (room.openingOpen) {
    glyphs.push({
      key: 'window',
      icon: 'window',
      tone: 'glyph--warn',
      label: `${room.name} open`,
    });
  }

  if (room.climate) {
    const { entityId, mode, target } = room.climate;
    const on = mode !== 'off';
    const glyph: StateGlyph = {
      key: 'climate',
      icon: HVAC_ICONS[mode],
      tone: on ? `glyph--${mode}` : '',
      label: `Airco ${room.name} ${on ? 'uit' : 'aan'}`,
      onTap: () => onToggleClimate(entityId),
      on,
    };
    // The setpoint is the whole point of the glyph — except in fan mode, where
    // there is nothing to hold.
    if (on && mode !== 'fan_only' && target !== undefined) {
      glyph.note = formatTemp(target);
    }
    glyphs.push(glyph);
  }

  return glyphs.slice(0, 3);
}

export function RoomTile({ room, onOpen }: { room: Room; onOpen(): void }) {
  const { entities, call } = useHass();

  const glyphs = stateGlyphs(
    room,
    () => void call(toggleRoomLights(room.entities.lights, entities)),
    (entityId) => void call(toggleClimate(entityId, entities)),
  );

  return (
    <div className="tile">
      <span className="tile__spine" style={{ background: room.tint }} />

      <div
        className="tile__body"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          // The glyph controls are buttons inside this one. Enter on one of
          // them already toggled its device; letting the key bubble on would
          // open the card on top of it — the keyboard's version of the
          // fall-through the glyphs' `stopPropagation` prevents for taps.
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
        aria-label={`${room.name}, ${formatTemp(room.temperature)}`}
      >
        <div className="tile__names">
          <div className="tile__name">{room.name}</div>
          <div className="tile__reading">
            <span className="tile__temp">{formatTemp(room.temperature)}</span>
            <span className="tile__hum">{formatHumidity(room.humidity)}</span>
          </div>
        </div>

        {/* A vertical stack against the tile's right edge. Right edges stay
            flush whether or not a glyph carries a note, because the note is
            laid out to the left of the icon rather than around it. */}
        <div className="tile__glyphs">
          {glyphs.map((glyph) => {
            const face = (
              <>
                {glyph.note && <span className="glyph__note">{glyph.note}</span>}
                <Icon name={glyph.icon} size={16} />
              </>
            );
            const className = `glyph${glyph.tone ? ` ${glyph.tone}` : ''}`;

            return glyph.onTap ? (
              <button
                key={glyph.key}
                type="button"
                // The 8px of padding is not decoration: a bare 16px glyph inside
                // a tile body that is itself a tap target turns every near-miss
                // into an opened room card.
                className={`${className} glyph--control`}
                aria-label={glyph.label}
                aria-pressed={glyph.on}
                onClick={(event) => {
                  // Toggle, and never fall through to the card underneath.
                  event.stopPropagation();
                  glyph.onTap?.();
                }}
              >
                {face}
              </button>
            ) : (
              <span key={glyph.key} className={className} role="img" aria-label={glyph.label}>
                {face}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
