import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../ui/Icon';

/**
 * Shared sheet chrome: scrim + panel, with scrim-tap and Escape to dismiss.
 * Only one sheet is ever open, so a single instance handles the key listener.
 *
 * The panel stops 96px above the bottom and the scrim sits *below* the tab bar
 * in the stacking order — v1's sheets covered the bar, which is what made the
 * navigation feel like it disappeared. From 1000px of dashboard width (v7,
 * `data-wide` on `.app`) the CSS turns this into a centred modal: 460px wide,
 * or 680px for `size="wide"` — the weather sheet, whose chart and metrics sit
 * side by side there.
 */
export function Sheet({
  onClose,
  labelledBy,
  size,
  children,
}: {
  onClose(): void;
  labelledBy: string;
  size?: 'wide';
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
        className={`sheet__panel${size === 'wide' ? ' sheet__panel--wide' : ''}`}
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
      <Icon name="close" size={16} />
    </button>
  );
}
