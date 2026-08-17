import { useHass } from '../../ha/HassProvider';
import {
  formatHumidity,
  formatNumber,
  formatTemp,
  friendlyName,
  shortName,
  toNumber,
} from '../../ha/selectors';
import {
  mediaPlayPause,
  mediaPlayPreset,
  mediaStep,
  mediaVolume,
  setClimateTemperature,
  toggleClimate,
  toggleLight,
} from '../../ha/services';
import type { Room } from '../../ha/types';
import { Icon } from '../../ui/Icon';
import { LovelaceCard } from '../LovelaceCard';
import { Sheet, SheetClose } from '../Sheet';

const number = (value: unknown, fallback: number): number => toNumber(value) ?? fallback;

function ClimateRow({ entityId }: { entityId: string }) {
  const { entities, call } = useHass();
  const state = entities[entityId];
  const on = state !== undefined && state.state !== 'off' && state.state !== 'unavailable';

  const min = number(state?.attributes?.min_temp, 16);
  const max = number(state?.attributes?.max_temp, 30);
  const step = number(state?.attributes?.target_temp_step, 0.5);
  // `null` while the unit reports no setpoint — the stepper stays disabled.
  const target = toNumber(state?.attributes?.temperature);

  const bump = (direction: 1 | -1) => {
    if (target === undefined) return;
    const next = Math.min(max, Math.max(min, target + direction * step));
    if (next !== target) void call(setClimateTemperature(entityId, next));
  };

  return (
    <div className="climate">
      <button
        type="button"
        className={`climate__chip${on ? ' climate__chip--on' : ''}`}
        onClick={() => void call(toggleClimate(entityId, entities))}
      >
        <Icon name="ac" size={15} />
        {on ? (state?.state === 'cool' ? 'Cool' : (state?.state ?? '')) : 'Uit'}
      </button>
      <div className="climate__spacer" />
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
        {target === undefined ? '—' : `${formatNumber(target, 1)} °C`}
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
  );
}

function MediaBlock({ entityId }: { entityId: string }) {
  const { entities, config, call } = useHass();
  const state = entities[entityId];
  const playing = state?.state === 'playing';

  const title = state?.attributes?.media_title;
  const station =
    typeof title === 'string' && title.length > 0 ? title : friendlyName(entities, entityId);

  const volumeLevel = toNumber(state?.attributes?.volume_level);
  const volume = volumeLevel === undefined ? undefined : Math.round(volumeLevel * 100);

  const presets = config.mediaPresets[entityId] ?? [];

  return (
    <div className="media">
      <div className="media__row">
        <div className="media__tile">
          <Icon name="radio" size={16} />
        </div>
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
          <Icon name="skipPrevious" size={15} />
        </button>
        <button
          type="button"
          className={`media__btn media__btn--play${playing ? ' media__btn--playing' : ''}`}
          aria-label={playing ? 'Pauzeren' : 'Spelen'}
          onClick={() => void call(mediaPlayPause(entityId, entities))}
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <button
          type="button"
          className="media__btn"
          aria-label="Volgende"
          onClick={() => void call(mediaStep(entityId, 'next'))}
        >
          <Icon name="skipNext" size={15} />
        </button>
      </div>

      {volume !== undefined && (
        <div className="media__row">
          <button
            type="button"
            className="media__vol-btn"
            aria-label="Zachter"
            onClick={() => void call(mediaVolume(entityId, volume - 5))}
          >
            −
          </button>
          <div
            className="media__track"
            role="progressbar"
            aria-label="Volume"
            aria-valuenow={volume}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="media__fill" style={{ width: `${volume}%` }} />
          </div>
          <button
            type="button"
            className="media__vol-btn"
            aria-label="Luider"
            onClick={() => void call(mediaVolume(entityId, volume + 5))}
          >
            +
          </button>
          <div className="media__pct">{`${volume}%`}</div>
        </div>
      )}

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

export function RoomSheet({ room, onClose }: { room: Room; onClose(): void }) {
  const { entities, config, call } = useHass();
  const climateId = room.entities.climate[0];
  const mediaId = room.entities.mediaPlayers[0];

  const historyConfig =
    config.lovelace.roomHistory ??
    (room.entities.temperature
      ? {
          type: 'history-graph',
          hours_to_show: 24,
          entities: [room.entities.temperature, ...(room.entities.humidity ? [room.entities.humidity] : [])],
        }
      : undefined);

  const cameraConfig = room.entities.cameras[0]
    ? { type: 'picture-entity', entity: room.entities.cameras[0], camera_view: 'auto' }
    : undefined;

  return (
    <Sheet onClose={onClose} labelledBy="room-sheet-title">
      <div className="sheet__head">
        <span className="sheet__dot" style={{ background: room.tint }} />
        <div className="sheet__title sheet__titles" id="room-sheet-title">
          {room.name}
        </div>
        <SheetClose onClose={onClose} />
      </div>

      <div className="reading">
        <span className="reading__temp">{formatTemp(room.temperature, 1)}</span>
        <span className="reading__hum">{formatHumidity(room.humidity)}</span>
      </div>

      {climateId && <ClimateRow entityId={climateId} />}
      {mediaId && <MediaBlock entityId={mediaId} />}

      {room.entities.lights.length > 0 && (
        <div className="sheet__list">
          {room.entities.lights.map((entityId) => {
            const on = entities[entityId]?.state === 'on';
            return (
              <button
                key={entityId}
                type="button"
                className="entity"
                onClick={() => void call(toggleLight(entityId, entities))}
                aria-pressed={on}
              >
                <span className="media__tile">
                  <Icon name="bulb" size={16} />
                </span>
                <span className="entity__names">
                  <span className="entity__name">
                    {shortName(friendlyName(entities, entityId), room.name)}
                  </span>
                  <span className="entity__id">{entityId}</span>
                </span>
                <span className={`switch${on ? ' switch--on' : ''}`}>
                  <span className="switch__knob" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {cameraConfig && (
        <LovelaceCard config={cameraConfig} fallback={`camera · ${room.entities.cameras[0]}`} />
      )}

      {historyConfig && (
        <LovelaceCard
          config={historyConfig}
          fallback={`history-graph · ${room.entities.temperature ?? room.id}`}
        />
      )}

      <div className="sheet__footnote">{`Entities from area · ${room.id}`}</div>
    </Sheet>
  );
}
