import type { OpeningsSummary } from '../../ha/selectors';
import type { Opening } from '../../ha/types';
import { Icon } from '../../ui/Icon';
import { useLongPress } from '../../ui/useLongPress';
import { Sheet, SheetClose } from '../Sheet';

function OpeningRow({ opening }: { opening: Opening }) {
  const longPress = useLongPress({ entityId: opening.entityId });
  return (
    <div
      className="opening"
      onPointerDown={longPress.onPointerDown}
      onPointerMove={longPress.onPointerMove}
      onPointerUp={longPress.onPointerUp}
      onPointerCancel={longPress.onPointerCancel}
    >
      <div className="opening__tile">
        <Icon name={opening.deviceClass === 'window' ? 'window' : 'door'} size={16} />
      </div>
      <div className="opening__names">
        <div className="opening__name">{`${opening.room} · ${opening.name}`}</div>
        <div className="opening__meta">{`sinds ${opening.since} · ${opening.entityId}`}</div>
      </div>
    </div>
  );
}

/** Scrolls, because up to 13 openings can be listed at once. */
export function OpeningsSheet({
  openings,
  onClose,
}: {
  openings: OpeningsSummary;
  onClose(): void;
}) {
  return (
    <Sheet onClose={onClose} labelledBy="openings-sheet-title">
      <div className="sheet__head">
        <div className="sheet__tile sheet__tile--warn">
          <Icon name="window" size={18} />
        </div>
        <div className="sheet__titles">
          <div className="sheet__title" id="openings-sheet-title">
            Open
          </div>
          <div className="sheet__subtitle">{`${openings.open.length} van ${openings.total} open`}</div>
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <div className="openings">
        {openings.open.map((opening) => (
          <OpeningRow key={opening.entityId} opening={opening} />
        ))}
      </div>
    </Sheet>
  );
}
