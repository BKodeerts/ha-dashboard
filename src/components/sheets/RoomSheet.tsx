import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHass } from '../../ha/HassProvider';
import { fetchSparkline, seriesRange, sparklinePoints } from '../../ha/history';
import {
  formatHumidity,
  formatNumber,
  formatTemp,
  hvacMode,
  numericState,
} from '../../ha/selectors';
import {
  mediaPlayPause,
  mediaPlayPreset,
  mediaStep,
  preferredHvacMode,
  setClimateTemperature,
  setHvacMode,
  setLightBrightness,
  toggleClimate,
  toggleLight,
} from '../../ha/services';
import type { HvacMode, Room, RoomClimate, RoomLight, RoomMedia } from '../../ha/types';
import { Icon } from '../../ui/Icon';
import { HVAC_ICONS, HVAC_ROW_LABELS, hvacLabel } from '../../ui/icons';
import { Sheet, SheetClose } from '../Sheet';

/** A pointer that never travelled this far is a tap, not a drag. */
const TAP_SLOP_PX = 6;

/**
 * The gesture the lamp rows and the climate row share: drag horizontally to set
 * a level, tap to toggle. `value` is the confirmed level in percent; while a
 * drag is in flight the returned `percent` is the finger's instead, so the fill
 * tracks it rather than waiting on the round trip.
 *
 * `draggable` false makes the row tap-only — a lamp that merely switches must
 * never show a fill it can be left in the middle of.
 */
function useDragRow({
  value,
  draggable,
  onCommit,
  onTap,
}: {
  value: number;
  draggable: boolean;
  onCommit(percent: number): void;
  onTap(): void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; moved: boolean } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);

  // Drop the local preview once the real value lands — but never mid-drag, or
  // an unrelated state update would yank the fill out from under the finger.
  useEffect(() => {
    if (drag.current === null) setPreview(null);
  }, [value]);

  const percentAt = useCallback((clientX: number): number => {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }, []);

  const handlers = {
    onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
      // State first: if the capture below throws, the tap must still work.
      drag.current = { pointerId: event.pointerId, startX: event.clientX, moved: false };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* capture is a nicety — the row still tracks without it */
      }
    },

    onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
      const state = drag.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (!state.moved && Math.abs(event.clientX - state.startX) <= TAP_SLOP_PX) return;
      state.moved = true;
      if (draggable) setPreview(percentAt(event.clientX));
    },

    onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
      const state = drag.current;
      drag.current = null;
      if (!state || state.pointerId !== event.pointerId) return;

      if (!state.moved) {
        setPreview(null);
        onTap();
        return;
      }
      if (!draggable) {
        setPreview(null);
        return;
      }
      // One call, on release — a drag that wrote per frame would put a cloud
      // round trip behind every pixel.
      const percent = percentAt(event.clientX);
      setPreview(percent);
      onCommit(percent);
    },

    onPointerCancel() {
      drag.current = null;
      setPreview(null);
    },
  };

  return { rowRef, percent: preview ?? value, dragging: preview !== null, handlers };
}

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

  const commit = (percent: number) => void call(setLightBrightness(light.entityId, percent));
  const toggle = () => void call(toggleLight(light.entityId, entities));

  const { rowRef, percent, handlers } = useDragRow({
    value: light.brightness,
    draggable: light.dimmable,
    onCommit: commit,
    onTap: toggle,
  });

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

  const value = light.on ? (light.dimmable ? `${Math.round(percent)}%` : 'aan') : 'uit';

  return (
    <div
      ref={rowRef}
      className={`lamp${light.dimmable ? ' lamp--dimmable' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${light.name} ${value}`}
      aria-pressed={light.on}
      onKeyDown={onKeyDown}
      {...handlers}
    >
      <div className="lamp__fill" style={{ width: `${percent}%` }} />
      <div className="lamp__row">
        <span className="lamp__name">{light.name}</span>
        <span className="lamp__kind">{light.dimmable ? 'dimbaar' : 'aan/uit'}</span>
        <span className="lamp__value">{value}</span>
      </div>
    </div>
  );
}

/* ── climate ──────────────────────────────────────────────────────────────  */

/** The order the mode picker offers, ahead of anything else the unit reports. */
const PICKER_MODES = ['cool', 'heat', 'dry', 'fan_only'];

/**
 * The picker's options: the design's four, filtered to what this unit says it
 * can do, then anything else it reports (`auto`, `heat_cool`), and `Uit` last.
 * Offering a mode the unit does not have would send a command it rejects.
 */
