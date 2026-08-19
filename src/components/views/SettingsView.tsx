import { useMemo, useState } from 'react';
import { PALETTES, THEMES, TINT_CYCLE, weatherEntities } from '../../config/config';
import { useHass } from '../../ha/HassProvider';
import { friendlyName, type PersonInfo } from '../../ha/selectors';
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
 * The gear view. Four sections: who you are (read-only — the account says so),
 * who you follow at the top of the home screen, the room order, and the display
 * odds and ends.
 */
export function SettingsView({
  rooms,
  persons,
  me,
}: {
  rooms: Room[];
  persons: string[];
  me: PersonInfo;
}) {
  const { entities, config, updateConfig, resetConfig, user } = useHass();
  const [panel, setPanel] = useState<'weer' | 'thema' | 'kleuren' | 'tints' | 'opslag' | null>(
    null,
  );

  const weathers = useMemo(() => weatherEntities(entities), [entities]);

  const tracked = config.tracked;

  /** Radio, not checkbox: the header only ever shows one chip, so picking a
   * new person replaces whoever was tracked rather than adding to them. */
  const selectTracked = (entityId: string) => {
    updateConfig({ tracked: tracked.includes(entityId) ? [] : [entityId] });
  };

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

  const weatherLabel = config.weatherEntity
    ? friendlyName(entities, config.weatherEntity)
    : 'niet gekozen';
  const themeLabel = THEMES.find((theme) => theme.value === config.theme)?.label ?? '';
  const paletteLabel = PALETTES.find(({ value }) => value === config.palette)?.label ?? '';

  return (
    <div className="view">
      {/* Not a setting. A household of five people has five accounts, and
          asking each of them to pick themselves out of a list is a setting that
          can be wrong; `hass.user` cannot. */}
      <div className="settings__section">
        <div className="settings__label">Wie ben jij</div>
        <div className="me">
          <Icon name="person" size={19} className="me__icon" />
          <div className="me__names">
            <div className="me__name">{me.name}</div>
            {me.entityId && <div className="me__id">{me.entityId}</div>}
          </div>
          <span className="me__badge">uit je account</span>
        </div>
        <div className="settings__note">
          {me.entityId
            ? 'hass.user gekoppeld aan person'
            : 'geen person met dit user_id — vul user_id in bij de persoon'}
        </div>
      </div>

      <div className="settings__section">
        <div className="settings__label">Wie volg je bovenaan</div>
        <div className="radio-list" role="radiogroup" aria-label="Wie volg je bovenaan">
          {persons
            .filter((entityId) => entityId !== me.entityId)
            .map((entityId) => {
              const on = tracked.includes(entityId);
              const home = entities[entityId]?.state === 'home';
              return (
                <button
                  key={entityId}
                  type="button"
                  className={`radio-row${on ? ' radio-row--on' : ''}`}
                  role="radio"
                  aria-checked={on}
                  onClick={() => selectTracked(entityId)}
                >
                  <span className="radio-dot" />
                  <span className="radio-names">
                    <span className="radio-name">{friendlyName(entities, entityId)}</span>
                    <span className="radio-id">{entityId}</span>
                  </span>
                  <span className="radio-state">{home ? 'thuis' : 'weg'}</span>
                </button>
              );
            })}
          {persons.filter((entityId) => entityId !== me.entityId).length === 0 && (
            <div className="settings__note">geen andere person-entiteiten gevonden</div>
          )}
        </div>
        <div className="settings__note">tik nogmaals om niemand te volgen</div>
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

        <MoreRow
          name="Weer"
          meta={weatherLabel}
          open={panel === 'weer'}
          onTap={() => setPanel((current) => (current === 'weer' ? null : 'weer'))}
        >
          <div className="persons persons--stack">
            {weathers.map((entityId) => (
              <button
                key={entityId}
                type="button"
                className={`person${config.weatherEntity === entityId ? ' person--on' : ''}`}
                aria-pressed={config.weatherEntity === entityId}
                onClick={() => updateConfig({ weatherEntity: entityId })}
              >
                <span className="person__name">{friendlyName(entities, entityId)}</span>
                <span className="person__id">{entityId}</span>
              </button>
            ))}
            {weathers.length === 0 && (
              <div className="settings__note">geen weather-entiteiten gevonden</div>
            )}
          </div>
          <div className="settings__note">
            tik op het weerblok bovenaan voor de voorspelling
          </div>
        </MoreRow>

        <MoreRow
          name="Thema"
          meta={themeLabel}
          open={panel === 'thema'}
          onTap={() => setPanel((current) => (current === 'thema' ? null : 'thema'))}
        >
          <div className="segmented">
            {THEMES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`segmented__option${config.theme === value ? ' segmented__option--on' : ''}`}
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
          <div className="segmented">
            {PALETTES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`segmented__option${config.palette === value ? ' segmented__option--on' : ''}`}
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

        <MoreRow
          name="Instellingen"
          meta={user ? 'in Home Assistant' : 'niet gekoppeld'}
          open={panel === 'opslag'}
          onTap={() => setPanel((current) => (current === 'opslag' ? null : 'opslag'))}
        >
          <div className="settings__note">
            {user
              ? `bewaard bij je Home Assistant-account (${user.name}), niet in deze browser —` +
                ' hetzelfde dashboard op elk toestel, en wie mee inlogt op dit scherm heeft zijn eigen'
              : 'geen account gevonden — instellingen blijven lokaal tot de verbinding er is'}
          </div>
          <div className="settings__note">
            instellingen voor het hele huishouden (stroom, auto, media-presets, media per kamer)
            stel je in via de kaart zelf — bewerk de kaart in het dashboard voor de visuele editor
          </div>
        </MoreRow>
      </div>

      <button type="button" className="stale__foot" onClick={resetConfig}>
        standaardwaarden herstellen
      </button>
      <div className="settings__note">
        wist enkel jouw laag — je valt terug op de standaard van het huishouden
      </div>
    </div>
  );
}
