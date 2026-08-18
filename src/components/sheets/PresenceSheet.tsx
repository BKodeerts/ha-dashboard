import { useHass } from '../../ha/HassProvider';
import { formatTime, friendlyName } from '../../ha/selectors';
import { Icon } from '../../ui/Icon';
import { LovelaceCard } from '../LovelaceCard';
import { Sheet, SheetClose } from '../Sheet';

/**
 * One person, opened from their chip in the header. v4 made the header a list
 * rather than a fixture, so this takes the entity id it was tapped with instead
 * of reading a single configured person.
 *
 * The map itself is HA's card — no second Leaflet in this bundle.
 */
export function PresenceSheet({
  entityId,
  onClose,
}: {
  entityId: string;
  onClose(): void;
}) {
  const { entities, config } = useHass();
  const state = entities[entityId];
  const home = state?.state === 'home';
  const since = state ? formatTime(new Date(state.last_changed)) : undefined;

  const mapConfig =
    config.lovelace.map ?? { type: 'map', entities: [entityId], hours_to_show: 12, dark_mode: true };

  return (
    <Sheet onClose={onClose} labelledBy="presence-sheet-title">
      <div className="sheet__head">
        <div className={`sheet__tile${home ? ' sheet__tile--accent' : ''}`}>
          <Icon name="mapMarker" size={18} />
        </div>
        <div className="sheet__titles">
          <div className="sheet__title" id="presence-sheet-title">
            {friendlyName(entities, entityId)}
          </div>
          <div className="sheet__subtitle">
            {`${home ? 'thuis' : (state?.state ?? 'weg')}${since ? ` · sinds ${since}` : ''}`}
          </div>
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <LovelaceCard config={mapConfig} fallback={`map · ${entityId}`} />
    </Sheet>
  );
}
