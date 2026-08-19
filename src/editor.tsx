import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { mergeLayers, type ConfigLayer, type LovelaceCardConfig, type MediaPreset } from './config/config';
import { panelBackend } from './ha/backend';
import { bucketEntities, fetchRegistries, resolveAreaEntities } from './ha/registry';
import { friendlyName } from './ha/selectors';
import type { HassEntities, HomeAssistant, Registries } from './ha/types';

const domainEntities = (states: HassEntities, domain: string): string[] =>
  Object.keys(states)
    .filter((id) => id.startsWith(`${domain}.`))
    .sort();

const entityLabel = (states: HassEntities, id: string): string => `${friendlyName(states, id)} (${id})`;

function EntityPicker({
  label,
  value,
  options,
  states,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  states: HassEntities;
  onChange(value: string | undefined): void;
}) {
  return (
    <label className="hdpe__field">
      <span className="hdpe__field-label">{label}</span>
      <select value={value ?? ''} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">— geen —</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {entityLabel(states, id)}
          </option>
        ))}
      </select>
    </label>
  );
}

function PresetRows({
  entityId,
  states,
  presets,
  onChange,
}: {
  entityId: string;
  states: HassEntities;
  presets: MediaPreset[];
  onChange(next: MediaPreset[]): void;
}) {
  const update = (index: number, patch: Partial<MediaPreset>) => {
    onChange(presets.map((preset, i) => (i === index ? { ...preset, ...patch } : preset)));
  };
  const remove = (index: number) => onChange(presets.filter((_, i) => i !== index));
  const add = () =>
    onChange([...presets, { name: '', media_content_id: '', media_content_type: 'music' }]);

  return (
    <div className="hdpe__presets">
      <div className="hdpe__field-label">{entityLabel(states, entityId)}</div>
      {presets.map((preset, index) => (
        <div className="hdpe__preset-row" key={index}>
          <input
            type="text"
            placeholder="naam"
            value={preset.name}
            onChange={(event) => update(index, { name: event.target.value })}
          />
          <input
            type="text"
            placeholder="media_content_id"
            value={preset.media_content_id}
            onChange={(event) => update(index, { media_content_id: event.target.value })}
          />
          <input
            type="text"
            placeholder="media_content_type"
            value={preset.media_content_type}
            onChange={(event) => update(index, { media_content_type: event.target.value })}
          />
          <button type="button" className="hdpe__remove" onClick={() => remove(index)} aria-label="preset verwijderen">
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="hdpe__add" onClick={add}>
        + preset toevoegen
      </button>
    </div>
  );
}

/**
 * The GUI half of the Lovelace card editor, covering exactly the settings
 * that used to require hand-written YAML with no in-app alternative — power,
 * the car, media presets — plus "media per kamer", which used to be an
 * admin-only setting written straight into HA's system store. All of it is
 * just the card's own YAML now, edited with form controls instead of a text
 * box. Personal preferences (theme, favourites, tracked person, …) stay in
 * the dashboard's own Settings view — they are not here.
 */
function Editor({
  hass,
  config,
  onChange,
}: {
  hass: HomeAssistant;
  config: LovelaceCardConfig;
  onChange(config: LovelaceCardConfig): void;
}) {
  const [registries, setRegistries] = useState<Registries | null>(null);
  const hassRef = useRef(hass);
  hassRef.current = hass;

  useEffect(() => {
    let cancelled = false;
    const backend = panelBackend(() => hassRef.current);
    fetchRegistries(backend)
      .then((next) => {
        if (!cancelled) setRegistries(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const states = hass.states;
  const sensors = useMemo(() => domainEntities(states, 'sensor'), [states]);
  const mediaPlayers = useMemo(() => domainEntities(states, 'media_player'), [states]);

  const power: NonNullable<ConfigLayer['power']> = (config.power as ConfigLayer['power']) ?? {
    loads: [],
    scale: 2000,
  };
  const car: NonNullable<ConfigLayer['car']> = (config.car as ConfigLayer['car']) ?? {};
  const mediaEntity: NonNullable<ConfigLayer['mediaEntity']> =
    (config.mediaEntity as ConfigLayer['mediaEntity']) ?? {};
  const mediaPresets: NonNullable<ConfigLayer['mediaPresets']> =
    (config.mediaPresets as ConfigLayer['mediaPresets']) ?? {};

  const patch = (next: ConfigLayer) =>
    onChange(mergeLayers(config as ConfigLayer, next) as LovelaceCardConfig);

  const areasWithMedia = useMemo(() => {
    if (!registries) return [];
    const byArea = resolveAreaEntities(registries);
    return registries.areas
      .map((area) => ({
        area,
        players: bucketEntities(byArea.get(area.area_id) ?? [], area.name, states).mediaPlayers,
      }))
      .filter(({ players }) => players.length > 0);
  }, [registries, states]);

  return (
    <div className="hdpe">
      <section className="hdpe__section">
        <h3 className="hdpe__title">Stroom</h3>
        <EntityPicker
          label="Zon"
          value={power.solar}
          options={sensors}
          states={states}
          onChange={(value) => patch({ power: { solar: value } })}
        />
        <EntityPicker
          label="Verbruik"
          value={power.consumption}
          options={sensors}
          states={states}
          onChange={(value) => patch({ power: { consumption: value } })}
        />
        <EntityPicker
          label="Net"
          value={power.grid}
          options={sensors}
          states={states}
          onChange={(value) => patch({ power: { grid: value } })}
        />
        <label className="hdpe__field">
          <span className="hdpe__field-label">Schaal (W)</span>
          <input
            type="number"
            min={0}
            value={power.scale ?? 2000}
            onChange={(event) => patch({ power: { scale: Number(event.target.value) || 0 } })}
          />
        </label>
        <label className="hdpe__field">
          <span className="hdpe__field-label">Top loads (ctrl/cmd-klik voor meerdere)</span>
          <select
            multiple
            size={6}
            value={power.loads ?? []}
            onChange={(event) =>
              patch({ power: { loads: Array.from(event.target.selectedOptions, (o) => o.value) } })
            }
          >
            {sensors.map((id) => (
              <option key={id} value={id}>
                {entityLabel(states, id)}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="hdpe__section">
        <h3 className="hdpe__title">Auto</h3>
        <label className="hdpe__field">
          <span className="hdpe__field-label">Naam</span>
          <input
            type="text"
            value={car.name ?? ''}
            onChange={(event) => patch({ car: { name: event.target.value || undefined } })}
          />
        </label>
        <EntityPicker
          label="Batterij"
          value={car.battery}
          options={sensors}
          states={states}
          onChange={(value) => patch({ car: { battery: value } })}
        />
        <EntityPicker
          label="Bereik"
          value={car.range}
          options={sensors}
          states={states}
          onChange={(value) => patch({ car: { range: value } })}
        />
      </section>

      <section className="hdpe__section">
        <h3 className="hdpe__title">Media per kamer</h3>
        {areasWithMedia.map(({ area, players }) => (
          <label className="hdpe__field" key={area.area_id}>
            <span className="hdpe__field-label">{area.name}</span>
            <select
              value={mediaEntity[area.area_id] ?? ''}
              onChange={(event) =>
                patch({ mediaEntity: { [area.area_id]: event.target.value || undefined } })
              }
            >
              <option value="">automatisch</option>
              {players.map((id) => (
                <option key={id} value={id}>
                  {entityLabel(states, id)}
                </option>
              ))}
            </select>
          </label>
        ))}
        {registries && areasWithMedia.length === 0 && (
          <div className="hdpe__note">geen kamers met media_player-entiteiten</div>
        )}
      </section>

      <section className="hdpe__section">
        <h3 className="hdpe__title">Media-presets</h3>
        {mediaPlayers.map((entityId) => (
          <PresetRows
            key={entityId}
            entityId={entityId}
            states={states}
            presets={mediaPresets[entityId] ?? []}
            onChange={(next) => patch({ mediaPresets: { [entityId]: next } })}
          />
        ))}
        {mediaPlayers.length === 0 && (
          <div className="hdpe__note">geen media_player-entiteiten gevonden</div>
        )}
      </section>
    </div>
  );
}

const EDITOR_STYLES = `
.hdpe { display: flex; flex-direction: column; gap: 20px; padding: 4px 0 12px; font-family: inherit; color: var(--primary-text-color, inherit); }
.hdpe__section { display: flex; flex-direction: column; gap: 10px; }
.hdpe__title { margin: 0; font-size: 14px; font-weight: 600; color: var(--secondary-text-color, inherit); }
.hdpe__field { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.hdpe__field-label { font-size: 13px; color: var(--secondary-text-color, inherit); }
.hdpe__field select, .hdpe__field input {
  font: inherit;
  color: var(--primary-text-color, inherit);
  background: var(--card-background-color, transparent);
  border: 1px solid var(--divider-color, #ccc);
  border-radius: 6px;
  padding: 6px 8px;
}
.hdpe__note { font-size: 13px; color: var(--secondary-text-color, inherit); }
.hdpe__presets { display: flex; flex-direction: column; gap: 6px; padding: 8px; border: 1px solid var(--divider-color, #ccc); border-radius: 8px; }
.hdpe__preset-row { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 6px; }
.hdpe__preset-row input {
  font: inherit;
  color: var(--primary-text-color, inherit);
  background: var(--card-background-color, transparent);
  border: 1px solid var(--divider-color, #ccc);
  border-radius: 6px;
  padding: 6px 8px;
  min-width: 0;
}
.hdpe__remove, .hdpe__add {
  font: inherit;
  color: var(--primary-text-color, inherit);
  background: transparent;
  border: 1px solid var(--divider-color, #ccc);
  border-radius: 6px;
  cursor: pointer;
  padding: 6px 10px;
}
.hdpe__add { align-self: flex-start; }
`;

function ensureEditorStyles(): void {
  if (document.querySelector('style[data-ha-dashboard-editor-styles]')) return;
  const style = document.createElement('style');
  style.dataset.haDashboardEditorStyles = 'true';
  style.textContent = EDITOR_STYLES;
  document.head.appendChild(style);
}

/**
 * HA mounts this as the "Edit card" dialog's GUI tab, per Lovelace's
 * `getConfigElement()` contract: it receives `hass` and `setConfig()` the
 * same way the card itself does, and reports changes by dispatching
 * `config-changed` — HA owns writing the result back into the dashboard's
 * storage. It renders in the light DOM (no shadow root) so the HA theme's
 * CSS custom properties reach the form controls directly.
 */
class HaDashboardPanelEditor extends HTMLElement {
  #root: Root | null = null;
  #hass: HomeAssistant | null = null;
  #config: LovelaceCardConfig = { type: 'custom:ha-dashboard-panel' };

  setConfig(config: LovelaceCardConfig): void {
    this.#config = config;
    this.#render();
  }

  set hass(value: HomeAssistant) {
    this.#hass = value;
    this.#render();
  }

  connectedCallback(): void {
    ensureEditorStyles();
    this.#render();
  }

  disconnectedCallback(): void {
    this.#root?.unmount();
    this.#root = null;
  }

  #onChange = (config: LovelaceCardConfig): void => {
    this.#config = config;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }),
    );
  };

  #render(): void {
    if (!this.isConnected || !this.#hass) return;
    if (!this.#root) this.#root = createRoot(this);
    this.#root.render(<Editor hass={this.#hass} config={this.#config} onChange={this.#onChange} />);
  }
}

if (!customElements.get('ha-dashboard-panel-editor')) {
  customElements.define('ha-dashboard-panel-editor', HaDashboardPanelEditor);
}
