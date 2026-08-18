import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHass } from '../../ha/HassProvider';
import { fetchSparkline, seriesRange, sparklinePoints } from '../../ha/history';
import {
  formatHumidity,
  formatNumber,
  formatTemp,
  numericState,
} from '../../ha/selectors';
import {
  mediaPlayPause,
  mediaPlayPreset,
  mediaStep,
  setClimateTemperature,
  setHvacMode,
  setLightBrightness,
  toggleClimate,
  toggleLight,
} from '../../ha/services';
import type { Room, RoomClimate, RoomLight, RoomMedia } from '../../ha/types';
import { Icon } from '../../ui/Icon';
import { HVAC_ICONS, hvacLabel } from '../../ui/icons';
import { Sheet, SheetClose } from '../Sheet';

/** A pointer that never travelled this far is a tap, not a drag. */
const TAP_SLOP_PX = 6;

/* ── 24 h temperature line ────────────────────────────────────────────────
   A plain polyline in the room's tint. v1 embedded a Lovelace `history-graph`
   here, which is what made the card slow and unreadable on a phone.        */

function useSeries(entityId: string | undefined): number[] {
  const { backend, entities } = useHass();
  const [values, setValues] = useState<number[]>([]);

  useEffect(() => {
    if (!entityId) {
      setValues([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      fetchSparkline(backend, entityId).then((next) => {
        if (!cancelled) setValues(next);
      });
    };
    load();
    // The fetch is cached for five minutes; re-ask at that cadence.
    const id = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [backend, entityId]);

  const current = entityId ? numericState(entities[entityId]) : undefined;

  // The last point is the live reading, so the line never lags the header.
  return useMemo(
    () => (values.length === 0 || current === undefined ? values : [...values.slice(0, -1), current]),
    [values, current],
  );
}

function HistoryLine({ room }: { room: Room }) {
  const series = useSeries(room.entities.temperature);
  const points = sparklinePoints(series);
  const range = seriesRange(series);

  if (!points) return null;

  return (
    <div className="spark">
      <svg
        className="spark__svg"
        viewBox="0 0 100 24"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline
          points={points}
          fill="none"
          stroke={room.tint}
          strokeWidth="1.6"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="spark__stats">
        <span className="spark__hi">{range ? formatTemp(range.max, 1) : ''}</span>
        <span>{range ? formatTemp(range.min, 1) : ''}</span>
        <span>24 u</span>
      </div>
    </div>
  );
}

/* ── per-lamp rows ────────────────────────────────────────────────────────
   Drag sets the level, tap toggles. A lamp that only switches gets neither a
   fill it can land between nor an `ew-resize` cursor promising one.        */

function LampRow({ light }: { light: RoomLight }) {
  const { entities, call } = useHass();
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  // Drop the local preview once the real value lands — but never mid-drag, or
  // an unrelated state update would yank the fill out from under the finger.
  useEffect(() => {
    if (drag.current === null) setPreview(null);
  }, [light.on, light.brightness]);

  const percentAt = useCallback((clientX: number): number => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const commit = (percent: number) => void call(setLightBrightness(light.entityId, percent));
  const toggle = () => void call(toggleLight(light.entityId, entities));

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // State first: if the capture below throws, the tap must still work.
    drag.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is a nicety — the row still tracks without it */
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.moved && Math.abs(event.clientX - state.startX) <= TAP_SLOP_PX) return;
    state.moved = true;
    if (light.dimmable) setPreview(percentAt(event.clientX));
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state || state.pointerId !== event.pointerId) return;

    if (!state.moved) {
      setPreview(null);
      toggle();
      return;
    }
    if (light.dimmable) {
      const percent = percentAt(event.clientX);
      setPreview(percent);
      commit(percent);
    } else {
      setPreview(null);
    }
  };

  const onPointerCancel = () => {
    drag.current = null;
    setPreview(null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
      return;
    }
    if (!light.dimmable) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      commit(light.brightness + (event.key === 'ArrowRight' ? 5 : -5));
    }
  };

  const shown = preview ?? light.brightness;
  const value = light.on ? (light.dimmable ? `${Math.round(shown)}%` : 'aan') : 'uit';

  return (
    <div
      ref={rowRef}
      className={`lamp${light.dimmable ? ' lamp--dimmable' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${light.name} ${value}`}
      aria-pressed={light.on}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onKeyDown={onKeyDown}
    >
      <div className="lamp__fill" style={{ width: `${shown}%` }} />
      <div className="lamp__row">
        <span className="lamp__name">{light.name}</span>
        <span className="lamp__kind">{light.dimmable ? 'dimbaar' : 'aan/uit'}</span>
        <span className="lamp__value">{value}</span>
      </div>
    </div>
  );
}

/* ── climate ──────────────────────────────────────────────────────────────  */

