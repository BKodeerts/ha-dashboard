import { createContext, useContext, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * v7's adaptive shell: one layout for phone → desktop, driven by the
 * dashboard's *own* width rather than the window's. As a Lovelace card this
 * app sits inside HA's own layout (a sidebar, a view with columns), so
 * `window.innerWidth` measures the wrong box — see
 * design_handoff_ha_dashboard_v7/README.md §1.
 */
export interface Layout {
  /** The measured width of `.app`, or 0 until the first measurement lands. */
  width: number;
  /** Room-grid columns: 2 / 3 / 4. */
  cols: 2 | 3 | 4;
  /** ≥ 760: Energie, Netwerk and Instellingen split into two columns. */
  split: boolean;
  /** ≥ 1000: sheets become centred modals and the tab bar gains its shadow. */
  wide: boolean;
}

export const SPLIT_AT = 760;
export const MID_AT = 700;
export const WIDE_AT = 1000;

/** Unmeasured means narrow — a phone is the one case that must never flash a
    desktop layout first. */
export function layoutFor(width: number): Layout {
  return {
    width,
    cols: width >= WIDE_AT ? 4 : width >= MID_AT ? 3 : 2,
    split: width >= SPLIT_AT,
    wide: width >= WIDE_AT,
  };
}

/**
 * The element's content-box width, via `ResizeObserver`, measured before
 * paint. No window fallback: a browser without `ResizeObserver` stays on the
 * narrow layout, which works everywhere.
 */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = element.clientWidth;
      if (next) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

export const LayoutContext = createContext<Layout>(layoutFor(0));

export const useLayout = (): Layout => useContext(LayoutContext);
