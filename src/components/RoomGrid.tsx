import type { Room } from '../ha/types';
import { Icon } from '../ui/Icon';
import { RoomCard } from './RoomCard';

/**
 * Favourites first, with the "other rooms" toggle occupying the last cell of
 * that grid. Expanding reveals a second, identical grid below it.
 */
export function RoomGrid({
  favourites,
  others,
  showOthers,
  onToggleOthers,
  onOpenRoom,
}: {
  favourites: Room[];
  others: Room[];
  showOthers: boolean;
  onToggleOthers(): void;
  onOpenRoom(roomId: string): void;
}) {
  return (
    <>
      <div className="room-grid">
        {favourites.map((room) => (
          <RoomCard key={room.id} room={room} onOpen={() => onOpenRoom(room.id)} />
        ))}

        {others.length > 0 && (
          <button
            type="button"
            className="others"
            onClick={onToggleOthers}
            aria-expanded={showOthers}
          >
            <Icon
              name="chevronDown"
              size={20}
              className={`others__chevron${showOthers ? ' others__chevron--up' : ''}`}
            />
            <span className="others__label">
              {showOthers ? 'Verberg' : `Andere kamers · ${others.length}`}
            </span>
          </button>
        )}
      </div>

      {showOthers && others.length > 0 && (
        <div className="room-grid room-grid--others">
          {others.map((room) => (
            <RoomCard key={room.id} room={room} onOpen={() => onOpenRoom(room.id)} />
          ))}
        </div>
      )}
    </>
  );
}
