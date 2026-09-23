import { useLayout } from '../app/layout';
import type { Room } from '../ha/types';
import { Icon } from '../ui/Icon';
import { RoomTile } from './RoomTile';

/**
 * Favourites fill the screen; the rest are one tap away.
 *
 * v5 ("Adem") spreads the same v4 content over the full screen height instead
 * of packing it into the top half. Collapsed, the grid is sized to the space
 * left under the header and the tiles share it evenly (`1fr` rows), so a
 * favourite count that fills the screen shows with no scroll at all — that
 * is the point of the revision. The "N meer"
 * tile is a normal grid cell, not a row underneath, so it fills whatever slot
 * is left over rather than spanning full width.
 *
 * Expanded, the non-favourites append in place and the grid switches to a
 * fixed row height and becomes the thing that scrolls.
 *
 * v7 bounds the collapsed rows both ways: never under 128px (a short
 * viewport would otherwise clip the humidity line — the area scrolls
 * instead) and never over 160px (a desktop-sized card would otherwise turn
 * every tile into a 300px slab). The ceiling is a `max-height` on the grid,
 * since `grid-auto-rows` cannot express "share the space, up to N".
 *
 * `rooms` arrives already sorted favourites-first in the user's own order, so
 * the split below preserves that order within each group.
 */
const ROW_MAX = 160;
const GRID_GAP = 12;

export function RoomGrid({
  rooms,
  showOther,
  onToggleOther,
  onOpenRoom,
}: {
  rooms: Room[];
  showOther: boolean;
  onToggleOther(): void;
  onOpenRoom(roomId: string): void;
}) {
  const favourites = rooms.filter((room) => room.favourite);
  const others = rooms.filter((room) => !room.favourite);

  // Nobody has marked a favourite yet: show the house rather than an empty
  // grid and a "meer" tile carrying every room in it.
  const noFavourites = favourites.length === 0;
  const hasFold = !noFavourites && others.length > 0;
  const shown = noFavourites || showOther ? [...favourites, ...others] : favourites;

  const { cols } = useLayout();
  const rows = Math.max(1, Math.ceil((shown.length + (hasFold ? 1 : 0)) / cols));
  const maxHeight = showOther ? undefined : rows * ROW_MAX + (rows - 1) * GRID_GAP;

  return (
    // `scroll` is the hook `element.tsx`'s touch handler looks for before
    // letting a drag through as a scroll rather than blocking it (see the
    // note on `#onTouchMove`). v7 makes this area a real scroller in both
    // states — collapsed tiles have a 128px floor, so a short viewport has to
    // be able to scroll to the last row — which also keeps the marker honest:
    // `overflow-y: auto` means scrollHeight > clientHeight only when it can
    // genuinely move.
    <div className={`room-grid-area scroll${showOther ? ' room-grid-area--open' : ''}`}>
      <div className="room-grid" style={maxHeight === undefined ? undefined : { maxHeight }}>
        {shown.map((room) => (
          <RoomTile key={room.id} room={room} onOpen={() => onOpenRoom(room.id)} />
        ))}

        {hasFold && (
          <button
            type="button"
            className="room-grid__more"
            aria-expanded={showOther}
            onClick={onToggleOther}
          >
            {showOther ? 'minder' : `${others.length} meer`}
            <Icon name={showOther ? 'chevronUp' : 'chevronDown'} size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
