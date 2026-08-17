import { useState } from 'react';
import { useHass } from '../../ha/HassProvider';
import type { AlarmInfo } from '../../ha/selectors';
import { alarmCommand, type AlarmAction } from '../../ha/services';
import { Icon } from '../../ui/Icon';
import { Sheet, SheetClose } from '../Sheet';

const MODES: { action: AlarmAction; label: string; states: string[] }[] = [
  { action: 'disarm', label: 'Uit', states: ['disarmed'] },
  { action: 'arm_home', label: 'Thuis', states: ['armed_home'] },
  { action: 'arm_away', label: 'Afwezig', states: ['armed_away', 'armed_vacation'] },
];

/**
 * The prototype cycled the alarm on tap; production arms and disarms for real,
 * so this asks for the code the panel declares it needs.
 */
export function AlarmSheet({ alarm, onClose }: { alarm: AlarmInfo; onClose(): void }) {
  const { call } = useHass();
  const [code, setCode] = useState('');

  const needsCode = (action: AlarmAction): boolean => {
    if (!alarm.codeFormat) return false;
    return action === 'disarm' ? true : alarm.codeArmRequired;
  };

  const run = (action: AlarmAction) => {
    if (!alarm.entityId) return;
    void call(alarmCommand(alarm.entityId, action, needsCode(action) ? code : undefined));
    setCode('');
    onClose();
  };

  return (
    <Sheet onClose={onClose} labelledBy="alarm-sheet-title" wideGap>
      <div className="sheet__head">
        <div className={`sheet__tile${alarm.attention ? ' sheet__tile--warn' : ''}`}>
          <Icon name={alarm.state === 'disarmed' ? 'shieldOff' : 'shieldHome'} size={18} />
        </div>
        <div className="sheet__titles">
          <div className="sheet__title" id="alarm-sheet-title">
            Alarm
          </div>
          <div className="sheet__subtitle">{alarm.state.replace(/_/g, ' ')}</div>
        </div>
        <SheetClose onClose={onClose} />
      </div>

      {alarm.codeFormat && (
        <div className="alarm__code">
          <span className="settings__label">Code</span>
          <input
            type="password"
            inputMode={alarm.codeFormat === 'number' ? 'numeric' : 'text'}
            autoComplete="off"
            value={code}
            aria-label="Alarmcode"
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
      )}

      <div className="alarm__modes">
        {MODES.map((mode) => {
          const current = mode.states.includes(alarm.state);
          const blocked = needsCode(mode.action) && code.length === 0;
          return (
            <button
              key={mode.action}
              type="button"
              className={`alarm__mode${current ? ' alarm__mode--current' : ''}`}
              disabled={blocked || current}
              onClick={() => run(mode.action)}
            >
              <Icon name={mode.action === 'disarm' ? 'shieldOff' : 'shieldHome'} size={20} />
              {mode.label}
            </button>
          );
        })}
      </div>

      <div className="sheet__footnote">{alarm.entityId ?? 'geen alarm_control_panel'}</div>
    </Sheet>
  );
}
