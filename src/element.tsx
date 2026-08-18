import { createRoot, type Root } from 'react-dom/client';
import { App } from './app/App';
import type { ConfigLayer } from './config/config';
import { panelBackend, readSnapshot, standaloneBackend } from './ha/backend';
import { HassProvider } from './ha/HassProvider';
import { mockBackend } from './ha/mock';
import type { HaBackend, HomeAssistant } from './ha/types';
import fontFaces from './ui/fonts.css?inline';
import styles from './ui/styles.css?inline';

/**
 * `@font-face` rules are ignored inside a shadow root, so the self-hosted
 * webfonts are declared on the document instead. They are embedded as data URIs
 * (see scripts/fetch-fonts.mjs) — no CDN, which matters for LAN-only tablets.
 *
 * Set `fonts="off"` on the element to skip this and supply the families yourself.
 */
function ensureFonts(): void {
  if (document.querySelector('style[data-ha-dashboard-fonts]')) return;
  const style = document.createElement('style');
  style.dataset.haDashboardFonts = 'true';
  style.textContent = fontFaces;
  document.head.appendChild(style);
}

type Mode = 'panel' | 'standalone' | 'mock';

/**
 * The single mount point for every target: HA's `panel_custom` sets `hass` on it,
 * the standalone build creates it with `mode="standalone"`, and `mode="mock"`
 * runs the whole UI against the mock backend with no Home Assistant at all.
 *
 * Everything renders inside a shadow root with the stylesheet inlined, so the
 * dashboard cannot style — or be styled by — the HA frontend around it.
 */
export class HaDashboardPanel extends HTMLElement {
  static observedAttributes = ['mode'];

  #root: Root | null = null;
  #mountPoint: HTMLDivElement | null = null;
  #hass: HomeAssistant | null = null;
  #backend: HaBackend | null = null;
  #panelConfig: ConfigLayer | undefined;
  #starting = false;
  #darkMode: boolean | undefined;
  #darkModeListeners = new Set<(dark: boolean | undefined) => void>();
  #lastTouchY: number | null = null;

  /* ── properties HA's panel_custom sets ─────────────────────────────────── */

  set hass(value: HomeAssistant) {
    const first = this.#hass === null;
    this.#hass = value;
    if (first) {
      this.#darkMode = value.themes?.darkMode;
      void this.#start();
      return;
    }

    /* HA replaces `hass` on every change, its own theme included. Only the
       scheme is worth waking React for; everything else rides the state feed. */
    const dark = value.themes?.darkMode;
    if (dark !== this.#darkMode) {
      this.#darkMode = dark;
      for (const listener of this.#darkModeListeners) listener(dark);
    }
  }

  get hass(): HomeAssistant | null {
    return this.#hass;
  }

  /** `panel.config` carries whatever sits under `config:` in configuration.yaml. */
  set panel(value: { config?: ConfigLayer } | null) {
    this.#panelConfig = value?.config;
  }

  set narrow(_value: boolean) {
    /* the layout is responsive on its own */
  }

  set route(_value: unknown) {
    /* single-view panel */
  }

  connectedCallback(): void {
    if (this.getAttribute('fonts') !== 'off') ensureFonts();
    if (this.#mode() !== 'panel') void this.#start();
    this.addEventListener('touchstart', this.#onTouchStart, { passive: true });
    this.addEventListener('touchmove', this.#onTouchMove, { passive: false });
    this.addEventListener('touchend', this.#onTouchEnd, { passive: true });
    this.addEventListener('touchcancel', this.#onTouchEnd, { passive: true });
  }

  disconnectedCallback(): void {
    this.removeEventListener('touchstart', this.#onTouchStart);
    this.removeEventListener('touchmove', this.#onTouchMove);
    this.removeEventListener('touchend', this.#onTouchEnd);
    this.removeEventListener('touchcancel', this.#onTouchEnd);
    this.#root?.unmount();
    this.#root = null;
    this.#mountPoint = null;
  }

  /*
   * The HA companion app hosts this panel in a WKWebView. `.app` sets
   * `overflow: hidden` so only `.scroll`/`.view`/`.sheet__panel` are meant to
   * move, but once one of those hits its own scroll edge, the same drag can
   * hand off to WKWebView's native page-level bounce instead of stopping —
   * `overscroll-behavior: contain` doesn't reliably stop that hand-off in this
   * host. That drags everything in normal flow (the status pill, the section
   * head) out from under the fixed header. This is the standard fix: block
   * the browser's default pan for a touch unless it started inside one of our
   * own scrollers and that scroller still has room to move in that direction.
   */
  #onTouchStart = (event: TouchEvent): void => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    this.#lastTouchY = touch?.clientY ?? null;
  };

  #onTouchMove = (event: TouchEvent): void => {
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    if (!touch || this.#lastTouchY === null) return;
    const y = touch.clientY;
    const draggingDown = y > this.#lastTouchY;
    this.#lastTouchY = y;

    const scroller = event
      .composedPath()
      .find(
        (node): node is HTMLElement =>
          node instanceof HTMLElement &&
          (node.classList.contains('scroll') ||
            node.classList.contains('view') ||
            node.classList.contains('sheet__panel')),
      );

    if (!scroller) {
      event.preventDefault();
      return;
    }

    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((atTop && draggingDown) || (atBottom && !draggingDown)) {
      event.preventDefault();
    }
  };

  #onTouchEnd = (): void => {
    this.#lastTouchY = null;
  };

  #mode(): Mode {
    const attribute = this.getAttribute('mode');
    if (attribute === 'standalone' || attribute === 'mock') return attribute;
    return 'panel';
  }

  #ensureShadow(): HTMLDivElement {
    if (this.#mountPoint) return this.#mountPoint;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;
    const mount = document.createElement('div');
    mount.className = 'root';
    shadow.replaceChildren(style, mount);
    this.#mountPoint = mount;
    return mount;
  }

  async #start(): Promise<void> {
    if (this.#backend || this.#starting) return;
    this.#starting = true;

    const mount = this.#ensureShadow();
    const root = this.#root ?? createRoot(mount);
    this.#root = root;

    try {
      const mode = this.#mode();
      const backend =
        mode === 'mock'
          ? mockBackend()
          : this.#hass
            ? panelBackend(
                () => this.#hass!,
                (cb) => {
                  this.#darkModeListeners.add(cb);
                  return () => this.#darkModeListeners.delete(cb);
                },
              )
            : await standaloneBackend();

      this.#backend = backend;

      root.render(
        <HassProvider
          backend={backend}
          initialEntities={readSnapshot() ?? undefined}
          yamlConfig={this.#panelConfig}
        >
          <App />
        </HassProvider>,
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      root.render(<div className="centered">Verbinden mislukt — {detail}</div>);
    } finally {
      this.#starting = false;
    }
  }
}

if (!customElements.get('ha-dashboard-panel')) {
  customElements.define('ha-dashboard-panel', HaDashboardPanel);
}
