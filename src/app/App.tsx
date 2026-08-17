import { useCallback, useMemo, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { LovelaceView } from '../components/LovelaceView';
import { RoomGrid } from '../components/RoomGrid';
import { StatusPills } from '../components/StatusPills';
import { TabBar, type Tab } from '../components/TabBar';
import { Toasts } from '../components/Toasts';
import { AlarmSheet } from '../components/sheets/AlarmSheet';
import { OpeningsSheet } from '../components/sheets/OpeningsSheet';
import { PowerSheet } from '../components/sheets/PowerSheet';
import { PresenceSheet } from '../components/sheets/PresenceSheet';
import { RoomSheet } from '../components/sheets/RoomSheet';
import { SettingsSheet } from '../components/sheets/SettingsSheet';
import { WeatherSheet } from '../components/sheets/WeatherSheet';
import { useHass } from '../ha/HassProvider';
import { useForecast } from '../ha/useForecast';
import {
  alarmInfo,
  buildRooms,
  collectOpenings,
  powerInfo,
  presenceInfo,
  weatherInfo,
} from '../ha/selectors';
import { useScheme, useThemeAttribute } from '../ui/theme';

/** Only one sheet is open at a time. */
type SheetState =
  | { kind: 'room'; id: string }
  | { kind: 'openings' }
  | { kind: 'weather' }
  | { kind: 'power' }
  | { kind: 'presence' }
  | { kind: 'alarm' }
  | { kind: 'settings' }
  | null;

export function App() {
  const { backend, entities, registries, areaEntities, config, status, toasts } = useHass();

  const [sheet, setSheet] = useState<SheetState>(null);
  const [showOthers, setShowOthers] = useState(false);
  const [tab, setTab] = useState<Tab>('home');

  const rootRef = useRef<HTMLDivElement>(null);
  const scheme = useScheme(config.theme, backend);
  useThemeAttribute(rootRef, scheme);

  const rooms = useMemo(
    () => (registries ? buildRooms(registries, areaEntities, entities, config) : []),
    [registries, areaEntities, entities, config],
  );
  const favourites = useMemo(() => rooms.filter((room) => room.favourite), [rooms]);
  const others = useMemo(() => rooms.filter((room) => !room.favourite), [rooms]);

  const openings = useMemo(
    () =>
      registries
        ? collectOpenings(registries, areaEntities, entities)
        : { open: [], total: 0 },
    [registries, areaEntities, entities],
  );

  const alarm = useMemo(() => alarmInfo(entities, config), [entities, config]);
  const presence = useMemo(() => presenceInfo(entities, config), [entities, config]);
  const weather = useMemo(() => weatherInfo(entities, config), [entities, config]);
  const power = useMemo(() => powerInfo(entities, config), [entities, config]);
  const forecast = useForecast(weather.entityId);

  const closeSheet = useCallback(() => {
    setSheet(null);
    // The power sheet is what the `stroom` tab opens; dismissing it returns home.
    setTab((current) => (current === 'stroom' ? 'home' : current));
  }, []);

  const selectTab = useCallback((next: Tab) => {
    setTab(next);
    setSheet(next === 'stroom' ? { kind: 'power' } : null);
  }, []);

  const openRoom = useCallback((id: string) => setSheet({ kind: 'room', id }), []);

  const activeRoom =
    sheet?.kind === 'room' ? rooms.find((room) => room.id === sheet.id) : undefined;

  const showHome = tab === 'home' || tab === 'stroom';

  // One root element in both states, so the theme ref never goes missing.
  if (!registries) {
    return (
      <div
        className="app"
        ref={rootRef}
        data-theme={scheme}
        style={{ '--accent': config.accent } as React.CSSProperties}
      >
        <div className="centered">
          {status === 'disconnected' ? 'Verbinding verbroken' : 'Verbinden met Home Assistant…'}
        </div>
      </div>
    );
  }

  return (
    <div
      className="app"
      ref={rootRef}
      data-theme={scheme}
      style={{ '--accent': config.accent } as React.CSSProperties}
    >
      {status !== 'connected' && (
        <div className="banner">
          {status === 'disconnected' ? 'Verbinding verbroken — opnieuw proberen…' : 'Verbinden…'}
        </div>
      )}

      <div className="app__main">
        <Header
          weather={weather}
          forecast={forecast}
          onOpenWeather={() => setSheet({ kind: 'weather' })}
        />

        <StatusPills
          alarm={alarm}
          openings={openings}
          presence={presence}
          onOpenAlarm={() => setSheet({ kind: 'alarm' })}
          onOpenOpenings={() => setSheet({ kind: 'openings' })}
          onOpenPresence={() => setSheet({ kind: 'presence' })}
        />

        {showHome ? (
          <>
            <div className="section-head">
              <span className="section-head__title">Kamers</span>
              <button
                type="button"
                className="section-head__meta"
                onClick={() => setSheet({ kind: 'settings' })}
                aria-label="Instellingen"
              >
                {`${favourites.length} favoriet · ${rooms.length} totaal`}
              </button>
            </div>

            <div className="scroll">
              <RoomGrid
                favourites={favourites}
                others={others}
                showOthers={showOthers}
                onToggleOthers={() => setShowOthers((value) => !value)}
                onOpenRoom={openRoom}
              />
            </div>
          </>
        ) : tab === 'energie' ? (
          <LovelaceView
            cards={config.lovelace.energy}
            icon="solar"
            emptyHint="Stel lovelace.energy in om het energy-dashboard hier te tonen"
          />
        ) : tab === 'netwerk' ? (
          <LovelaceView
            cards={config.lovelace.netwerk}
            icon="lan"
            emptyHint="Stel lovelace.netwerk in om hier kaarten te tonen"
          />
        ) : (
          <LovelaceView
            cards={config.lovelace.auto}
            icon="car"
            emptyHint="Stel lovelace.auto in om hier kaarten te tonen"
          />
        )}
      </div>

      <TabBar active={tab} onSelect={selectTab} />

      <Toasts toasts={toasts} />

      {activeRoom && <RoomSheet room={activeRoom} onClose={closeSheet} />}
      {sheet?.kind === 'openings' && <OpeningsSheet openings={openings} onClose={closeSheet} />}
      {sheet?.kind === 'weather' && (
        <WeatherSheet weather={weather} forecast={forecast} onClose={closeSheet} />
      )}
      {sheet?.kind === 'power' && <PowerSheet power={power} onClose={closeSheet} />}
      {sheet?.kind === 'presence' && <PresenceSheet presence={presence} onClose={closeSheet} />}
      {sheet?.kind === 'alarm' && <AlarmSheet alarm={alarm} onClose={closeSheet} />}
      {sheet?.kind === 'settings' && <SettingsSheet rooms={rooms} onClose={closeSheet} />}
    </div>
  );
}
