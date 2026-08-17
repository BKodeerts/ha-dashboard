import { ACCENTS } from '../../config/config';
import { useHass } from '../../ha/HassProvider';
import type { Room } from '../../ha/types';
import { Icon } from '../../ui/Icon';
import { Sheet, SheetClose } from '../Sheet';

/**
 * Favourites, tint and accent are per-user preferences, so they live here rather
 * than in YAML. Reached from the room-count line in the "Kamers" header.
 */
export function SettingsSheet({ rooms, onClose }: { rooms: Room[]; onClose(): void }) {
  const { config, updateConfig, resetConfig } = useHass();

  const toggleFavourite = (roomId: string) => {
    const current = config.favouriteAreas;
    const next = current.includes(roomId)
      ? current.filter((id) => id !== roomId)
      : [...current, roomId];
    updateConfig({ favouriteAreas: next });
  };

  return (
    <Sheet onClose={onClose} labelledBy="settings-sheet-title" wideGap>
      <div className="sheet__head">
        <div className="sheet__tile">
          <Icon name="cog" size={18} />
        </div>
        <div className="sheet__title sheet__titles" id="settings-sheet-title">
          Instellingen
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <div>
        <div className="settings__label" style={{ marginBottom: 8 }}>
          Accent
        </div>
        <div className="settings__accents">
          {Object.entries(ACCENTS).map(([name, value]) => (
            <button
              key={name}
              type="button"
              className={`settings__accent${config.accent === value ? ' settings__accent--on' : ''}`}
              style={{ background: value }}
              aria-label={name}
              aria-pressed={config.accent === value}
              onClick={() => updateConfig({ accent: value })}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="settings__label" style={{ marginBottom: 8 }}>
          Favoriete kamers
        </div>
        <div className="settings__group">
          {rooms.map((room) => {
            const favourite = config.favouriteAreas.includes(room.id);
            return (
              <button
                key={room.id}
                type="button"
                className="entity"
                onClick={() => toggleFavourite(room.id)}
                aria-pressed={favourite}
              >
                <span className="sheet__dot" style={{ background: room.tint }} />
                <span className="entity__names">
                  <span className="entity__name">{room.name}</span>
                  <span className="entity__id">{room.id}</span>
                </span>
                <span className={`switch${favourite ? ' switch--on' : ''}`}>
                  <span className="switch__knob" />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" className="alarm__mode" onClick={resetConfig}>
        Standaardwaarden herstellen
      </button>
    </Sheet>
  );
}
