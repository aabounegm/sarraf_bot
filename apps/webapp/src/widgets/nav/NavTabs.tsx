import { useLocalization } from '@fluent/react';
import { useNavigate } from '@tanstack/react-router';
import { SegmentedControl } from '@telegram-apps/telegram-ui';

const TABS = [
  { to: '/', id: 'nav-offers' },
  { to: '/my', id: 'nav-my-offers' },
  { to: '/alerts', id: 'nav-alerts' },
] as const;

/** The three top-level screens, on each of the three. */
export function NavTabs({ active }: { active: (typeof TABS)[number]['to'] }) {
  const { l10n } = useLocalization();
  const navigate = useNavigate();
  return (
    <div style={{ padding: 8 }}>
      <SegmentedControl>
        {TABS.map((tab) => (
          <SegmentedControl.Item
            key={tab.to}
            selected={tab.to === active}
            onClick={() => navigate({ to: tab.to })}
          >
            {l10n.getString(tab.id)}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl>
    </div>
  );
}
