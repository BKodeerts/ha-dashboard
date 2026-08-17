import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/icons';

export type Tab = 'stroom' | 'energie' | 'home' | 'netwerk' | 'auto';

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'stroom', icon: 'plug', label: 'Stroom' },
  { id: 'energie', icon: 'solar', label: 'Energie' },
  { id: 'home', icon: 'home', label: 'Home' },
  { id: 'netwerk', icon: 'lan', label: 'Netwerk' },
  { id: 'auto', icon: 'car', label: 'Auto' },
];

/** Icons only, no word labels — the label lives in `aria-label`. */
export function TabBar({ active, onSelect }: { active: Tab; onSelect(tab: Tab): void }) {
  return (
    <nav className="tabbar">
      <div className="tabbar__inner">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tabbar__item${active === tab.id ? ' tabbar__item--active' : ''}`}
            aria-label={tab.label}
            aria-current={active === tab.id ? 'page' : undefined}
            onClick={() => onSelect(tab.id)}
          >
            <Icon name={tab.icon} size={21} />
          </button>
        ))}
      </div>
    </nav>
  );
}
