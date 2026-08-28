import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  mergeLayers,
  normalizePowerDevice,
  type ConfigLayer,
  type LovelaceCardConfig,
  type MediaPreset,
  type PowerDeviceEntry,
} from './config/config';
import { panelBackend } from './ha/backend';
import { fetchEnergyPrefs, type EnergyPrefs } from './ha/energyPrefs';
import { browseMedia, type BrowseMediaItem } from './ha/media';
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

/** One level of the "Bladeren" breadcrumb — enough to browse back into. */
type BrowseCrumb = { title: string; media_content_id: string; media_content_type: string };

/**
 * `sendMessagePromise` (and so `browseMedia`) rejects with HA's raw WebSocket
 * error frame — a plain `{ code, message }` object, never an `Error` — so
 * `String(err)` on it prints `"[object Object]"` instead of the reason.
 */
function describeBrowseError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const { message, code } = err as { message?: unknown; code?: unknown };
    if (typeof message === 'string' && message) return message;
    if (typeof code === 'string' && code) return code;
  }
  return String(err);
}

/**
 * Walks a media player's own browse tree (Favorites, Playlists, …) instead of
 * asking someone to type a `media_content_id`/`media_content_type` by hand —
 * the values that trips people up most (e.g. copying the resolved, session-
 * bound stream URL off "currently playing" instead of a stable favourite id).
 * Picking a playable item hands its real id/type straight to the caller.
 */
