import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { personEntities } from '../config/config';
import { RoomGrid } from '../components/RoomGrid';
import { StatusPills } from '../components/StatusPills';
import { TabBar, type Tab } from '../components/TabBar';
import { Toasts } from '../components/Toasts';
import { TopLine } from '../components/TopLine';
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
  currentPerson,
  powerInfo,
  trackedPeople,
  weatherInfo,
} from '../ha/selectors';
import { collectStale } from '../ha/stale';
import { Icon } from '../ui/Icon';
import { useScheme, useThemeAttribute } from '../ui/theme';

/**
 * Only one sheet is open at a time. The alarm no longer has one: its chip in
 * the header carries a picker instead, so arming is one tap rather than a sheet
 * and a mode button.
 */
type SheetState =
  | { kind: 'room'; id: string }
  | { kind: 'openings' }
  | { kind: 'weather' }
  | { kind: 'person'; id: string }
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
  const { backend, entities, registries, areaEntities, user, config, status, toasts } = useHass();

  const [sheet, setSheet] = useState<SheetState>(null);
  const [tab, setTab] = useState<Tab>('home');
  /**
   * The non-favourite fold. Session only, and owned here rather than in the
   * grid so that switching tab and coming back does not silently re-collapse
   * it — the design's "resets on load" means the load, not every visit.
   */
  const [showOther, setShowOther] = useState(false);
  /**
   * The alarm chip's state picker. It lives here rather than in the chip
   * because the header stays mounted across every tab, and switching tab has
   * to put a floating picker away.
   */
  const [alarmPickerOpen, setAlarmPickerOpen] = useState(false);
  const minute = useMinute();

  const rootRef = useRef<HTMLDivElement>(null);
  const scheme = useScheme(config.theme, backend);
  useThemeAttribute(rootRef, scheme, config.palette);

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
  const me = useMemo(() => currentPerson(entities, user), [entities, user]);
  const people = useMemo(() => trackedPeople(entities, config, me), [entities, config, me]);
  const weather = useMemo(() => weatherInfo(entities, config), [entities, config]);
  const power = useMemo(() => powerInfo(entities, config), [entities, config]);
  const persons = useMemo(() => personEntities(entities), [entities]);
  const forecast = useForecast(weather.entityId);

  const closeSheet = useCallback(() => setSheet(null), []);

  // Switching tab — or opening the gear — puts away whatever is floating over
  // the screen: the open sheet, and the alarm chip's picker.
  const selectTab = useCallback((next: Tab) => {
    setTab(next);
    setSheet(null);
    setAlarmPickerOpen(false);
  }, []);

  const openRoom = useCallback((id: string) => setSheet({ kind: 'room', id }), []);

  const activeRoom =
    sheet?.kind === 'room' ? rooms.find((room) => room.id === sheet.id) : undefined;

  // One root element in both states, so the theme ref never goes missing.
  if (!registries) {
    return (
      <div className="app" ref={rootRef} data-theme={scheme} data-palette={config.palette}>
        <div className="centered">
          {status === 'disconnected' ? 'Verbinding verbroken' : 'Verbinden met Home Assistant…'}
        </div>
      </div>
    );
  }

  return (
    <div className="app" ref={rootRef} data-theme={scheme} data-palette={config.palette}>
      {status !== 'connected' && (
        <div className="banner">
          {status === 'disconnected' ? 'Verbinding verbroken — opnieuw proberen…' : 'Verbinden…'}
        </div>
      )}

      <div className="app__main">
        <TopLine
          weather={weather}
          forecast={forecast}
          alarm={alarm}
          alarmPickerOpen={alarmPickerOpen}
          onAlarmPickerChange={setAlarmPickerOpen}
          people={people}
          onOpenWeather={() => setSheet({ kind: 'weather' })}
          onOpenPerson={(id) => setSheet({ kind: 'person', id })}
        />

        <StatusPills
          openings={openings}
          onOpenOpenings={() => setSheet({ kind: 'openings' })}
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
              <RoomGrid
                rooms={rooms}
                showOther={showOther}
                onToggleOther={() => setShowOther((open) => !open)}
                onOpenRoom={openRoom}
              />
            </div>
          </>
        ) : tab === 'energie' ? (
          <EnergyView power={power} />
        ) : tab === 'netwerk' ? (
          <NetworkView stale={stale} />
        ) : tab === 'auto' ? (
          <CarView />
        ) : (
          <SettingsView rooms={rooms} persons={persons} me={me} />
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
      {sheet?.kind === 'person' && (
        <PresenceSheet entityId={sheet.id} onClose={closeSheet} />
      )}
    </div>
  );
}
