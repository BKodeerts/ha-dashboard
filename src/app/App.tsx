import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { personEntities } from '../config/config';
import { RoomGrid } from '../components/RoomGrid';
import { StatusPills } from '../components/StatusPills';
import { TabBar, type Tab } from '../components/TabBar';
import { Toasts } from '../components/Toasts';
import { WeatherBlock } from '../components/WeatherBlock';
import { AlarmSheet } from '../components/sheets/AlarmSheet';
import { OpeningsSheet } from '../components/sheets/OpeningsSheet';
import { PresenceSheet } from '../components/sheets/PresenceSheet';
import { RoomSheet } from '../components/sheets/RoomSheet';
import { WeatherSheet } from '../components/sheets/WeatherSheet';
import { CarView } from '../components/views/CarView';
import { EnergyView } from '../components/views/EnergyView';
import { NetworkView } from '../components/views/NetworkView';
import { SettingsView } from '../components/views/SettingsView';
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
import { collectStale } from '../ha/stale';
import { Icon } from '../ui/Icon';
import { useScheme, useThemeAttribute } from '../ui/theme';

/** Only one sheet is open at a time. */
type SheetState =
  | { kind: 'room'; id: string }
  | { kind: 'openings' }
  | { kind: 'weather' }
  | { kind: 'presence' }
  | { kind: 'alarm' }
  | null;

/**
 * Silence durations are printed to the hour, so recomputing them once a minute
 * is plenty — and it keeps `collectStale` off the entity-update path.
 */
function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function App() {
  const { backend, entities, registries, areaEntities, config, status, toasts } = useHass();

  const [sheet, setSheet] = useState<SheetState>(null);
  const [tab, setTab] = useState<Tab>('home');
  const minute = useMinute();

  const rootRef = useRef<HTMLDivElement>(null);
  const scheme = useScheme(config.theme, backend);
  useThemeAttribute(rootRef, scheme);

  const rooms = useMemo(
    () => (registries ? buildRooms(registries, areaEntities, entities, config) : []),
    [registries, areaEntities, entities, config],
  );

  const openings = useMemo(
    () => (registries ? collectOpenings(registries, areaEntities, entities) : { open: [], total: 0 }),
    [registries, areaEntities, entities],
  );

  const stale = useMemo(
    () => (registries ? collectStale(registries, entities, minute) : []),
    [registries, entities, minute],
  );

  const alarm = useMemo(() => alarmInfo(entities, config), [entities, config]);
  const presence = useMemo(() => presenceInfo(entities, config), [entities, config]);
  const weather = useMemo(() => weatherInfo(entities, config), [entities, config]);
  const power = useMemo(() => powerInfo(entities, config), [entities, config]);
  const persons = useMemo(() => personEntities(entities), [entities]);
  const forecast = useForecast(weather.entityId);

  const closeSheet = useCallback(() => setSheet(null), []);

  // Switching tab — or opening the gear — dismisses whatever sheet is open.
  const selectTab = useCallback((next: Tab) => {
    setTab(next);
    setSheet(null);
  }, []);

  const openRoom = useCallback((id: string) => setSheet({ kind: 'room', id }), []);

  const activeRoom =
    sheet?.kind === 'room' ? rooms.find((room) => room.id === sheet.id) : undefined;

  // One root element in both states, so the theme ref never goes missing.
  if (!registries) {
    return (
      <div className="app" ref={rootRef} data-theme={scheme}>
        <div className="centered">
          {status === 'disconnected' ? 'Verbinding verbroken' : 'Verbinden met Home Assistant…'}
        </div>
      </div>
    );
  }

  return (
    <div className="app" ref={rootRef} data-theme={scheme}>
      {status !== 'connected' && (
        <div className="banner">
          {status === 'disconnected' ? 'Verbinding verbroken — opnieuw proberen…' : 'Verbinden…'}
        </div>
      )}

      <div className="app__main">
        <WeatherBlock
          weather={weather}
          forecast={forecast}
          onOpen={() => setSheet({ kind: 'weather' })}
        />

        <StatusPills
          alarm={alarm}
          openings={openings}
          presence={presence}
          onOpenAlarm={() => setSheet({ kind: 'alarm' })}
          onOpenOpenings={() => setSheet({ kind: 'openings' })}
          onOpenPresence={() => setSheet({ kind: 'presence' })}
        />

        {tab === 'home' ? (
          <>
            <div className="section-head">
              <span className="section-head__title">Kamers</span>
              <button
                type="button"
                className="section-head__gear"
                onClick={() => selectTab('meer')}
                aria-label="Instellingen"
              >
                <Icon name="cog" size={19} />
              </button>
            </div>

            <div className="scroll">
              <RoomGrid rooms={rooms} onOpenRoom={openRoom} />
            </div>
          </>
        ) : tab === 'energie' ? (
          <EnergyView power={power} />
        ) : tab === 'netwerk' ? (
          <NetworkView stale={stale} />
        ) : tab === 'auto' ? (
          <CarView />
        ) : (
          <SettingsView
            rooms={rooms}
            persons={persons}
            onOpenWeather={() => setSheet({ kind: 'weather' })}
          />
        )}
      </div>

      <TabBar
        active={tab}
        state={{ stale: stale.length > 0, ...(power.net !== undefined ? { net: power.net } : {}) }}
        onSelect={selectTab}
      />

      <Toasts toasts={toasts} />

      {activeRoom && <RoomSheet room={activeRoom} onClose={closeSheet} />}
      {sheet?.kind === 'openings' && <OpeningsSheet openings={openings} onClose={closeSheet} />}
      {sheet?.kind === 'weather' && (
        <WeatherSheet weather={weather} forecast={forecast} onClose={closeSheet} />
      )}
      {sheet?.kind === 'presence' && <PresenceSheet presence={presence} onClose={closeSheet} />}
      {sheet?.kind === 'alarm' && <AlarmSheet alarm={alarm} onClose={closeSheet} />}
    </div>
  );
}
