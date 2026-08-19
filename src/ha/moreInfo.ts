/**
 * Opens Home Assistant's own more-info dialog for an entity — the same one
 * every Lovelace card opens on a long press, via
 * `fireEvent(el, 'hass-more-info', { entityId })`.
 *
 * This panel mounts directly into HA's DOM with `embed_iframe: false` (see
 * the README), inside its own shadow root, so the event has to be
 * `composed` to cross that boundary and reach the `<home-assistant>`
 * ancestor that listens for it. Standalone mode has no such ancestor — the
 * dispatch is inert there, which is the correct behaviour outside a real HA
 * frontend.
 */
export function openMoreInfo(target: EventTarget, entityId: string): void {
  target.dispatchEvent(
    new CustomEvent('hass-more-info', {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }),
  );
}