function pickerModes(modes: string[]): string[] {
  const has = new Set(modes);
  return [
    ...PICKER_MODES.filter((mode) => has.has(mode)),
    ...modes.filter((mode) => mode !== 'off' && !PICKER_MODES.includes(mode)),
    'off',
  ];
}

/**
 * One row for the whole unit: the fill is the setpoint on the unit's own
 * temperature track, dragging it sets the temperature, tapping the row switches
 * the unit, and the glyph opens the mode picker.
 *
 * Nothing here cycles. Every mode change on this system is a cloud round trip,
 * so the only three things that send a command are a pick in the picker, a tap,
 * and the release of a drag.
 */
function ClimateRow({ climate }: { climate: RoomClimate }) {
  const { entities, call } = useHass();
  const { entityId, mode, modeId, modes, target, min, max, step } = climate;
  const [pickerOpen, setPickerOpen] = useState(false);
  const on = mode !== 'off';

  // A unit that reports a degenerate range would divide by zero below.
  const span = max > min ? max - min : 14;
  const toPercent = (celsius: number) => ((celsius - min) / span) * 100;
  const toCelsius = (percent: number) => {
    const raw = min + (percent / 100) * span;
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };

  const commit = (percent: number) => {
    const next = toCelsius(percent);
    void (async () => {
      // A drag on a unit that is off means "run at this" — switch it on first.
      if (!on) await call(setHvacMode(entityId, preferredHvacMode(entities, entityId)));
      await call(setClimateTemperature(entityId, next));
    })();
  };

  const toggle = () => void call(toggleClimate(entityId, entities));

  const { rowRef, percent, dragging, handlers } = useDragRow({
    // Off has no setpoint to show, so the track reads empty until it is on.
    value: on && target !== undefined ? Math.max(0, Math.min(100, toPercent(target))) : 0,
    draggable: true,
    onCommit: commit,
    onTap: toggle,
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
      return;
    }
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const from = target ?? min;
    const next = Math.min(max, Math.max(min, from + (event.key === 'ArrowRight' ? step : -step)));
    if (next !== target) void call(setClimateTemperature(entityId, next));
  };

  // While the unit is off, a drag previews the mode it is about to come back in.
  const fillMode: HvacMode = on ? mode : hvacMode(preferredHvacMode(entities, entityId));
  const shownTarget = dragging ? toCelsius(percent) : target;

  // The glyph sits on top of the drag surface, so it has to stop the pointer
  // stream as well as the click: stopping `click` alone leaves the row's own
  // handlers firing underneath, and every mode tap would also toggle power.
  const swallow = (event: React.PointerEvent<HTMLButtonElement>) => event.stopPropagation();

  return (
    <div className="climate">
      <div
        ref={rowRef}
        className="climate__row"
        role="button"
        tabIndex={0}
        aria-label={`Airco ${on ? HVAC_ROW_LABELS[mode].toLowerCase() : 'uit'}${
          target === undefined ? '' : `, ${formatTemp(target, 1)}`
        }`}
        aria-pressed={on}
        onKeyDown={onKeyDown}
        {...handlers}
      >
        <div
          className={`climate__fill climate__fill--${fillMode}`}
          style={{ width: `${percent}%` }}
        />
        <div className="climate__body">
          <button
            type="button"
            className={`climate__glyph${on ? ` climate__glyph--${mode}` : ''}`}
            aria-label="Modus kiezen"
            aria-expanded={pickerOpen}
            onClick={(event) => {
              event.stopPropagation();
              setPickerOpen((open) => !open);
            }}
            onPointerDown={swallow}
            onPointerMove={swallow}
            onPointerUp={swallow}
          >
            <Icon name={HVAC_ICONS[mode]} size={18} />
          </button>

          <span className="climate__mode">{HVAC_ROW_LABELS[mode]}</span>
          <span className="climate__hint">
            {on ? `sleep ${formatNumber(min)}–${formatNumber(max)}°` : 'tik = aan'}
          </span>
          <span className="climate__target">
            {shownTarget === undefined ? '—' : formatTemp(shownTarget, 1)}
          </span>
        </div>
      </div>

      {pickerOpen && (
        <div className="picker picker--climate" role="group" aria-label="Modus">
          {pickerModes(modes).map((value) => {
            const active = value === 'off' ? !on : value === modeId;
            return (
              <button
                key={value}
                type="button"
                className={`picker__option picker__option--${hvacMode(value)}${
                  active ? ' picker__option--on' : ''
                }`}
                aria-pressed={active}
                onClick={() => {
                  setPickerOpen(false);
                  // Picking what it is already doing is not worth a round trip.
                  if (!active) void call(setHvacMode(entityId, value));
                }}
              >
                {hvacLabel(value)}
              </button>
            );
          })}
        </div>
      )}
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
