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
  }

  disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = null;
    this.#mountPoint = null;
  }

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
