import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useLayout } from '../../app/layout';
import { TINT_CHOICES, weatherEntities } from '../../config/config';
import { useHass } from '../../ha/HassProvider';
import { friendlyName, type PersonInfo } from '../../ha/selectors';
import { toggleInputBoolean } from '../../ha/services';
import type { Room } from '../../ha/types';
import { Icon } from '../../ui/Icon';

/** One expandable row in the "Overig" card. */
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
    <div className="more__item">
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
    </div>
  );
}

const DEFAULT_KIOSK_ENTITY = 'input_boolean.kiosk_mode';

/**
 * One room in "Kamers sorteren": its tint (tap the dot for a picker — v7
 * folded the old "Tints per kamer" panel into these rows, v8 swapped cycling
 * for a popover), its favourite star, and a way to
 * move it. On a phone that is two arrows; from 760px it is dragging the row
 * by its grip, which HTML5 drag doesn't support on touch — so the arrows
 * stay the touch and keyboard path.
 */
function OrderRow({
  room,
  drag,
  dragging,
  canUp,
  canDown,
  onUp,
  onDown,
  tintOpen,
  onTintToggle,
  onTintPick,
  onFavourite,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  room: Room;
  drag: boolean;
  dragging: boolean;
  canUp: boolean;
  canDown: boolean;
  onUp(): void;
  onDown(): void;
  tintOpen: boolean;
  onTintToggle(): void;
  onTintPick(tint: string): void;
  onFavourite(): void;
  onDragStart(event: DragEvent): void;
  onDragOver(event: DragEvent): void;
  onDragEnd(event: DragEvent): void;
}) {
  return (
    <div
      className={`order__row${dragging ? ' order__row--dragging' : ''}${
        room.favourite ? '' : ' order__row--other'
      }`}
      draggable={drag}
      onDragStart={drag ? onDragStart : undefined}
      onDragOver={drag ? onDragOver : undefined}
      onDrop={drag ? onDragEnd : undefined}
      onDragEnd={drag ? onDragEnd : undefined}
    >
      {drag && <Icon name="dragVertical" size={16} className="order__grip" />}
      <div className="order__names">
        <div className="order__name">{room.name}</div>
        <div className="order__id">{room.id}</div>
      </div>
      <div className="order__tint" data-tint-picker="">
        <button
          type="button"
          className={`order__btn order__btn--tint${tintOpen ? ' order__btn--tint-open' : ''}`}
          aria-label={`${room.name}: tint kiezen`}
          aria-expanded={tintOpen}
          onClick={onTintToggle}
        >
          <span className="order__swatch" style={{ background: room.tint }} />
        </button>
        {tintOpen && (
          <div className="tint-picker" role="group" aria-label={`Tint voor ${room.name}`}>
            {TINT_CHOICES.map((tint) => {
              const current = tint === room.tint;
              return (
                <button
                  key={tint}
                  type="button"
                  className={`tint-picker__option${current ? ' tint-picker__option--on' : ''}`}
                  aria-pressed={current}
                  aria-label={tint}
                  onClick={() => onTintPick(tint)}
                >
                  <span className="tint-picker__dot" style={{ background: tint }} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className={`order__btn order__btn--fav${room.favourite ? ' order__btn--fav-on' : ''}`}
        aria-label={`${room.name} ${room.favourite ? 'geen favoriet' : 'favoriet'}`}
        aria-pressed={room.favourite}
        onClick={onFavourite}
      >
        <Icon name="star" size={17} />
      </button>
      {!drag && (
        <>
          <button
            type="button"
            className="order__btn order__btn--move"
            aria-label={`${room.name} omhoog`}
            disabled={!canUp}
            onClick={onUp}
          >
            <Icon name="chevronUp" size={17} />
          </button>
          <button
            type="button"
            className="order__btn order__btn--move"
            aria-label={`${room.name} omlaag`}
            disabled={!canDown}
            onClick={onDown}
          >
            <Icon name="chevronDown" size={17} />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * The fourth tab. Who you follow at the top of the home screen, kiosk mode,
 * the odds and ends, and the room order. From 760px it splits: the first
 * three on the left, the room order on the right.
 *
 * v8 dropped "Wie ben jij" (the account still decides who you are — see
 * `currentPerson` — it just isn't shown) and the Thema/Kleuren rows: the
 * dashboard follows the HA theme.
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
  const { entities, config, updateConfig, resetConfig, user, call } = useHass();
  const { split } = useLayout();
  const [panel, setPanel] = useState<'weer' | 'opslag' | null>(null);
  /** The area whose tint picker is open — one at a time. Switching tab
   * unmounts this view, which closes it too. */
  const [tintPicker, setTintPicker] = useState<string | null>(null);

  // Any tap outside the open picker puts it away. Capture phase, so it runs
  // before whatever the tap lands on. `composedPath`, not `event.target`: the
  // dashboard lives in a shadow root, and the document only sees the host.
  useEffect(() => {
    if (!tintPicker) return;
    const inPicker = (event: Event) =>
      event
        .composedPath()
        .some((node) => node instanceof Element && node.hasAttribute('data-tint-picker'));
    const onDown = (event: PointerEvent) => {
      if (!inPicker(event)) setTintPicker(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setTintPicker(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [tintPicker]);

  const kioskEntity = config.kioskEntity ?? DEFAULT_KIOSK_ENTITY;
  const kioskOn = entities[kioskEntity]?.state === 'on';
  const hasKiosk = entities[kioskEntity] !== undefined;

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

  /* ── ordering ──────────────────────────────────────────────────────────
     Rooms arrive in display order, favourites first. A move only ever stays
     inside its own group — pushing a plain room past a favourite would look
     like nothing happened, because the grid re-groups. Dragging reorders a
     local copy live on every `dragover` and writes it once, on drop. */

  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; order: string[] } | null>(null);

  const byId = new Map(rooms.map((room) => [room.id, room]));
  const order = dragOrder ?? rooms.map((room) => room.id);
  const ordered = order.map((id) => byId.get(id)).filter((room): room is Room => !!room);
  const favourites = ordered.filter((room) => room.favourite);
  const others = ordered.filter((room) => !room.favourite);

  const move = (roomId: string, delta: -1 | 1) => {
    const ids = rooms.map((room) => room.id);
    const from = ids.indexOf(roomId);
    const to = from + delta;
    const a = rooms[from];
    const b = rooms[to];
    if (!a || !b || a.favourite !== b.favourite) return;
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    updateConfig({ roomOrder: ids });
  };

  const dragStart = (roomId: string) => (event: DragEvent) => {
    event.dataTransfer.effectAllowed = 'move';
    try {
      event.dataTransfer.setData('text/plain', roomId);
    } catch {
      // Some browsers refuse data on a synthetic transfer; the drag still works.
    }
    const initial = rooms.map((room) => room.id);
    dragRef.current = { id: roomId, order: initial };
    setDragId(roomId);
    setDragOrder(initial);
  };

  const dragOver = (overId: string) => (event: DragEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dragged = byId.get(drag.id);
    const over = byId.get(overId);
    if (!dragged || !over || dragged.favourite !== over.favourite) return;
    event.preventDefault();
    if (drag.id === overId) return;
    const next = drag.order.filter((id) => id !== drag.id);
    next.splice(drag.order.indexOf(overId), 0, drag.id);
    drag.order = next;
    setDragOrder(next);
  };

  // `drop` and `dragend` both land here; the ref makes the second a no-op.
  const dragEnd = (event: DragEvent) => {
    event.preventDefault();
    const drag = dragRef.current;
    dragRef.current = null;
    setDragId(null);
    setDragOrder(null);
    if (!drag) return;
    const before = rooms.map((room) => room.id);
    if (drag.order.some((id, index) => id !== before[index])) {
      updateConfig({ roomOrder: drag.order });
    }
  };

  const orderRows = (group: Room[]) =>
    group.map((room, index) => (
      <OrderRow
        key={room.id}
        room={room}
        drag={split}
        dragging={dragId === room.id}
        canUp={index > 0}
        canDown={index < group.length - 1}
        onUp={() => move(room.id, -1)}
        onDown={() => move(room.id, 1)}
        tintOpen={tintPicker === room.id}
        onTintToggle={() => setTintPicker((open) => (open === room.id ? null : room.id))}
        onTintPick={(tint) => {
          updateConfig({ areaTint: { [room.id]: tint } });
          setTintPicker(null);
        }}
        onFavourite={() => toggleFavourite(room.id)}
        onDragStart={dragStart(room.id)}
        onDragOver={dragOver(room.id)}
        onDragEnd={dragEnd}
      />
    ));

  const weatherLabel = config.weatherEntity ?? 'niet gekozen';
  const followable = persons.filter((entityId) => entityId !== me.entityId);

  return (
    <div className="view">
      <div className="settings">
        <div className="settings__col">
          <div className="settings__section">
            <div className="settings__label">Wie volg je bovenaan</div>
            <div className="radio-list" role="radiogroup" aria-label="Wie volg je bovenaan">
              {followable.map((entityId) => {
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
              {followable.length === 0 && (
                <div className="settings__note">geen andere person-entiteiten gevonden</div>
              )}
            </div>
            <div className="settings__note">tik nogmaals om niemand te volgen</div>
          </div>

          {hasKiosk && (
            <div className="settings__section">
              <div className="settings__label">Scherm</div>
              <button
                type="button"
                className="switch-row"
                role="switch"
                aria-checked={kioskOn}
                onClick={() => void call(toggleInputBoolean(kioskEntity, entities))}
              >
                <span className="switch-row__names">
                  <span className="switch-row__name">Kioskmodus</span>
                  <span className="switch-row__id">{kioskEntity}</span>
                </span>
                <span className={`switch${kioskOn ? ' switch--on' : ''}`} />
              </button>
              <div className="settings__note">
                {kioskOn
                  ? 'HA-balk en zijmenu verborgen · deze tab blijft bereikbaar'
                  : 'verbergt HA-balk en zijmenu op dit scherm'}
              </div>
            </div>
          )}

          <div className="settings__section">
            <div className="settings__label">Overig</div>

            <div className="more">
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
                name="Opslag"
                meta={user ? 'bij je Home Assistant-account' : 'niet gekoppeld'}
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
                  instellingen voor het hele huishouden (stroom, media-presets, media per kamer)
                  stel je in via de kaart zelf — bewerk de kaart in het dashboard voor de visuele
                  editor
                </div>
              </MoreRow>
            </div>

            <button type="button" className="settings__reset" onClick={resetConfig}>
              standaardwaarden herstellen
            </button>
            <div className="settings__note">
              wist enkel jouw laag — je valt terug op de standaard van het huishouden
            </div>
          </div>
        </div>

        <div className="settings__col">
          <div className="settings__section">
            <div className="settings__label-row">
              <div className="settings__label">Kamers sorteren</div>
              {split && <div className="settings__note">sleep om te sorteren</div>}
            </div>
            <div className="order">{orderRows(favourites)}</div>
            {others.length > 0 && (
              <>
                <div className="settings__label settings__label--sub">Niet op home</div>
                <div className="order">{orderRows(others)}</div>
              </>
            )}
            <div className="settings__note">
              tik de stip om een tint te kiezen · ster = op home
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
