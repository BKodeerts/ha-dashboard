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

  const power: NonNullable<ConfigLayer['power']> = (config.power as ConfigLayer['power']) ?? {
    loads: [],
    excludeLoads: [],
    minWatts: 0,
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

  /**
   * The room card only ever plays one player per room (`mediaEntity[area]` ??
   * the area's first candidate — the same pick `buildRooms` makes for the
   * dashboard itself), so that is the set worth showing preset editors for.
   * Every other `media_player.*` in the house is a picker option above, never
   * a preset target.
   */
  const usedMediaPlayers = useMemo(() => {
    const ids = new Set<string>();
    for (const { area, players } of areasWithMedia) {
      const selected = mediaEntity[area.area_id] ?? players[0];
      if (selected) ids.add(selected);
    }
    return [...ids].sort();
  }, [areasWithMedia, mediaEntity]);

  return (
    <div className="hdpe">
      <style>{EDITOR_STYLES}</style>
      <section className="hdpe__section">
        <h3 className="hdpe__title">Stroom</h3>
        <div className="hdpe__note">
          Zon, verbruik, net en de apparatenlijst worden automatisch herkend (elke sensor met
          <code> device_class: power</code>) — hier hoeft niets gekozen te worden. Raadt de
          herkenning verkeerd, dan overschrijf je <code>power.solar</code>/<code>power.consumption</code>/
          <code>power.grid</code>/<code>power.loads</code> in de YAML van de kaart zelf.
        </div>
        <label className="hdpe__field">
          <span className="hdpe__field-label">Minimum vermogen (W) — apparaten eronder vallen weg uit "Apparaten nu"</span>
          <input
            type="number"
            min={0}
            value={power.minWatts ?? 0}
            onChange={(event) => patch({ power: { minWatts: Number(event.target.value) || 0 } })}
          />
        </label>
        <label className="hdpe__field">
          <span className="hdpe__field-label">
            Uitgesloten sensoren — één per regel, <code>*</code> als jokerteken (bv.
            <code> sensor.*_apparent_power</code>, <code>sensor.grid_power</code>)
          </span>
          <textarea
            rows={3}
            value={(power.excludeLoads ?? []).join('\n')}
            onChange={(event) =>
              patch({
                power: {
                  excludeLoads: event.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                },
              })
            }
          />
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
        {usedMediaPlayers.map((entityId) => (
          <PresetRows
            key={entityId}
            entityId={entityId}
            states={states}
            presets={mediaPresets[entityId] ?? []}
            onChange={(next) => patch({ mediaPresets: { [entityId]: next } })}
          />
        ))}
        {registries && usedMediaPlayers.length === 0 && (
          <div className="hdpe__note">geen kamer heeft nog een media_player geselecteerd</div>
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
.hdpe__field select, .hdpe__field input, .hdpe__field textarea {
  font: inherit;
  color: var(--primary-text-color, inherit);
  background: var(--card-background-color, transparent);
  border: 1px solid var(--divider-color, #ccc);
  border-radius: 6px;
  padding: 6px 8px;
}
.hdpe__field textarea { resize: vertical; font-family: var(--code-font-family, monospace); font-size: 13px; }
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

/**
 * HA mounts this as the "Edit card" dialog's GUI tab, per Lovelace's
 * `getConfigElement()` contract: it receives `hass` and `setConfig()` the
 * same way the card itself does, and reports changes by dispatching
 * `config-changed` — HA owns writing the result back into the dashboard's
 * storage. It renders in the light DOM (no shadow root) so the HA theme's
 * CSS custom properties reach the form controls directly — but the dialog
 * *hosting* this element is itself inside a shadow root, so the stylesheet
 * has to travel as part of this element's own render tree (the `<style>` in
 * `Editor` below), not as a global `document.head` rule: a shadow boundary
 * blocks that from reaching in.
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
