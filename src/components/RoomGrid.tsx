import type { Room } from '../ha/types';
import { Icon } from '../ui/Icon';
import { RoomTile } from './RoomTile';

/**
 * Favourites only, with the rest one tap below.
 *
 * The favourite flag existed in v3 and changed nothing but the sort order —
 * v4 makes it the grid's filter, which is what makes marking a room a
 * favourite worth doing. The fold is a display filter and not a stored
 * preference: it resets on every load, so the screen a phone is picked up to
 * always shows the same thing.
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
  // grid and a disclosure row carrying every room in it.
  const noFavourites = favourites.length === 0;
  const shown = noFavourites || showOther ? [...favourites, ...others] : favourites;

  return (
    <>
      <div className="room-grid">
        {shown.map((room) => (
          <RoomTile key={room.id} room={room} onOpen={() => onOpenRoom(room.id)} />
        ))}
      </div>

      {!noFavourites && others.length > 0 && (
        <button
          type="button"
          className="disclosure"
          aria-expanded={showOther}
          onClick={onToggleOther}
        >
          {`${showOther ? 'Verberg overige' : 'Overige kamers'} · ${others.length}`}
          <Icon name={showOther ? 'chevronUp' : 'chevronDown'} size={15} />
        </button>
      )}
    </>
  );
}
