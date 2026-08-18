import { useEffect, useRef, useState } from 'react';
import { useHass } from '../ha/HassProvider';
import type { AlarmInfo, AlarmMode } from '../ha/selectors';
import { alarmCommand } from '../ha/services';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/icons';

/** The glyph each treatment wears. Only `arming` and `armed_away` share one. */
const TONE_ICONS: Record<AlarmInfo['tone'], IconName> = {
  disarmed: 'shieldOff',
  arming: 'shieldSolid',
  away: 'shieldSolid',
  night: 'shieldHome',
};

/**
 * The alarm, as of v4: an icon-only chip beside the person chips, with its own
 * floating state picker.
 *
 * It left the pill row for two reasons. The row now has one job — what is open —
 * and can promise one line at any label length; and the alarm needed the same
 * treatment the climate row got in v3, because it has the same problem. Every
 * arm or disarm is a command a panel has to acknowledge, so nothing here
 * cycles: the chip opens the picker, and only a pick sends anything.
 *
 * The state is carried by the glyph and a 6px dot, with no word at all. During
 * `arming` — HA's own report while the exit delay runs — the dot pulses, and the
 * chip leaves that state when the panel says so, not on a timer of ours.
 */
export function AlarmChip({
  alarm,
  open,
  onOpenChange,
}: {
  alarm: AlarmInfo;
  /**
   * Whether the picker is showing. Owned by <App> rather than here, because
   * switching tab has to close it and the header — chip included — stays
   * mounted across every tab.
   */
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const { call } = useHass();
  /** The mode waiting on a code, when the panel demands one. */
  const [pending, setPending] = useState<AlarmMode | null>(null);
  const [code, setCode] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const close = () => {
    onOpenChange(false);
    setPending(null);
    setCode('');
  };

  // A picker that only closes on its own chip is a picker left open behind a
  // tap that meant something else.
  useEffect(() => {
    if (!open) return;

    const onDown = (event: PointerEvent) => {
      // `composedPath`, not `event.target`: this listener is on the document
      // and the whole dashboard lives in a shadow root, so `target` is
      // retargeted to the host element. Testing that would report *every*
      // pointerdown as outside — including the ones on the picker's own
      // options, which would close it out from under the tap that picked one.
      const wrap = wrapRef.current;
      if (wrap && !event.composedPath().includes(wrap)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (pending) codeRef.current?.focus();
  }, [pending]);

  if (!alarm.entityId) return null;
  const entityId = alarm.entityId;

  /** Disarming always needs the code; arming only when the panel says so. */
  const needsCode = (mode: AlarmMode): boolean =>
    alarm.codeFormat !== undefined && (mode.action === 'disarm' || alarm.codeArmRequired);

  const send = (mode: AlarmMode, withCode?: string) => {
    close();
    void call(alarmCommand(entityId, mode.action, withCode));
  };

  const pick = (mode: AlarmMode, active: boolean) => {
    // Re-sending the state the panel is already in is a round trip for nothing.
    if (active) {
      close();
      return;
    }
    // Prompt here rather than firing a call the panel is certain to reject.
    if (needsCode(mode)) {
      setPending(mode);
      setCode('');
      return;
    }
    send(mode);
  };

  return (
    <div className="alarm-chip" ref={wrapRef}>
      <button
        type="button"
        className={`alarm-chip__face alarm-chip__face--${alarm.tone}`}
        aria-label={alarm.label}
        aria-expanded={open}
        onClick={() => (open ? close() : onOpenChange(true))}
      >
        <Icon name={TONE_ICONS[alarm.tone]} size={17} />
        <span className={`alarm-chip__dot${alarm.pulsing ? ' alarm-chip__dot--pulsing' : ''}`} />
      </button>

      {open && (
        <div className="picker picker--alarm" role="group" aria-label="Alarm">
          {pending ? (
            <form
              className="picker__code"
              onSubmit={(event) => {
                event.preventDefault();
                if (code.length > 0) send(pending, code);
              }}
            >
              <input
                ref={codeRef}
                type="password"
                inputMode={alarm.codeFormat === 'number' ? 'numeric' : 'text'}
                autoComplete="off"
                value={code}
                aria-label={`Code voor ${pending.label}`}
                placeholder={pending.label}
                onChange={(event) => setCode(event.target.value)}
              />
              <button
                type="submit"
                className="picker__option picker__option--on picker__option--away"
                disabled={code.length === 0}
              >
                Ok
              </button>
            </form>
          ) : (
            alarm.modes.map((mode) => {
              // `arming` is on its way to whatever was picked; the design reads
              // the away option as active through it.
              const active =
                mode.states.includes(alarm.state) ||
                (alarm.pulsing && mode.action === 'arm_away');
              return (
                <button
                  key={mode.action}
                  type="button"
                  className={`picker__option picker__option--${mode.tone}${
                    active ? ' picker__option--on' : ''
                  }`}
                  aria-pressed={active}
                  onClick={() => pick(mode, active)}
                >
                  {mode.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
