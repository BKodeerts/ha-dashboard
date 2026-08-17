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
  const hassRef = useRef(hass);
  hassRef.current = hass;

  /*
   * The mount effect must not depend on `hass` itself. Home Assistant replaces
   * that object on every state change — several times a second in a busy house —
   * so a `[hass]` dependency tore every embedded card down and rebuilt it, which
   * is what made them flash. It reads the current one through a ref instead.
   *
   * The config likewise arrives as a fresh object whenever the config memo
   * recomputes, so the identity of `config` is not a safe remount signal either;
   * the serialised value is.
   */
  const ready = hass !== null;
  const configKey = config ? JSON.stringify(config) : null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !ready || !configKey) return;

    let cancelled = false;

    const mount = async () => {
      let element: (HTMLElement & { hass?: HomeAssistant; config?: unknown }) | null = null;
      const cardConfig = JSON.parse(configKey) as LovelaceCardConfig;

      if (customElements.get('hui-card')) {
        element = document.createElement('hui-card');
        element.config = cardConfig;
      } else if (window.loadCardHelpers) {
        const helpers = await window.loadCardHelpers();
        element = (await helpers.createCardElement(cardConfig)) as HTMLElement & {
          hass?: HomeAssistant;
        };
      }

      if (!element || cancelled) return;
      element.hass = hassRef.current ?? undefined;
      cardRef.current = element;
      container.replaceChildren(element);
    };

    void mount();

    return () => {
      cancelled = true;
      cardRef.current = null;
      container.replaceChildren();
    };
  }, [ready, configKey]);

  // Keep the card's `hass` fresh without remounting it.
  useEffect(() => {
    if (cardRef.current && hass) cardRef.current.hass = hass;
  }, [hass]);

  if (!hass || !config) {
    return <div className="sheet__footnote lovelace lovelace--empty">{fallback}</div>;
  }

  return <div className="lovelace" ref={containerRef} />;
}
