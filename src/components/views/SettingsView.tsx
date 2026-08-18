import { useState } from 'react';
import { PALETTES, THEMES, TINT_CYCLE } from '../../config/config';
import { useHass } from '../../ha/HassProvider';
import { friendlyName } from '../../ha/selectors';
import type { Room } from '../../ha/types';
import { Icon } from '../../ui/Icon';

/** One expandable row in the "Overig" block. */
function MoreRow({
  name,
  meta,
  open,
  onTap,
  children,
}: {
  name: string;
  meta: string;
  open?: boolean;
  onTap(): void;
  children?: React.ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        className="more__row"
        onClick={onTap}
        aria-expanded={children ? open : undefined}
      >
        <span className="more__names">
          <span className="more__name">{name}</span>
          <span className="more__meta">{meta}</span>
        </span>
        <Icon
          name="chevronRight"
          size={18}
          className={`more__chevron${open ? ' more__chevron--open' : ''}`}
        />
      </button>
      {open && children && <div className="more__panel">{children}</div>}
    </>
  );
}

/**
 * The gear view. Three things live here that used to be scattered or missing:
 * who is holding the phone (the presence pill then shows the *other* person),
 * the room order, and the display odds and ends.
 */
export function SettingsView({
  rooms,
  persons,
  onOpenWeather,
}: {
  rooms: Room[];
  persons: string[];
  onOpenWeather(): void;
}) {
  const { entities, config, updateConfig, resetConfig } = useHass();
  const [panel, setPanel] = useState<'thema' | 'kleuren' | 'tints' | null>(null);

  const toggleFavourite = (roomId: string) => {
    const current = config.favouriteAreas;
    updateConfig({
      favouriteAreas: current.includes(roomId)
        ? current.filter((id) => id !== roomId)
        : [...current, roomId],
    });
  };

  /**
   * Rooms arrive in display order (favourites first). A move only ever swaps
   * two neighbours inside the same group — pushing a plain room past a
   * favourite would look like nothing happened, because the grid re-groups.
   */
  const canMove = (index: number, delta: -1 | 1): boolean => {
    const from = rooms[index];
    const to = rooms[index + delta];
    return from !== undefined && to !== undefined && from.favourite === to.favourite;
  };

  const move = (index: number, delta: -1 | 1) => {
    if (!canMove(index, delta)) return;
    const order = rooms.map((room) => room.id);
    const target = index + delta;
    [order[index], order[target]] = [order[target]!, order[index]!];
    updateConfig({ roomOrder: order });
  };

  const themeLabel = THEMES.find((theme) => theme.value === config.theme)?.label ?? '';
  const paletteLabel = PALETTES.find(({ value }) => value === config.palette)?.label ?? '';

  return (
    <div className="view">
      <div className="settings__section">
        <div className="settings__label">Wie ben jij</div>
        <div className="persons">
          {persons.map((entityId) => (
            <button
              key={entityId}
              type="button"
              className={`person${config.me === entityId ? ' person--on' : ''}`}
              aria-pressed={config.me === entityId}
              onClick={() => updateConfig({ me: entityId })}
            >
              <span className="person__name">{friendlyName(entities, entityId)}</span>
              <span className="person__id">{entityId}</span>
            </button>
          ))}
          {persons.length === 0 && (
            <div className="settings__note">geen person-entiteiten gevonden</div>
          )}
        </div>
        {persons.length > 0 && (
          <div className="settings__note">de pil bovenaan toont de ánder</div>
        )}
      </div>

      <div className="settings__section">
        <div className="settings__label">Kamers sorteren</div>
        <div className="order">
          {rooms.map((room, index) => (
            <div className="order__row" key={room.id}>
              <div className="order__names">
                <div className="order__name">{room.name}</div>
                <div className="order__id">{room.id}</div>
              </div>
              <button
                type="button"
                className={`order__btn order__btn--fav${
                  room.favourite ? ' order__btn--fav-on' : ''
                }`}
                aria-label={`${room.name} ${room.favourite ? 'geen favoriet' : 'favoriet'}`}
                aria-pressed={room.favourite}
                onClick={() => toggleFavourite(room.id)}
              >
                <Icon name="star" size={17} />
              </button>
              <button
                type="button"
                className="order__btn"
                aria-label={`${room.name} omhoog`}
                disabled={!canMove(index, -1)}
                onClick={() => move(index, -1)}
              >
                <Icon name="chevronUp" size={17} />
              </button>
              <button
                type="button"
                className="order__btn"
                aria-label={`${room.name} omlaag`}
                disabled={!canMove(index, 1)}
                onClick={() => move(index, 1)}
              >
                <Icon name="chevronDown" size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="settings__section">
        <div className="settings__label">Overig</div>

        <MoreRow name="Weer" meta="voorspelling en details" onTap={onOpenWeather} />

        <MoreRow
          name="Thema"
          meta={themeLabel}
          open={panel === 'thema'}
          onTap={() => setPanel((current) => (current === 'thema' ? null : 'thema'))}
        >
          <div className="alarm__modes">
            {THEMES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`alarm__mode${config.theme === value ? ' alarm__mode--current' : ''}`}
                aria-pressed={config.theme === value}
                onClick={() => updateConfig({ theme: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </MoreRow>

        <MoreRow
          name="Kleuren"
          meta={paletteLabel}
          open={panel === 'kleuren'}
          onTap={() => setPanel((current) => (current === 'kleuren' ? null : 'kleuren'))}
        >
          <div className="alarm__modes">
            {PALETTES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`alarm__mode${config.palette === value ? ' alarm__mode--current' : ''}`}
                aria-pressed={config.palette === value}
                onClick={() => updateConfig({ palette: value })}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="settings__note">
            vlakken en tekst volgen het thema van Home Assistant; accent, tints en
            letters blijven van het ontwerp
          </div>
        </MoreRow>

        <MoreRow
          name="Tints per kamer"
          meta={`${rooms.length} kamers`}
          open={panel === 'tints'}
          onTap={() => setPanel((current) => (current === 'tints' ? null : 'tints'))}
        >
          {rooms.map((room) => (
            <div className="tint-row" key={room.id}>
              <span className="tint-row__name">{room.name}</span>
              {TINT_CYCLE.map((tint) => (
                <button
                  key={tint}
                  type="button"
                  className={`tint-swatch${room.tint === tint ? ' tint-swatch--on' : ''}`}
                  style={{ background: tint }}
                  aria-label={`${room.name} tint`}
                  aria-pressed={room.tint === tint}
                  onClick={() => updateConfig({ areaTint: { [room.id]: tint } })}
                />
              ))}
            </div>
          ))}
        </MoreRow>
      </div>

      <button type="button" className="stale__foot" onClick={resetConfig}>
        standaardwaarden herstellen
      </button>
    </div>
  );
}
