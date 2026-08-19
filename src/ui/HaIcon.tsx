import { useEffect, useRef } from 'react';

/**
 * Renders whatever icon Home Assistant itself resolved for something — an
 * area's own `icon`, exactly as set in Settings → Areas & Zones — via HA's
 * own `<ha-icon>` custom element, the same registry `LovelaceCard` borrows
 * `hui-card` from. Areas carry arbitrary MDI icons (a teddy bear, a rocking
 * horse, a kitchen bin — not a fixed set of "room type" glyphs), so there is
 * nothing to map on our side: `ha-icon` resolves the name itself from HA's
 * own bundled icon data.
 *
 * `ha-icon` is only registered inside a real HA frontend. Outside it
 * (mock/standalone) this renders nothing rather than a stand-in glyph.
 */
export function HaIcon({
  icon,
  className,
  color,
}: {
  icon: string | undefined;
  className?: string;
  color?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !icon) return;
    const element = document.createElement('ha-icon') as HTMLElement & { icon: string };
    element.icon = icon;
    if (color) element.style.color = color;
    container.replaceChildren(element);
    return () => container.replaceChildren();
  }, [icon, color]);

  if (!icon || !customElements.get('ha-icon')) return null;

  return <div className={className} ref={containerRef} />;
}
