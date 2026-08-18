import type { Room } from '../ha/types';
import { Icon } from '../ui/Icon';
import { RoomTile } from './RoomTile';

/**
 * Favourites fill the screen; the rest are one tap away.
 *
 * v5 ("Adem") spreads the same v4 content over the full screen height instead
 * of packing it into the top half. Collapsed, the grid is not a scroller: it
 * is sized to the space left under the header and the tiles share it evenly
 * (`grid-auto-rows: 1fr`), so a favourite count that fills the screen shows
 * with no scroll at all — that is the point of the revision. The "N meer"
 * tile is a normal grid cell, not a row underneath, so it fills whatever slot
 * is left over rather than spanning full width.
 *
 * Expanded, the non-favourites append in place and the grid switches to a
 * fixed row height and becomes the thing that scrolls.
 *
 * `rooms` arrives already sorted favourites-first in the user's own order, so
 * the split below preserves that order within each group.
 */
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

  return (
    <div className={`room-grid-area${showOther ? ' room-grid-area--open' : ''}`}>
      <div className="room-grid">
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
