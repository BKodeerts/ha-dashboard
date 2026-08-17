import { useEffect, useRef } from 'react';
import type { LovelaceCardConfig } from '../config/config';
import { useHass } from '../ha/HassProvider';
import type { HomeAssistant } from '../ha/types';

interface CardHelpers {
  createCardElement(config: LovelaceCardConfig): Promise<HTMLElement>;
}

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<CardHelpers>;
  }
}

/**
 * Mounts a real Lovelace card inside the shell. Energy, history, map, camera and
 * forecast stay HA's own cards — that is where its frontend is worth more than a
 * rewrite, and where the old dashboard's maintenance came from.
 *
 * Prefers `hui-card` (available inside a custom panel), falling back to the card
 * helpers. Outside HA — standalone build or mock mode — there is no card
 * registry, so the sheet shows the footnote naming what would be embedded here.
 */
export function LovelaceCard({
  config,
  fallback,
}: {
  config: LovelaceCardConfig | undefined;
  fallback: string;
}) {
  const { hass } = useHass();
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<(HTMLElement & { hass?: HomeAssistant; config?: unknown }) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !hass || !config) return;

    let cancelled = false;

    const mount = async () => {
      let element: (HTMLElement & { hass?: HomeAssistant; config?: unknown }) | null = null;

      if (customElements.get('hui-card')) {
        element = document.createElement('hui-card');
        element.config = config;
      } else if (window.loadCardHelpers) {
        const helpers = await window.loadCardHelpers();
        element = (await helpers.createCardElement(config)) as HTMLElement & {
          hass?: HomeAssistant;
        };
      }

      if (!element || cancelled) return;
      element.hass = hass;
      cardRef.current = element;
      container.replaceChildren(element);
    };

    void mount();

    return () => {
      cancelled = true;
      cardRef.current = null;
      container.replaceChildren();
    };
    // `config` is a stable object from the config store; remount only if it changes.
  }, [hass, config]);

  // Keep the card's `hass` fresh without remounting it.
  useEffect(() => {
    if (cardRef.current && hass) cardRef.current.hass = hass;
  }, [hass]);

  if (!hass || !config) {
    return <div className="sheet__footnote lovelace lovelace--empty">{fallback}</div>;
  }

  return <div className="lovelace" ref={containerRef} />;
}
