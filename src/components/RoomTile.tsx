import { useHass } from '../ha/HassProvider';
import { formatHumidity, formatTemp } from '../ha/selectors';
import { toggleClimate, toggleRoomLights } from '../ha/services';
import type { Room } from '../ha/types';
import { HaIcon } from '../ui/HaIcon';
import { Icon } from '../ui/Icon';
import { HVAC_ICONS } from '../ui/icons';
import type { IconName } from '../ui/icons';
import { useLongPress } from '../ui/useLongPress';

interface StateGlyph {
  key: string;
  icon: IconName;
  /** CSS modifier for the active colour, or `''` for the inactive grey. */
  tone: string;
  label: string;
  /** Set on the glyphs that are controls; the rest render as read-only icons. */
  onTap?: () => void;
  /** Only meaningful alongside `onTap` — it is the button's `aria-pressed`. */
  on?: boolean;
  /** The single entity a long hold opens more-info for, when the glyph has one. */
  entityId?: string;
}

/**
 * The tile's icon column, in the v4 priority order: **light › radio › open
 * window › AC**, three at a time.
 *
 * Anything past the third lives in the room card. In a room with a radio *and*
 * an open window that drops the AC glyph — accepted: the exceptions matter
 * more at a glance than the AC. v7 dropped the AC's setpoint note as clutter:
 * the glyph's mode colour says it is running, the room card says at what.
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
    const multiple = room.lights.length > 1;
    glyphs.push({
      key: 'light',
      // A room with several lights toggles them all together, so the glyph
      // itself switches shape to say so — no separate count to read.
      icon: multiple ? 'bulbMultiple' : 'bulb',
      tone: room.lightsOn ? 'glyph--light' : '',
      // The action, not the state — `aria-pressed` carries the state.
      label: `Lichten ${room.name}${multiple ? ` (${room.lights.length})` : ''} ${
        room.lightsOn ? 'uit' : 'aan'
      }`,
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
      entityId: room.media.entityId,
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
    const { entityId, mode } = room.climate;
    const on = mode !== 'off';
    glyphs.push({
      key: 'climate',
      icon: HVAC_ICONS[mode],
      tone: on ? `glyph--${mode}` : '',
      label: `Airco ${room.name} ${on ? 'uit' : 'aan'}`,
      onTap: () => onToggleClimate(entityId),
      on,
      entityId,
    });
  }

  return glyphs.slice(0, 3);
}

/**
 * One glyph. Its own component, not inlined in the `.map` above, because
 * `useLongPress` needs one hook instance per glyph — holding down a glyph
 * that carries a single entity (the AC, the radio) opens HA's own more-info
 * for it; a short tap still does whatever the glyph already did.
 */
function GlyphView({ glyph, onOpenRoom }: { glyph: StateGlyph; onOpenRoom(): void }) {
  const face = <Icon name={glyph.icon} size={16} />;
  const className = `glyph${glyph.tone ? ` ${glyph.tone}` : ''}`;

  const longPress = useLongPress({
    entityId: glyph.entityId,
    // Read-only glyphs have nothing of their own to do with a tap, so a tap
    // opens the room card, same as tapping anywhere else on the tile. The
    // column sits beside the tile body rather than inside it, so that is an
    // explicit call rather than a click bubbling up.
    onClick: glyph.onTap ? () => glyph.onTap?.() : onOpenRoom,
  });

  if (!glyph.onTap) {
    return (
      <span
        className={className}
        role="img"
        aria-label={glyph.label}
        onPointerDown={longPress.onPointerDown}
        onPointerMove={longPress.onPointerMove}
        onPointerUp={longPress.onPointerUp}
        onPointerCancel={longPress.onPointerCancel}
        onClick={longPress.onClick}
      >
        {face}
      </span>
    );
  }

  return (
    <button
      type="button"
      // The 8px of padding is not decoration: a bare 16px glyph inside a tile
      // body that is itself a tap target turns every near-miss into an
      // opened room card.
      className={`${className} glyph--control`}
      aria-label={glyph.label}
      aria-pressed={glyph.on}
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
      onClick={longPress.onClick}
    >
      {face}
    </button>
  );
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
      <HaIcon icon={room.icon} className="tile__glyph-bg" color={room.tint} />

      {/* v7: a column pinned to the top-right corner, out of the flex flow, so
          three glyphs can never push the tile taller or clip at its bottom
          edge. A sibling of the tap area, not a child: a button inside a
          role="button" is nested interactive content. */}
      <div className="tile__glyphs">
        {glyphs.map((glyph) => (
          <GlyphView key={glyph.key} glyph={glyph} onOpenRoom={onOpen} />
        ))}
      </div>

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
      </div>
    </div>
  );
}
