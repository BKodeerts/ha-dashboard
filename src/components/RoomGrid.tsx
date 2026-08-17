import type { Room } from '../ha/types';
import { RoomTile } from './RoomTile';

/**
 * All rooms in one scroll — v1's "Andere kamers" fold is gone. `rooms` arrives
 * already sorted favourites-first in the user's own order, so this is only a
 * grid.
 */
export function RoomGrid({
  rooms,
  onOpenRoom,
}: {
  rooms: Room[];
  onOpenRoom(roomId: string): void;
}) {
  return (
    <div className="room-grid">
      {rooms.map((room) => (
        <RoomTile key={room.id} room={room} onOpen={() => onOpenRoom(room.id)} />
      ))}
    </div>
  );
}