/**
 * Power on the left, mode beside it, setpoint on the right. The button is the
 * on/off — the same tap as the tile's AC chip — and the dropdown reaches the
 * modes the unit actually reports, `off` among them where it reports one, so
 * its value is always the unit's own state rather than a guess at it.
 *
 * The button wears the mode's hue and the dropdown says its name: between them
 * the mode is stated once, in the place that can carry it. A power glyph on a
 * button that also read `COOL` beside a dropdown reading `COOL` said it twice.
 *
 * The row wraps: on a phone the setpoint group drops to a second line rather
 * than squeezing the three controls into 316px.
 */
function ClimateRow({ climate }: { climate: RoomClimate }) {
  const { entities, call } = useHass();
  const { entityId, mode, modeId, modes, target, min, max, step } = climate;
  const on = mode !== 'off';

  const bump = (direction: 1 | -1) => {
    if (target === undefined) return;
    const next = Math.min(max, Math.max(min, target + direction * step));
    if (next !== target) void call(setClimateTemperature(entityId, next));
  };

  return (
    <div className="climate">
      <button
        type="button"
        className={`climate__power${on ? ` climate__power--${mode}` : ''}`}
        onClick={() => void call(toggleClimate(entityId, entities))}
        aria-label={`Airco ${on ? 'uit' : 'aan'}`}
        aria-pressed={on}
      >
        <Icon name="power" size={18} />
      </button>

      {modes.length > 1 && (
        <div className="climate__pick">
          <Icon name={HVAC_ICONS[mode]} size={15} className="climate__pick-icon" />
          <select
            className="climate__select"
            value={modeId}
            onChange={(event) => void call(setHvacMode(entityId, event.target.value))}
            aria-label="Modus"
          >
            {modes.map((value) => (
              <option key={value} value={value}>
                {hvacLabel(value)}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" size={16} className="climate__pick-chevron" />
        </div>
      )}

      <div className="climate__steps">
        <button
          type="button"
          className="stepper"
          onClick={() => bump(-1)}
          disabled={target === undefined}
          aria-label="Kouder"
        >
          −
        </button>
        <div className="climate__target">
          {target === undefined ? '—' : `${formatNumber(target, 1)}°`}
        </div>
        <button
          type="button"
          className="stepper"
          onClick={() => bump(1)}
          disabled={target === undefined}
          aria-label="Warmer"
        >
          +
        </button>
      </div>
    </div>
  );
}

/* ── media ────────────────────────────────────────────────────────────────  */

function MediaRow({ media }: { media: RoomMedia }) {
  const { entities, config, call } = useHass();
  const { entityId, playing, station } = media;
  const presets = config.mediaPresets[entityId] ?? [];

  return (
    <div className="media">
      <div className="media__row">
        <div className="media__names">
          <div className="media__station">{station}</div>
          <div className="media__state">{`${playing ? 'Speelt' : 'Gepauzeerd'} · ${entityId}`}</div>
        </div>
        <button
          type="button"
          className="media__btn"
          aria-label="Vorige"
          onClick={() => void call(mediaStep(entityId, 'previous'))}
        >
          <Icon name="skipPrevious" size={16} />
        </button>
        <button
          type="button"
          className={`media__btn media__btn--play${playing ? ' media__btn--playing' : ''}`}
          aria-label={playing ? 'Pauzeren' : 'Spelen'}
          onClick={() => void call(mediaPlayPause(entityId, entities))}
        >
          <Icon name={playing ? 'pause' : 'play'} size={17} />
        </button>
        <button
          type="button"
          className="media__btn"
          aria-label="Volgende"
          onClick={() => void call(mediaStep(entityId, 'next'))}
        >
          <Icon name="skipNext" size={16} />
        </button>
      </div>

      {presets.length > 0 && (
        <div className="media__presets">
          {presets.map((preset) => (
            <button
              key={preset.media_content_id}
              type="button"
              className={`media__preset${station === preset.name ? ' media__preset--on' : ''}`}
              onClick={() => void call(mediaPlayPreset(entityId, preset))}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Everything the tile cannot hold — and nothing more. No Lovelace embeds: the
 * only chart in here is the room's own temperature line.
 */
export function RoomSheet({ room, onClose }: { room: Room; onClose(): void }) {
  const reading = [
    room.temperature === undefined ? undefined : formatTemp(room.temperature, 1),
    room.humidity === undefined ? undefined : formatHumidity(room.humidity),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Sheet onClose={onClose} labelledBy="room-sheet-title">
      <div className="sheet__head">
        <span className="sheet__bar" style={{ background: room.tint }} />
        <div className="sheet__titles">
          <div className="sheet__title" id="room-sheet-title">
            {room.name}
          </div>
          {reading && <div className="sheet__subtitle">{reading}</div>}
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <HistoryLine room={room} />

      {room.lights.length > 0 && (
        <div className="sheet__list">
          {room.lights.map((light) => (
            <LampRow key={light.entityId} light={light} />
          ))}
        </div>
      )}

      {room.climate && <ClimateRow climate={room.climate} />}
      {room.media && <MediaRow media={room.media} />}
    </Sheet>
  );
}
