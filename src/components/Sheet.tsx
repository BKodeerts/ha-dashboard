import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';

/**
 * Shared bottom-sheet chrome: scrim + panel, with scrim-tap and Escape to
 * dismiss. Only one sheet is ever open, so a single instance handles the key
 * listener. On desktop the CSS turns this into a centred modal.
 */
export function Sheet({
  onClose,
  labelledBy,
  wideGap,
  children,
}: {
  onClose(): void;
  labelledBy: string;
  wideGap?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Move focus into the sheet so Tab and screen readers follow the overlay.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="sheet">
      <button
        type="button"
        className="sheet__scrim"
        aria-label="Sluiten"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        className={`sheet__panel${wideGap ? ' sheet__panel--gap18' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}

export function SheetClose({ onClose }: { onClose(): void }) {
  return (
    <button type="button" className="sheet__close" onClick={onClose} aria-label="Sluiten">
      <Icon name="close" size={15} />
    </button>
  );
}
