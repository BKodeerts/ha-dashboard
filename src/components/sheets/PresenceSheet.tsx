import { useHass } from '../../ha/HassProvider';
import { formatTime, type PresenceInfo } from '../../ha/selectors';
import { Icon } from '../../ui/Icon';
import { LovelaceCard } from '../LovelaceCard';
import { Sheet, SheetClose } from '../Sheet';

/** The map itself is HA's card — no second Leaflet in this bundle. */
export function PresenceSheet({
  presence,
  onClose,
}: {
  presence: PresenceInfo;
  onClose(): void;
}) {
  const { entities, config } = useHass();
  const state = presence.entityId ? entities[presence.entityId] : undefined;
  const since = state ? formatTime(new Date(state.last_changed)) : undefined;

  const mapConfig =
    config.lovelace.map ??
    (presence.entityId
      ? { type: 'map', entities: [presence.entityId], hours_to_show: 12, dark_mode: true }
      : undefined);

  return (
    <Sheet onClose={onClose} labelledBy="presence-sheet-title">
      <div className="sheet__head">
        <div className={`sheet__tile${presence.home ? ' sheet__tile--accent' : ''}`}>
          <Icon name="mapMarker" size={18} />
        </div>
        <div className="sheet__titles">
          <div className="sheet__title" id="presence-sheet-title">
            {presence.name}
          </div>
          <div className="sheet__subtitle">
            {`${presence.home ? 'thuis' : (state?.state ?? 'weg')}${since ? ` · sinds ${since}` : ''}`}
          </div>
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <LovelaceCard config={mapConfig} fallback={`map · ${presence.entityId ?? 'person'}`} />
    </Sheet>
  );
}