function MediaBrowser({
  hass,
  entityId,
  onPick,
  onClose,
}: {
  hass: HomeAssistant;
  entityId: string;
  onPick(preset: MediaPreset): void;
  onClose(): void;
}) {
  const hassRef = useRef(hass);
  hassRef.current = hass;
  const [path, setPath] = useState<BrowseCrumb[]>([]);
  const [items, setItems] = useState<BrowseMediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    const backend = panelBackend(() => hassRef.current);
    const target = path[path.length - 1];
    browseMedia(backend, entityId, target)
      .then((node) => {
        if (!cancelled) setItems(node.children ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(describeBrowseError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [entityId, path]);

  const pick = (item: BrowseMediaItem) =>
    onPick({
      name: item.title,
      media_content_id: item.media_content_id,
      media_content_type: item.media_content_type,
    });

  return (
    <div className="hdpe__browser">
      <div className="hdpe__browser-crumbs">
        <button type="button" onClick={() => setPath([])} disabled={path.length === 0}>
          begin
        </button>
        {path.map((crumb, index) => (
          <span key={crumb.media_content_id}>
            {' › '}
            <button
              type="button"
              onClick={() => setPath(path.slice(0, index + 1))}
              disabled={index === path.length - 1}
            >
              {crumb.title}
            </button>
          </span>
        ))}
        <button type="button" className="hdpe__browser-close" onClick={onClose} aria-label="bladeren sluiten">
          ✕
        </button>
      </div>
      {error && <div className="hdpe__note">bladeren mislukt — {error}</div>}
      {!error && items === null && <div className="hdpe__note">laden…</div>}
      {items && items.length === 0 && <div className="hdpe__note">niets gevonden</div>}
      {items && items.length > 0 && (
        <ul className="hdpe__browser-list">
          {items.map((item) => (
            <li key={`${item.media_content_type}:${item.media_content_id}`} className="hdpe__browser-row">
              <button
                type="button"
                className="hdpe__browser-item"
                onClick={() =>
                  item.can_expand
                    ? setPath([
                        ...path,
                        {
                          title: item.title,
                          media_content_id: item.media_content_id,
                          media_content_type: item.media_content_type,
                        },
                      ])
                    : pick(item)
                }
              >
                {item.title}
                {item.can_expand ? ' ›' : ''}
              </button>
              {item.can_play && item.can_expand && (
                <button type="button" className="hdpe__browser-pick" onClick={() => pick(item)}>
                  kies
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PresetRows({
  hass,
  entityId,
  states,
  presets,
  onChange,
  maxVolume,
  onMaxVolumeChange,
}: {
  hass: HomeAssistant;
  entityId: string;
  states: HassEntities;
  presets: MediaPreset[];
  /** `immediate` is set for structural edits (add/remove), unset for typing. */
  onChange(next: MediaPreset[], immediate?: boolean): void;
  /** `undefined` means uncapped — the slider's full 0–100. */
  maxVolume: number | undefined;
  /** `immediate` is set on blur, unset while typing — same as `onChange` above. */
  onMaxVolumeChange(next: number | undefined, immediate?: boolean): void;
}) {
  const [browsing, setBrowsing] = useState(false);

  const update = (index: number, patch: Partial<MediaPreset>) => {
    onChange(presets.map((preset, i) => (i === index ? { ...preset, ...patch } : preset)));
  };
  const remove = (index: number) => onChange(presets.filter((_, i) => i !== index), true);
  const add = () =>
    onChange([...presets, { name: '', media_content_id: '', media_content_type: 'music' }], true);

  return (
    <div className="hdpe__presets">
      <div className="hdpe__field-label">{entityLabel(states, entityId)}</div>
      <label className="hdpe__field">
        <span className="hdpe__field-label">Maximumvolume (%) — leeg = geen limiet</span>
        <input
          type="number"
          min={1}
          max={100}
          placeholder="100"
          value={maxVolume ?? ''}
          onChange={(event) => {
            const raw = event.target.value;
            onMaxVolumeChange(raw === '' ? undefined : Math.max(1, Math.min(100, Number(raw))));
          }}
          onBlur={() => onMaxVolumeChange(maxVolume, true)}
        />
      </label>
      {presets.map((preset, index) => (
        <div className="hdpe__preset-row" key={index}>
          <input
            type="text"
            placeholder="naam"
            value={preset.name}
            onChange={(event) => update(index, { name: event.target.value })}
            onBlur={() => onChange(presets, true)}
          />
          <input
            type="text"
            placeholder="media_content_id"
            value={preset.media_content_id}
            onChange={(event) => update(index, { media_content_id: event.target.value })}
            onBlur={() => onChange(presets, true)}
          />
          <input
            type="text"
            placeholder="media_content_type"
            value={preset.media_content_type}
            onChange={(event) => update(index, { media_content_type: event.target.value })}
            onBlur={() => onChange(presets, true)}
          />
          <button type="button" className="hdpe__remove" onClick={() => remove(index)} aria-label="preset verwijderen">
            ✕
          </button>
        </div>
      ))}
      <div className="hdpe__preset-actions">
        <button type="button" className="hdpe__add" onClick={add}>
          + preset toevoegen
        </button>
        <button type="button" className="hdpe__add" onClick={() => setBrowsing((value) => !value)}>
          {browsing ? 'bladeren sluiten' : 'bladeren…'}
        </button>
      </div>
      {browsing && (
        <MediaBrowser
          hass={hass}
          entityId={entityId}
          onClose={() => setBrowsing(false)}
          onPick={(preset) => onChange([...presets, preset], true)}
        />
      )}
    </div>
  );
}

/**
 * The "apparaten nu" list, as an explicit ordered pick from — not a
 * hand-typed entity id, but a selection of — the household's own
 * "Individual devices" set under Settings → Dashboards → Energy (see
 * `power.devices` in `config/config.ts`). Choosing a subset or a different
 * order here overrides following that list wholesale. Each row also carries
 * an optional display-name override — "TV" instead of "TV power" — for when
 * the entity's own friendly name runs long; left blank, that name is used.
 * Picking or removing a row is a structural edit and emits immediately;
 * typing a name debounces like any other text field, via `onChange`'s
 * `immediate` flag.
 */
function DeviceListRows({
  devices,
  options,
  states,
  onChange,
}: {
  devices: PowerDeviceEntry[];
  options: string[];
  states: HassEntities;
  onChange(next: PowerDeviceEntry[], immediate?: boolean): void;
}) {
  const entries = devices.map(normalizePowerDevice);

  const emit = (next: { entityId: string; name?: string }[], immediate?: boolean) =>
    onChange(
      next.map((entry) => (entry.name ? entry : entry.entityId)),
      immediate,
    );

  const updateEntity = (index: number, entityId: string) =>
    emit(
      entries.map((entry, i) => (i === index ? { ...entry, entityId } : entry)),
      true,
    );
  const updateName = (index: number, name: string) =>
    emit(entries.map((entry, i) => (i === index ? { ...entry, name: name || undefined } : entry)));
  const remove = (index: number) => emit(entries.filter((_, i) => i !== index), true);
  const add = () =>
    emit(
      [...entries, { entityId: options.find((id) => !entries.some((e) => e.entityId === id)) ?? '' }],
      true,
    );

  return (
    <div className="hdpe__field">
      <span className="hdpe__field-label">Apparaten</span>
      {entries.map((entry, index) => (
        <div className="hdpe__preset-row" key={index} style={{ gridTemplateColumns: '1fr 1fr auto' }}>
          <select value={entry.entityId} onChange={(event) => updateEntity(index, event.target.value)}>
            <option value="">— kies —</option>
            {options.map((id) => (
              <option key={id} value={id}>
                {entityLabel(states, id)}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder={entry.entityId ? friendlyName(states, entry.entityId) : 'naam'}
            value={entry.name ?? ''}
            onChange={(event) => updateName(index, event.target.value)}
            onBlur={() => emit(entries, true)}
          />
          <button
            type="button"
            className="hdpe__remove"
            onClick={() => remove(index)}
            aria-label="apparaat verwijderen"
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="hdpe__add" onClick={add} disabled={options.length === 0}>
        + apparaat toevoegen
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
/** How long a burst of keystrokes must go quiet before it's sent upstream. */
const COMMIT_DEBOUNCE_MS = 400;

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
  const [energyPrefs, setEnergyPrefs] = useState<EnergyPrefs | undefined>(undefined);
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
    fetchEnergyPrefs(backend).then((next) => {
      if (!cancelled) setEnergyPrefs(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const states = hass.states;
  const sensors = useMemo(() => domainEntities(states, 'sensor'), [states]);

  /*
   * `onChange` round-trips through HA's edit-card dialog and back down as a
   * new `config` prop (see `HaDashboardPanelEditor` below) — dispatching it
   * on every keystroke made every character retrigger that whole trip, which
   * is what made typing feel laggy. So typing updates `local` straight away
   * for a responsive form, and only *emits* upstream once a field has gone
   * quiet for `COMMIT_DEBOUNCE_MS`. Structural edits (selects, add/remove
   * preset) still emit immediately — there is no "burst" to coalesce there.
   */
  const [local, setLocal] = useState<LovelaceCardConfig>(config);
  const localRef = useRef(local);
  localRef.current = local;
  const lastEmitted = useRef(config);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Adopt config changes that aren't just HA echoing what we just emitted —
    // e.g. switching to the raw YAML tab and back.
    if (config !== lastEmitted.current) {
      lastEmitted.current = config;
      localRef.current = config;
      setLocal(config);
    }
  }, [config]);

  const flush = () => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
    if (lastEmitted.current === localRef.current) return;
    lastEmitted.current = localRef.current;
    onChange(localRef.current);
  };

  // Flush a still-pending edit if the dialog closes before the debounce fires.
  useEffect(() => flush, []);

  const power: NonNullable<ConfigLayer['power']> = (local.power as ConfigLayer['power']) ?? {
    minWatts: 0,
  };
  const car: NonNullable<ConfigLayer['car']> = (local.car as ConfigLayer['car']) ?? {};
  const mediaEntity: NonNullable<ConfigLayer['mediaEntity']> =
    (local.mediaEntity as ConfigLayer['mediaEntity']) ?? {};
  const mediaPresets: NonNullable<ConfigLayer['mediaPresets']> =
    (local.mediaPresets as ConfigLayer['mediaPresets']) ?? {};
  const mediaMaxVolume: NonNullable<ConfigLayer['mediaMaxVolume']> =
    (local.mediaMaxVolume as ConfigLayer['mediaMaxVolume']) ?? {};

  const patch = (next: ConfigLayer, options?: { immediate?: boolean }) => {
    localRef.current = mergeLayers(localRef.current as ConfigLayer, next) as LovelaceCardConfig;
    setLocal(localRef.current);
    if (timer.current !== undefined) clearTimeout(timer.current);
    if (options?.immediate) {
      timer.current = undefined;
      flush();
    } else {
      timer.current = setTimeout(flush, COMMIT_DEBOUNCE_MS);
    }
  };

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
          Zon, verbruik en net worden automatisch herkend (elke sensor met
          <code> device_class: power</code>) — hier hoeft niets gekozen te worden. Raadt de
          herkenning verkeerd, dan overschrijf je <code>power.solar</code>/<code>power.consumption</code>/
          <code>power.grid</code> in de YAML van de kaart zelf.
        </div>
        <DeviceListRows
          devices={power.devices ?? []}
          options={energyPrefs?.deviceRates ?? []}
          states={states}
          onChange={(next, immediate) => patch({ power: { devices: next } }, { immediate })}
        />
        <div className="hdpe__note">
          Kiest uit de lijst "Individuele apparaten" onder Instellingen → Dashboards → Energie — een
          apparaat toevoegen daar maakt het hier beschikbaar. Leeg volgt die lijst in zijn geheel, op
          actueel verbruik gesorteerd. Eenmaal hier gekozen blijven ze altijd zichtbaar, ook op 0 W, in
          precies deze volgorde — het minimum vermogen hieronder geldt dan niet meer. Het tekstveld
          ernaast toont een kortere naam op de Energie-tab in plaats van de eigen naam van het apparaat
          (leeg = eigen naam). Het icoon komt altijd van het apparaat zelf.
        </div>
        <label className="hdpe__field">
          <span className="hdpe__field-label">Minimum vermogen (W) — geldt alleen zonder eigen apparatenlijst hierboven</span>
          <input
            type="number"
            min={0}
            value={power.minWatts ?? 0}
            onChange={(event) => patch({ power: { minWatts: Number(event.target.value) || 0 } })}
            onBlur={flush}
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
            onBlur={flush}
          />
        </label>
        <EntityPicker
          label="Batterij"
          value={car.battery}
          options={sensors}
          states={states}
          onChange={(value) => patch({ car: { battery: value } }, { immediate: true })}
        />
        <EntityPicker
          label="Bereik"
          value={car.range}
          options={sensors}
          states={states}
          onChange={(value) => patch({ car: { range: value } }, { immediate: true })}
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
                patch(
                  { mediaEntity: { [area.area_id]: event.target.value || undefined } },
                  { immediate: true },
                )
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
        <h3 className="hdpe__title">Media</h3>
        {usedMediaPlayers.map((entityId) => (
          <PresetRows
            key={entityId}
            hass={hass}
            entityId={entityId}
            states={states}
            presets={mediaPresets[entityId] ?? []}
            onChange={(next, immediate) =>
              patch({ mediaPresets: { [entityId]: next } }, { immediate })
            }
            maxVolume={mediaMaxVolume[entityId]}
            onMaxVolumeChange={(next, immediate) =>
              patch({ mediaMaxVolume: { [entityId]: next } }, { immediate })
            }
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
.hdpe__preset-actions { display: flex; gap: 6px; }
.hdpe__add { align-self: flex-start; }
.hdpe__browser {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px dashed var(--divider-color, #ccc);
  border-radius: 8px;
}
.hdpe__browser-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; font-size: 13px; }
.hdpe__browser-crumbs button {
  font: inherit;
  color: var(--primary-color, inherit);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
}
.hdpe__browser-crumbs button:disabled { color: var(--primary-text-color, inherit); cursor: default; }
.hdpe__browser-close { margin-left: auto; }
.hdpe__browser-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; max-height: 220px; overflow-y: auto; }
.hdpe__browser-row { display: flex; align-items: center; gap: 6px; }
.hdpe__browser-item, .hdpe__browser-pick {
  font: inherit;
  color: var(--primary-text-color, inherit);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 6px 4px;
  text-align: left;
}
.hdpe__browser-item { flex: 1; border-radius: 6px; }
.hdpe__browser-item:hover { background: var(--secondary-background-color, rgba(127, 127, 127, 0.1)); }
.hdpe__browser-pick { border: 1px solid var(--divider-color, #ccc); border-radius: 6px; padding: 4px 8px; }
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
