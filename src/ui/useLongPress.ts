import { useRef } from 'react';
import { openMoreInfo } from '../ha/moreInfo';

/** Matches the browser's own press-and-hold convention (context menus, etc). */
const LONG_PRESS_MS = 500;
/** A pointer that travelled further than this was a scroll or a drag, not a hold. */
const TAP_SLOP_PX = 10;

/**
 * Every entity-bound control gets this for free: hold it down and Home
 * Assistant's native more-info dialog opens for `entityId`, exactly like
 * tapping the same entity in HA's own Lovelace UI does. A short press still
 * fires `onClick` as normal — this only ever *adds* the long-press gesture on
 * top of it, and does nothing at all when `entityId` is `undefined` (nothing
 * to show, e.g. a control backed by more than one entity).
 *
 * Spread the return value onto the element in place of a plain `onClick`.
 * Pointer-based, so it works the same for touch and mouse, and the `onClick`
 * it wraps still fires from a keyboard activation — the pointer handlers
 * never run for those, so nothing is ever suppressed.
 */
export function useLongPress({
  entityId,
  onClick,
}: {
  entityId: string | undefined;
  onClick?: (event: React.SyntheticEvent) => void;
}): {
  onPointerDown(event: React.PointerEvent): void;
  onPointerMove(event: React.PointerEvent): void;
  onPointerUp(event: React.PointerEvent): void;
  onPointerCancel(): void;
  onClick(event: React.SyntheticEvent): void;
} {
  const pointerId = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set only once the hold has actually fired more-info, so the click that
  // follows the same press-release can be told apart from a normal tap.
  const suppressClick = useRef(false);

  const clear = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    pointerId.current = null;
    start.current = null;
  };

  return {
    onPointerDown(event) {
      if (!entityId) return;
      pointerId.current = event.pointerId;
      start.current = { x: event.clientX, y: event.clientY };
      const target = event.currentTarget;
      timer.current = setTimeout(() => {
        timer.current = null;
        suppressClick.current = true;
        openMoreInfo(target, entityId);
      }, LONG_PRESS_MS);
    },
    onPointerMove(event) {
      if (pointerId.current !== event.pointerId || !start.current) return;
      const dx = event.clientX - start.current.x;
      const dy = event.clientY - start.current.y;
      if (Math.hypot(dx, dy) > TAP_SLOP_PX) clear();
    },
    onPointerUp(event) {
      if (pointerId.current === event.pointerId) clear();
    },
    onPointerCancel() {
      clear();
    },
    onClick(event) {
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onClick?.(event);
    },
  };
}
