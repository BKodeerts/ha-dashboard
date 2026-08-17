import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/icons';

/**
 * `meer` is the settings screen behind the gear. It is a view like any other —
 * it just has no tab of its own, so none of the four ever shows as active while
 * it is open.
 */
export type Tab = 'home' | 'energie' | 'netwerk' | 'auto' | 'meer';

export interface TabBarState {
  /** Positive = exporting to the grid. `undefined` when there is no sensor. */
  net?: number;
  /** Any device silent for over 24 h — the Netwerk tab grows a dot. */
  stale: boolean;
}

/**
 * Icons only; the label lives in `aria-label`. Two of the four say something
 * about the house regardless of which tab is selected: Energie shows the
 * direction the meter is running, and Netwerk warns while anything is silent.
 */
export function TabBar({
  active,
  state,
  onSelect,
}: {
  active: Tab;
  state: TabBarState;
  onSelect(tab: Tab): void;
}) {
  const exporting = state.net !== undefined && state.net > 0;
  const importing = state.net !== undefined && state.net < 0;

  const tabs: { id: Tab; icon: IconName; label: string; tone?: string; dot?: boolean }[] = [
    { id: 'home', icon: 'home', label: 'Home' },
    {
      id: 'energie',
      icon: importing ? 'plug' : 'solar',
      label: exporting ? 'Energie · injectie' : importing ? 'Energie · afname' : 'Energie',
      ...(exporting
        ? { tone: 'tabbar__item--export' }
        : importing
          ? { tone: 'tabbar__item--import' }
          : {}),
    },
    {
      id: 'netwerk',
      icon: 'lan',
      label: state.stale ? 'Netwerk · stille apparaten' : 'Netwerk',
      ...(state.stale ? { tone: 'tabbar__item--stale', dot: true } : {}),
    },
    { id: 'auto', icon: 'car', label: 'Auto' },
  ];

  return (
    <nav className="tabbar">
      <div className="tabbar__inner">
        {tabs.map((tab) => {
          const current = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={[
                'tabbar__item',
                current ? 'tabbar__item--active' : '',
                tab.tone ?? '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={tab.label}
              aria-current={current ? 'page' : undefined}
              onClick={() => onSelect(tab.id)}
            >
              <Icon name={tab.icon} size={24} />
              {tab.dot && <span className="tabbar__dot" />}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
